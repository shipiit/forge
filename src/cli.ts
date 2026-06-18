#!/usr/bin/env node
import { Command } from 'commander';
import { execa } from 'execa';
import type { ProviderId } from './providers/types.js';
import { createLLMClient } from './providers/index.js';
import { runAgent } from './agent/loop.js';
import { editToolset } from './agent/tools/registry.js';
import { fixSystemPrompt } from './agent/prompts.js';
import { runSetup } from './setup.js';

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
  .command('fix')
  .description('Investigate a repo and apply a fix for the given task, then show the diff.')
  .requiredOption('--repo <path>', 'Path to the local git repository to work in')
  .requiredOption('--task <text>', 'The issue/task description to address')
  .option('--provider <id>', 'LLM provider (fake|anthropic|openai|vertex|bedrock)', 'fake')
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
      limits: { maxIterations: Number(opts.maxIterations), maxOutputTokens: 4096 },
      cwd: opts.repo,
      onEvent: (e) => {
        if (e.type === 'tool') console.log(`   → ${e.name}(${JSON.stringify(e.args)})`);
        if (e.type === 'tool_error') console.log(`   ✗ ${e.name}: ${e.message}`);
      },
    });

    console.log(`\n💬 ${result.finalText}`);
    console.log(`\n📊 ${result.iterations} iterations, stopped by: ${result.stoppedBy}`);

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
