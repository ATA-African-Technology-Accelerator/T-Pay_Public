import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';




// Runs the suite against the Docker database from docker-compose.yml, then the
// API tests again on Postgres storage. Written in Node so it works the same on
// Windows, macOS and Linux, unlike `NAME=value command` in package.json.
const DEFAULT_URL = 'postgres://tpay:tpay@localhost:5433/tpay';
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;

// Every test file shares one database. Two at a time keeps a small machine (a laptop running
// an emulator, or a CI runner) from timing out while it waits for connections.
const WORKERS = '--maxWorkers=2';

const runs: Array<{ label: string; args: string[]; env: Record<string, string> }> = [
  { label: 'all tests with Postgres repositories', args: ['run', WORKERS], env: {} },
  { label: 'API tests on Postgres storage', args: ['run', 'tests/http', WORKERS], env: { API_STORAGE: 'postgres' } },
];

for (const { args, env, label } of runs) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [vitest, ...args], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
