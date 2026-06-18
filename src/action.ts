#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Octokit } from '@octokit/rest';
import { createLLMClient } from './providers/index.js';
import type { ProviderId } from './providers/types.js';
import { defaultConfig } from './config.js';
import { routeEvent, type RouteOpts } from './github/router.js';
import { handleIssueFix, handlePrReview, handleMention, handlePrFollowup, type HandlerDeps } from './github/handlers.js';
import type { OctokitLike } from './github/pr.js';
import { redactSecrets } from './util/resilience.js';

/**
 * GitHub Action entry point. Each org adds a workflow that runs this with their
 * OWN provider key in repo secrets — no central server, per-org credentials and
 * compute. Reads the event from the Actions runtime, routes it, and runs the
 * matching handler using the workflow's GITHUB_TOKEN.
 */
async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token) throw new Error('GITHUB_TOKEN is required (pass `github-token` input or env).');
  if (!eventName || !eventPath) throw new Error('Not running in a GitHub Actions event context.');

  const payload = JSON.parse(await fs.readFile(eventPath, 'utf8'));

  // If a Vertex service-account JSON is provided inline (secret), materialize it.
  const saJson = process.env.VERTEX_CREDENTIALS_JSON || process.env.INPUT_VERTEX_CREDENTIALS_JSON;
  if (saJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.join(os.tmpdir(), 'forge-vertex-sa.json');
    await fs.writeFile(p, saJson, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
  }

  const provider = (process.env.LLM_PROVIDER || process.env.INPUT_PROVIDER || 'anthropic') as ProviderId;
  const config = defaultConfig();
  const log = (msg: string) => console.log(redactSecrets(msg));

  const routeOpts: RouteOpts = {
    triggerLabel: config.triggerLabel,
    mentionHandle: (process.env.FORGE_DISPLAY_HANDLE || '@shipit-forge').toLowerCase(),
    autoFix: config.autoFix,
    autoReview: config.autoReview,
  };

  const route = routeEvent(eventName, payload, routeOpts);
  if (route.kind === 'none') {
    log(`ShipIT Forge: nothing to do (${route.reason}).`);
    return;
  }

  const octokit = new Octokit({ auth: token }) as unknown as OctokitLike;
  const deps: HandlerDeps = {
    octokit,
    client: createLLMClient({ provider, model: config.model }),
    token, // GITHUB_TOKEN can clone the repo over HTTPS
    log,
    testCommand: config.testCommand,
    sarifPath: config.sarifPath,
    selfReview: true,
  };

  log(`ShipIT Forge: handling ${route.kind} for ${route.owner}/${route.repo} (provider: ${provider}).`);
  switch (route.kind) {
    case 'fix':
      await handleIssueFix(deps, route);
      break;
    case 'review':
      await handlePrReview(deps, route);
      break;
    case 'followup':
      await handlePrFollowup(deps, route);
      break;
    case 'mention':
      await handleMention(deps, route);
      break;
  }
  log('ShipIT Forge: done.');
}

main().catch((err) => {
  console.error(`ShipIT Forge action failed: ${redactSecrets((err as Error).message)}`);
  process.exit(1);
});
