#!/usr/bin/env node
import { Command } from 'commander';
import { execa } from 'execa';
import type { ProviderId } from './providers/types.js';
import { createLLMClient } from './providers/index.js';
import { runAgent, DEFAULT_MAX_OUTPUT_TOKENS } from './agent/loop.js';
import { editToolset, reviewToolset, selectTools } from './agent/tools/registry.js';
import { fixSystemPrompt, mentionSystemPrompt } from './agent/prompts.js';
import { applySkill, renderSkillList, resolveSkills } from './agent/skills.js';
import { createWorkspaceScanner } from './agent/tools/security.js';
import { runSetup } from './setup.js';
import { buildDoctorReport, renderDoctorReport } from './doctor.js';
import { SUPPORTED_PROVIDERS } from './providers/index.js';
import { estimateCost, formatCost } from './util/cost.js';

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
    const result = await runAgent({
      client,
      system: applySkill(mentionSystemPrompt(), skill, opts.task),
      initialContent: [{ type: 'text', text: opts.task || `Run the ${skill.name} skill on this repository.` }],
      tools: selectTools(base, { allowed: skill.tools ?? [] }),
      limits: { maxIterations: Number(opts.maxIterations), maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS },
      cwd: opts.repo,
      ...(opts.write ? { security: await createWorkspaceScanner(opts.repo) } : {}),
      onEvent: (e) => {
        if (e.type === 'tool') console.log(`   → ${e.name}`);
        if (e.type === 'compacted') console.log(`   ♻️  compacted context (${e.savedChars} chars)`);
      },
    });

    console.log(`\n${result.finalText}\n`);
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

    const result = await runAgent({
      client,
      system: fixSystemPrompt(),
      initialContent: [{ type: 'text', text: opts.task }],
      tools: editToolset(),
      limits: { maxIterations: Number(opts.maxIterations), maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS },
      cwd: opts.repo,
      onEvent: (e) => {
        if (e.type === 'tool') console.log(`   → ${e.name}(${JSON.stringify(e.args)})`);
        if (e.type === 'tool_error') console.log(`   ✗ ${e.name}: ${e.message}`);
      },
    });

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
