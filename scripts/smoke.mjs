import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

for (const port of [8080, 5173]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

process.loadEnvFile('.local/test.env');
mkdirSync('.local', { recursive: true });
const log = openSync('.local/smoke-backend.log', 'w');
const env = { ...process.env, APP_ENV: 'development', SEED_DEMO: 'true',
  DB_URL: process.env.TEST_DB_URL.replace('/?', '/bid_arena?'),
  DB_USER: process.env.TEST_DB_USER, DB_PASSWORD: process.env.TEST_DB_PASSWORD, BACKEND_PORT: '8080' };
const backend = spawn('java', ['-jar', 'backend/target/bid-arena.jar'], { env, stdio: ['ignore', log, log] });
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  { cwd: 'frontend', stdio: 'ignore' });
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Not ready: ${url}`);
}
try {
  const health = await (await waitFor('http://127.0.0.1:8080/api/v1/health')).json();
  assert.deepEqual(health, { status: 'UP', database: 'UP' });
  assert.match(await (await waitFor('http://127.0.0.1:5173/')).text(), /Bid Arena/);
  assert.deepEqual(await (await waitFor('http://127.0.0.1:5173/api/v1/health')).json(), health);
  console.log('PASS: live Solon readiness, Vite index, and frontend API proxy');
} finally {
  backend.kill(); frontend.kill(); closeSync(log);
}
