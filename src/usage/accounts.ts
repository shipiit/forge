import { createInterface } from 'node:readline';
import { openUsageDb } from './serve.js';
import { createUser, listUsers, removeUser, setPassword, passwordProblem } from './auth.js';

/**
 * Managing dashboard accounts from the command line.
 *
 * Passwords are read from the terminal with echo off, never from an argument.
 * An argument is visible in `ps`, lands in shell history, and is copied into
 * CI logs by whoever tries it there first — a flag for it would be a flag
 * whose only real use is the insecure one.
 */

/** Read a line with the terminal not echoing it back. */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!input.isTTY) {
      // Piped in: read a line and take it, so `echo secret | forge …` works
      // for scripted provisioning without ever putting it in argv.
      const rl = createInterface({ input });
      // Resolve before closing: close() emits 'close' synchronously, so
      // closing first lets the empty fallback win the race with the line that
      // was actually read.
      rl.once('line', (line) => {
        resolve(line);
        rl.close();
      });
      rl.once('close', () => resolve(''));
      return;
    }

    output.write(question);
    const rl = createInterface({ input, output, terminal: true });
    // Suppress the echo without suppressing backspace handling.
    const muted = (rl as unknown as { _writeToOutput: (s: string) => void });
    const original = muted._writeToOutput.bind(rl);
    muted._writeToOutput = (str: string) => {
      if (str.includes(question)) original(str);
    };

    rl.question('', (answer) => {
      muted._writeToOutput = original;
      output.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.once('error', reject);
  });
}

/** Ask twice, because a typo in a password nobody can see is a locked account. */
async function readNewPassword(): Promise<string> {
  const first = await promptHidden('New password: ');
  const problem = passwordProblem(first);
  if (problem) throw new Error(problem);
  if (process.stdin.isTTY) {
    const again = await promptHidden('Repeat it: ');
    if (again !== first) throw new Error('Those did not match.');
  }
  return first;
}

export async function addAccount(file: string, username: string): Promise<string> {
  const { db } = openUsageDb(file);
  await createUser(db, username, await readNewPassword());
  return `Created "${username.trim().toLowerCase()}". They can sign in at the dashboard now.`;
}

export async function changePassword(file: string, username: string): Promise<string> {
  const { db } = openUsageDb(file);
  await setPassword(db, username, await readNewPassword());
  return `Password changed for "${username.trim().toLowerCase()}". Any session it had is now signed out.`;
}

export function deleteAccount(file: string, username: string): string {
  const { db } = openUsageDb(file);
  const gone = removeUser(db, username);
  return gone
    ? `Removed "${username.trim().toLowerCase()}" and signed out every session it had.`
    : `No account called "${username.trim().toLowerCase()}".`;
}

export function renderAccounts(file: string): string {
  const { db } = openUsageDb(file);
  const users = listUsers(db);
  if (users.length === 0) {
    return 'No accounts yet. Create one with `forge dashboard:user add <name>`.';
  }
  const when = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : 'never');
  const width = Math.max(...users.map((u) => u.username.length), 8);
  return [
    `${'ACCOUNT'.padEnd(width)}  CREATED           LAST SIGN-IN`,
    ...users.map((u) => `${u.username.padEnd(width)}  ${when(u.createdAt)}  ${when(u.lastLogin)}`),
  ].join('\n');
}
