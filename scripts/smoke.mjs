import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openDatabase } from '../backend/dist/database.js';
import { migrate } from '../backend/dist/migrate.js';
import { setTimeout as delay } from 'node:timers/promises';

// Build first. Bind to local ports only; this script does not open a browser.
const children = [];
function start(args, options = {}) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  child.on('error', error => { output += error.message; });
  children.push({ child, output: () => output });
  return child;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const entry of children) {
      if (entry.child.exitCode !== null) throw new Error(entry.output());
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch { /* Wait for processes to listen. */ }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const dataDir = await mkdtemp(resolve(tmpdir(), 'joyfrimens-smoke-'));
const db = await openDatabase({ dataDir });
await migrate(db);
await db.close();
try {
  start(['backend/dist/server.js'], { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: dataDir, HOST: '127.0.0.1', PORT: '3001' } });
  start([resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1'], { cwd: 'frontend' });
  const api = await waitFor('http://127.0.0.1:3001/api/health');
  assert.equal((await api.json()).service, 'joyfrimens-api');
  const page = await waitFor('http://127.0.0.1:4173');
  const html = await page.text();
  assert.match(html, /Joyfrimens/);
  const script = html.match(/src="([^"]+\.js)"/);
  assert.ok(script, 'Built frontend must reference a JavaScript bundle');
  const bundle = await fetch(new URL(script[1], 'http://127.0.0.1:4173'));
  assert.equal(bundle.status, 200);
  const proxy = await fetch('http://127.0.0.1:4173/api/health');
  assert.equal(proxy.status, 200);
  assert.equal((await proxy.json()).status, 'ok');
  const protectedRoute = await fetch('http://127.0.0.1:4173/api/shops');
  assert.equal(protectedRoute.status, 401);
  console.log('PASS: built API, frontend HTML/bundle, and frontend-to-API proxy.');
} finally {
  await Promise.all(children.map(({ child }) => new Promise(done => {
    if (child.exitCode !== null || child.signalCode !== null) return done();
    child.once('close', done);
    child.kill();
  })));
  // Only remove this run's newly created directory inside the OS temp directory.
  const relativePath = relative(resolve(tmpdir()), resolve(dataDir));
  if (!/^joyfrimens-smoke-[a-zA-Z0-9]+$/.test(relativePath)) throw new Error('Unexpected smoke-test directory.');
  await rm(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
