#!/usr/bin/env node
import { Command } from 'commander';
import { loadEnvFile } from './util/env.js';
import { parseFindings, renderAuditReport } from './github/review.js';

import { execa } from 'execa';
import type { ProviderId } from './providers/types.js';
import { createLLMClient } from './providers/index.js';
import { runAgent, DEFAULT_MAX_OUTPUT_TOKENS } from './agent/loop.js';
import { editToolset, reviewToolset, selectTools } from './agent/tools/registry.js';
import { auditSystemPrompt, fixSystemPrompt, mentionSystemPrompt } from './agent/prompts.js';
import { applySkill, renderSkillList, resolveSkills } from './agent/skills.js';
import { createWorkspaceScanner } from './agent/tools/security.js';
import { runSetup } from './setup.js';
import { buildDoctorReport, renderDoctorReport } from './doctor.js';
import { startDashboard } from './usage/serve.js';
import { addAccount, changePassword, deleteAccount, renderAccounts } from './usage/accounts.js';
import { loadCases, runSuite } from './evals/run.js';
import { renderScorecard, regressedAgainst } from './evals/score.js';
import { cliRun } from './usage/cli.js';
import { SUPPORTED_PROVIDERS } from './providers/index.js';
import { estimateCost, formatCost } from './util/cost.js';

// Before anything reads process.env: a machine configured through .env should
// work from the command line the same way it works under the App.
loadEnvFile();

const program = new Command();
program
  .name('forge')
  .description('ShipIT Forge — autonomous GitHub coding agent')
  .version('0.1.0');

program
  .command('setup')
  .description('Interactively configure a provider + credentials, saved securely to .env')
  .action(async () => {
    await runSetup(process.cwd());
  });

/**
 * Accounts for the dashboard.
 *
 * A shared token cannot be revoked for one person and says nothing about who
 * looked. Once more than one person can reach the dashboard, it needs names.
 */
const users = program
  .command('dashboard:user')
  .alias('user')
  .description('Manage who can sign in to the usage dashboard');

const dbOption = (): string => process.env.FORGE_USAGE_DB || '.forge/usage.db';

users
  .command('add <username>')
  .description('Create an account (the password is asked for, never passed as an argument)')
  .option('--db <path>', 'Usage database file', dbOption())
  .action(async (username: string, opts: { db: string }) => {
    try {
      console.log(await addAccount(opts.db, username));
    } catch (err) {
      console.error(`✖ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

users
  .command('password <username>')
  .description('Change a password, signing out every session it had')
  .option('--db <path>', 'Usage database file', dbOption())
  .action(async (username: string, opts: { db: string }) => {
    try {
      console.log(await changePassword(opts.db, username));
    } catch (err) {
      console.error(`✖ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

users
  .command('remove <username>')
  .description('Delete an account and sign out every session it had')
  .option('--db <path>', 'Usage database file', dbOption())
  .action((username: string, opts: { db: string }) => {
    console.log(deleteAccount(opts.db, username));
  });

users
  .command('list')
  .description('Who can sign in, and when they last did')
  .option('--db <path>', 'Usage database file', dbOption())
  .action((opts: { db: string }) => {
    console.log(renderAccounts(opts.db));
  });

/**
 * Is the review any good?
 *
 * The test suite proves the code runs. This measures whether the findings are
 * worth reading — the only property anybody buys, and the one that regresses
 * silently when a prompt is edited or a model is swapped for a cheaper one.
 */
program
  .command('eval')
  .description('Score review quality against the corpus: precision, recall, and named false positives')
  .option('--cases <dir>', 'Directory of case files', 'evals/cases')
  .option('--baseline <file>', 'Fail if quality dropped against this scorecard', '')
  .option('--save-baseline <file>', 'Write this run to a file to compare against later', '')
  .action(async (opts: { cases: string; baseline: string; saveBaseline: string }) => {
    const cases = await loadCases(opts.cases);
    if (cases.length === 0) {
      console.error(`No cases in ${opts.cases}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Scoring ${cases.length} case(s) from ${opts.cases}…\n`);
    const card = await runSuite(cases);
    console.log(renderScorecard(card));

    if (opts.saveBaseline) {
      const { promises: fsp } = await import('node:fs');
      await fsp.writeFile(
        opts.saveBaseline,
        `${JSON.stringify({ precision: card.precision, recall: card.recall, f1: card.f1 }, null, 2)}\n`,
      );
      console.log(`\nBaseline written to ${opts.saveBaseline}.`);
    }

    if (opts.baseline) {
      const { promises: fsp } = await import('node:fs');
      const previous = JSON.parse(await fsp.readFile(opts.baseline, 'utf8')) as {
        precision: number;
        recall: number;
      };
      const failures = regressedAgainst(previous, card);
      if (failures.length) {
        console.error(`\n✖ Review quality dropped:\n  - ${failures.join('\n  - ')}`);
        process.exitCode = 1;
        return;
      }
      console.log('\n✓ No drop against the baseline.');
    }

    if (card.failed > 0) process.exitCode = 1;
  });

program
  .command('dashboard')
  .description('Serve the usage dashboard: every run, turn, tool call and dollar')
  .option('--db <path>', 'Usage database file', process.env.FORGE_USAGE_DB || '.forge/usage.db')
  .option('--port <n>', 'Port to listen on', process.env.FORGE_DASHBOARD_PORT || '4300')
  .option('--host <host>', 'Address to bind (loopback unless a token is set)')
  .option('--token <token>', 'Require this token on every request')
  .action(async (opts: { db: string; port: string; host?: string; token?: string }) => {
    const { url, token, generated, pruned } = await startDashboard({
      file: opts.db,
      port: Number(opts.port),
      ...(opts.host ? { host: opts.host } : {}),
      ...(opts.token ? { token: opts.token } : {}),
    });
    console.log(`\n📊 ShipIT Forge usage dashboard\n   ${url}\n`);
    console.log(
      generated
        ? `   Every route requires this token: ${token}\n   Set FORGE_DASHBOARD_TOKEN to keep the same one across restarts.\n`
        : `   Every route requires FORGE_DASHBOARD_TOKEN.\n`,
    );
    console.log(`   Reading ${opts.db}. Set FORGE_USAGE_DB=${opts.db} on the agent to record into it.`);
    if (pruned.artifacts || pruned.toolCalls) {
      console.log(`   Retention: removed ${pruned.artifacts} aged artifact(s) and ${pruned.toolCalls} old tool call(s).`);
    }
    console.log('');
  });

program
  .command('doctor')
  .description('Check which LLM providers are configured, and what each one is missing')
  .action(() => {
    const report = buildDoctorReport();
    console.log(renderDoctorReport(report));
    if (!report.activeOk) process.exitCode = 1;
  });

program
  .command('skills')
  .description('List available skills (built-ins plus any committed under .forge/skills)')
  .option('--repo <path>', 'Repository to read skills from', process.cwd())
  .action(async (opts: { repo: string }) => {
    const skills = await resolveSkills(opts.repo);
    console.log(`\n🧩 Skills available in ${opts.repo}\n`);
    console.log(renderSkillList(skills));
    console.log('\nInvoke one in a GitHub comment as `/<name>`, or with `forge run <name>`.\n');
  });

program
  .command('run')
  .description('Run a skill against a local repo — the building block for scheduled routines')
  .requiredOption('--repo <path>', 'Path to the local git repository to work in')
  .requiredOption('--skill <name>', 'Skill to run (see `forge skills`)')
  .option('--task <text>', 'Extra request passed to the skill', '')
  .option('--provider <id>', `LLM provider (${SUPPORTED_PROVIDERS.join('|')})`, 'fake')
  .option('--model <id>', 'Model id (provider-specific)')
  .option('--max-iterations <n>', 'Max agent iterations', '25')
  .option('--write', 'Allow the skill to modify files (default read-only)', false)
  .action(async (opts: {
    repo: string;
    skill: string;
    task: string;
    provider: string;
    model?: string;
    maxIterations: string;
    write?: boolean;
  }) => {
    const skills = await resolveSkills(opts.repo);
    const skill = skills.get(opts.skill.replace(/^\//, '').toLowerCase());
    if (!skill) {
      console.error(`\n❌ No skill named "${opts.skill}".\n\n${renderSkillList(skills)}\n`);
      process.exitCode = 1;
      return;
    }

    const client = createLLMClient(
      { provider: opts.provider as ProviderId, model: opts.model },
      { demoTask: opts.task || skill.name },
    );
    console.log(`\n🧩 ${skill.name} — ${skill.description}\n   repo: ${opts.repo}  provider: ${client.id}\n`);

    const base = opts.write ? editToolset() : reviewToolset();
    const track = await cliRun(client, { flow: 'routine', trigger: 'forge run', repo: opts.repo, skill: skill.name });
    const result = track.add(await runAgent({
      client,
      // A skill that reports findings needs the prompt that defines the finding
      // format; without it the model answers in prose and nothing downstream —
      // counts, issues, the dashboard — has anything to work with.
      system: applySkill(skill.reports === 'findings' ? auditSystemPrompt() : mentionSystemPrompt(), skill, opts.task),
      initialContent: [{ type: 'text', text: opts.task || `Run the ${skill.name} skill on this repository.` }],
      tools: selectTools(base, { allowed: skill.tools ?? [] }),
      limits: { maxIterations: Number(opts.maxIterations), maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS },
      cwd: opts.repo,
      ...(opts.write ? { security: await createWorkspaceScanner(opts.repo) } : {}),
      onEvent: track.listen('main', (e) => {
        if (e.type === 'tool') console.log(`   → ${e.name}`);
        if (e.type === 'compacted') console.log(`   ♻️  compacted context (${e.savedChars} chars)`);
      }),
    }));
    // A review or audit skill reports findings in its answer; parsing them here
    // is what puts a command-line run on the findings page alongside the ones
    // the App files as issues.
    const findings = parseFindings(result.finalText);
    track.findings(findings);
    track.artifact('final_text', result.finalText);
    await track.finish();

    // Render the findings rather than printing the JSON they arrived as: the
    // structure is for the recorder, the prose is for the person reading.
    const structured = skill.reports === 'findings';
    console.log(`\n${structured ? renderAuditReport(findings, 'ShipIT Forge') : result.finalText}\n`);
    console.log(`📊 ${result.iterations} iterations, stopped by: ${result.stoppedBy}`);
    console.log(`💰 ${formatCost(estimateCost(result.usage, client.model))}\n`);
  });

program
  .command('fix')
  .description('Investigate a repo and apply a fix for the given task, then show the diff.')
  .requiredOption('--repo <path>', 'Path to the local git repository to work in')
  .requiredOption('--task <text>', 'The issue/task description to address')
  .option('--provider <id>', `LLM provider (${SUPPORTED_PROVIDERS.join('|')})`, 'fake')
  .option('--model <id>', 'Model id (provider-specific)')
  .option('--max-iterations <n>', 'Max agent iterations', '25')
  .action(async (opts: { repo: string; task: string; provider: string; model?: string; maxIterations: string }) => {
    const client = createLLMClient(
      { provider: opts.provider as ProviderId, model: opts.model },
      { demoTask: opts.task },
    );

    console.log(`\n🔧 ShipIT Forge — fixing in ${opts.repo}\n   provider: ${client.id}  task: ${opts.task}\n`);

    const track = await cliRun(client, { flow: 'fix', trigger: 'forge fix', repo: opts.repo });
    const result = track.add(await runAgent({
      client,
      system: fixSystemPrompt(),
      initialContent: [{ type: 'text', text: opts.task }],
      tools: editToolset(),
      limits: { maxIterations: Number(opts.maxIterations), maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS },
      cwd: opts.repo,
      onEvent: track.listen('main', (e) => {
        if (e.type === 'tool') console.log(`   → ${e.name}(${JSON.stringify(e.args)})`);
        if (e.type === 'tool_error') console.log(`   ✗ ${e.name}: ${e.message}`);
      }),
    }));
    track.artifact('final_text', result.finalText);
    await track.finish();

    console.log(`\n💬 ${result.finalText}`);
    const cost = estimateCost(result.usage, client.model);
    console.log(`\n📊 ${result.iterations} iterations, stopped by: ${result.stoppedBy}`);
    console.log(`💰 ${formatCost(cost)}`);

    // Show what changed in the repo (including new/untracked files).
    const { stdout } = await execa('git', ['status', '--short'], { cwd: opts.repo, reject: false });
    if (stdout.trim()) {
      console.log(`\n📝 Changes (git status):\n${stdout}`);
      console.log('\nRun `git diff` in the repo to see full details.');
    } else {
      console.log('\n(no file changes detected)');
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`\n❌ ${(err as Error).message}\n`);
  process.exit(1);
});
