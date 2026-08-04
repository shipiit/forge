#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { createLLMClient, createLLMClientOrStub } from './providers/index.js';
import type { ProviderId } from './providers/types.js';
import { defaultConfig } from './config.js';
import { routeEvent, type RouteOpts } from './github/router.js';
import { octokitOptions } from './github/host.js';
import { actionInput, readActionInputs } from './actionInputs.js';
import {
  handleIssueFix,
  handlePrReview,
  handleMention,
  handlePrFollowup,
  handleAudit,
  handleScan,
  handleHistory,
  handleRelease,
  handleRoutine,
  type HandlerDeps,
} from './github/handlers.js';
import { scannersFor } from './scan/index.js';
import { loadRepoConfig } from './github/repoConfig.js';
import { findRoutine } from './routines.js';
import type { OctokitLike } from './github/pr.js';
import { redactSecrets } from './util/resilience.js';
import { createRecorder, tracked, type Flow } from './usage/index.js';
import { resolveHost } from './github/host.js';

/**
 * GitHub Action entry point. Each org adds a workflow that runs this with their
 * OWN provider key in repo secrets — no central server, per-org credentials and
 * compute. Reads the event from the Actions runtime, routes it, and runs the
 * matching handler using the workflow's GITHUB_TOKEN.
 */
async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || actionInput('github-token');
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token) throw new Error('GITHUB_TOKEN is required (pass `github-token` input or env).');
  if (!eventName || !eventPath) throw new Error('Not running in a GitHub Actions event context.');

  const payload = JSON.parse(await fs.readFile(eventPath, 'utf8'));
  const [repoOwner, repoName] = (process.env.GITHUB_REPOSITORY || '/').split('/');

  // If a GitHub App's credentials are provided, act AS the app (its bot identity +
  // permissions, like Claude's app). Otherwise fall back to the workflow token.
  // Same input-name bug as the credentials: these read the all-underscore
  // spelling the runner never sets, so `app-id:`/`private-key:` in a workflow
  // did nothing and every comment came from github-actions[bot] instead of the
  // App — configured, and silently ignored.
  const appId = process.env.APP_ID || actionInput('app-id');
  const privateKey = (process.env.PRIVATE_KEY || actionInput('private-key') || '').replace(/\\n/g, '\n');
  let effectiveToken = token;
  if (appId && privateKey && repoOwner && repoName) {
    try {
      const appOctokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
      const inst = await appOctokit.rest.apps.getRepoInstallation({ owner: repoOwner, repo: repoName });
      const auth = (await appOctokit.auth({ type: 'installation', installationId: inst.data.id })) as { token: string };
      effectiveToken = auth.token;
    } catch (err) {
      console.log(`App auth unavailable (${(err as Error).message}); using the workflow token.`);
    }
  }

  // If a Vertex service-account JSON is provided inline (secret), materialize it.
  const saJson = process.env.VERTEX_CREDENTIALS_JSON || actionInput('vertex-credentials-json');
  if (saJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.join(os.tmpdir(), 'forge-vertex-sa.json');
    await fs.writeFile(p, saJson, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
  }

  // Workflow inputs decide what this run does: prompt, tools, turns, budgets.
  const inputs = readActionInputs();
  const provider = (process.env.LLM_PROVIDER || inputs.provider || 'anthropic') as ProviderId;
  const log = (msg: string) => console.log(redactSecrets(msg));

  // baseUrl is set only on GitHub Enterprise Server; empty on github.com.
  const octokit = new Octokit({ auth: effectiveToken, ...octokitOptions() }) as unknown as OctokitLike;

  // Per-repository config. The App gets this from Probot; the Action has to
  // fetch it, or every setting in agent.yml would be silently ignored here.
  const config = repoOwner && repoName ? await loadRepoConfig(octokit, repoOwner, repoName, log) : defaultConfig();
  if (inputs.model) config.model = inputs.model;
  // The workflow can switch either scan off; anything else leaves the
  // repository's own setting, which is on.
  if (offSwitch(actionInput('secret-scan'))) config.secretScan = false;
  if (offSwitch(actionInput('code-scan'))) config.codeScan = false;
  const blockOn = actionInput('scan-block-on');
  if (blockOn && ['critical', 'high', 'medium', 'low', 'info', 'none'].includes(blockOn)) {
    config.scanBlockOn = blockOn as typeof config.scanBlockOn;
  }
  if (inputs.maxNits !== undefined) config.maxNits = inputs.maxNits;

  const routeOpts: RouteOpts = {
    triggerLabel: config.triggerLabel,
    mentionHandle: inputs.triggerPhrase ?? config.triggerPhrase,
    autoFix: config.autoFix,
    autoReview: config.autoReview,
    reviewBehavior: config.reviewBehavior,
    filters: config.filters,
    historyEnabled: config.historyEnabled,
  };

  const route = routeEvent(eventName, payload, routeOpts);

  // The scan runs on every pull request, whatever the review cadence is.
  //
  // It costs no model call, so there is no cadence to weigh it against, and a
  // credential pushed to a branch is already readable by anyone who can clone
  // the repository — waiting for review is waiting for the wrong thing. The
  // App has behaved this way from the start; this is what makes the workflow
  // surface give the same answer on the same pull request.
  const prAction: string = payload?.action ?? '';
  const prScan =
    (config.secretScan || config.codeScan) &&
    eventName === 'pull_request' &&
    ['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(prAction) &&
    payload?.pull_request &&
    repoOwner &&
    repoName
      ? {
          owner: repoOwner,
          repo: repoName,
          issueNumber: payload.pull_request.number as number,
          pullNumber: payload.pull_request.number as number,
          ref: (payload.pull_request.head?.ref ?? '') as string,
        }
      : undefined;

  if (route.kind === 'none' && !prScan) {
    log(`ShipIT Forge: nothing to do (${route.reason}).`);
    return;
  }

  const deps: HandlerDeps = {
    octokit,
    client: createLLMClientOrStub({ provider, model: config.model }, log),
    token: effectiveToken, // used to clone the repo over HTTPS
    log,
    testCommand: config.testCommand,
    sarifPath: config.sarifPath,
    maxNits: config.maxNits,
    extraPrompt: inputs.extraPrompt,
    toolSelection: { allowed: inputs.allowedTools, disallowed: inputs.disallowedTools },
    skillName: inputs.skillName,
    inlineSkill: inputs.inlineSkill,
    skillsPath: inputs.skillsPath,
    historyPath: config.historyPath,
    historyMode: config.historyMode,
    spendCapPerRunUsd: config.spendCapPerRunUsd,
    maxRunsPerHour: config.maxRunsPerHour,
    showCost: config.showCost,
    findingsToIssues: config.findingsToIssues,
    findingsMinSeverity: config.findingsMinSeverity,
    findingsMaxIssues: config.findingsMaxIssues,
    selfReview: true,
    scanners: scannersFor(config),
    scanBlockOn: config.scanBlockOn,
  };

  // A scan with no route is still work: say so, rather than naming a route
  // that was declined.
  const what = route.kind === 'none' ? 'scan' : route.kind;
  const where = route.kind === 'none' ? `${repoOwner}/${repoName}` : `${route.owner}/${route.repo}`;
  log(`ShipIT Forge: handling ${what} for ${where} (provider: ${provider}).`);

  // Recorded the same way the App records, so a workflow-driven run and a
  // webhook-driven one land in the same dashboard. Off unless FORGE_USAGE_DB
  // points somewhere that outlives the container.
  await tracked(
    {
      recorder: createRecorder(),
      client: deps.client,
      meta: {
        host: resolveHost().host,
        owner: route.kind === 'none' ? repoOwner : route.owner,
        repo: route.kind === 'none' ? repoName : route.repo,
        surface: 'action',
        flow: (route.kind === 'none' ? 'audit' : route.kind) as Flow,
        trigger: eventName,
        ...(payload?.sender?.login ? { actor: payload.sender.login as string } : {}),
        ...(inputs.skillName ? { skill: inputs.skillName } : {}),
        ...('pullNumber' in route && route.pullNumber ? { prNumber: route.pullNumber as number } : {}),
        ...('issueNumber' in route && route.issueNumber ? { issueNumber: route.issueNumber as number } : {}),
      },
    },
    async (run) => {
      deps.run = run;
      // Deterministic first: it is free, and it is the half that can block a
      // merge on its own.
      if (prScan) await handleScan(deps, prScan);
      if (route.kind !== 'none') await dispatchRoute();
    },
  );
  log('ShipIT Forge: done.');

  async function dispatchRoute(): Promise<void> {
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
    case 'audit':
      await handleAudit(deps, route);
      break;
    case 'scan':
      await handleScan(deps, route);
      break;
    case 'history':
      await handleHistory(deps, {
        ...route,
        // The event carries the date; never read a clock mid-run.
        date: (payload?.pull_request?.merged_at ?? payload?.head_commit?.timestamp ?? '').slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
      });
      break;
    case 'release':
      await handleRelease(deps, route);
      break;
    case 'routine': {
      const routine = findRoutine(config.routines, route.routine);
      if (!routine) {
        log(`No routine named "${route.routine}" in .github/agent.yml.`);
        break;
      }
      if (!routine.manual) {
        log(`Routine "${routine.name}" is not manually runnable.`);
        break;
      }
      await handleRoutine(deps, { ...route, routine, extra: route.args });
      break;
    }
  }
  }
}

/** A workflow input that means "no". Anything else, including empty, is yes. */
function offSwitch(value: string | undefined): boolean {
  return value !== undefined && ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

main().catch((err) => {
  console.error(`ShipIT Forge action failed: ${redactSecrets((err as Error).message)}`);
  process.exit(1);
});
