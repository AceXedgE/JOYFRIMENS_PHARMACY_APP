import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.ts';

test('liveness returns the API contract without caching financial-service status', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', service: 'joyfrimens-api', version: '0.1.0' });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('unimplemented business routes do not accept sales or expose shop data', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  for (const request of [
    { method: 'GET' as const, url: '/api/shops' },
    { method: 'POST' as const, url: '/api/sales', payload: { total: 100 } },
  ]) {
    assert.equal((await app.inject(request)).statusCode, 404);
  }
});
