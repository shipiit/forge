#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from 'probot';
import app from './app.js';

/**
 * Entry point for the GitHub App webhook server. Probot reads APP_ID,
 * PRIVATE_KEY and WEBHOOK_SECRET from the environment (or a .env file) and
 * starts an HTTP server that receives GitHub webhooks.
 */
async function main(): Promise<void> {
  // On non-GCP hosts, accept the Vertex service-account JSON inline (a secret) and
  // materialize it to a file so Application Default Credentials can find it.
  const saJson = process.env.VERTEX_CREDENTIALS_JSON;
  if (saJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.join(os.tmpdir(), 'forge-vertex-sa.json');
    await fs.writeFile(p, saJson, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
  }
  await run(app);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
