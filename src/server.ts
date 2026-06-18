#!/usr/bin/env node
import { run } from 'probot';
import app from './app.js';

/**
 * Entry point for the GitHub App webhook server. Probot reads APP_ID,
 * PRIVATE_KEY and WEBHOOK_SECRET from the environment (or a .env file) and
 * starts an HTTP server that receives GitHub webhooks.
 */
run(app).catch((err) => {
  console.error(err);
  process.exit(1);
});
