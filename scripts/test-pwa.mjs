// Exercise the production static server, browser installability, and worker lifecycle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildApp } from '../backend/dist/app.js';
import { registerFrontend } from '../backend/dist/frontend.js';

const app = buildApp();
let context;
let worker = await readFile(new URL('../frontend/dist/sw.js', import.meta.url), 'utf8');
// Serve an alternate worker later to simulate a new deployment without changing files.
app.get('/sw.js', (_request, reply) => reply.type('application/javascript').send(worker));
app.get('/api/auth/me', (_request, reply) => reply.code(401).send({ message: 'Please sign in.' }));
await registerFrontend(app, fileURLToPath(new URL('../frontend/dist/', import.meta.url)));
try {
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  // A temporary regular profile is needed: browsers disallow PWA installation in incognito.
  context = await chromium.launchPersistentContext('', {
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    baseURL: origin, viewport: { width: 390, height: 844 },
  });
  let page = await context.newPage();
  const pageErrors = [];
  context.on('page', opened => opened.on('pageerror', error => pageErrors.push(error.message)));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await context.request.get(manifestLink);
  assert.equal(response.status(), 200);
  assert.match(response.headers()['content-type'], /application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const image = await context.request.get(icon.src);
    assert.equal(image.status(), 200);
    assert.match(image.headers()['content-type'], /image\/png/);
    const bytes = await image.body();
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const cdp = await context.newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest');
  assert.deepEqual(parsed.errors, []);
  await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  console.log('PASS: production manifest, PNG icons, and Chromium installability.');

  // The browser owns the real install dialog; exercise our user-gesture wiring.
  await page.evaluate(() => {
    const prompt = new Event('beforeinstallprompt', { cancelable: true });
    prompt.prompt = async () => { window.installPromptCalls = (window.installPromptCalls ?? 0) + 1; };
    prompt.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(prompt);
  });
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  assert.equal(await page.evaluate(() => window.installPromptCalls), 1);
  await page.locator('.install-app summary').click();
  await expect(page.getByText(/On iPhone or iPad/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('complementary', { name: 'Install Joyfrimens' })).toHaveCount(0);
  console.log('PASS: install action, dismissal fallback, iOS guidance, mobile width, and installed-state UI.');

  await page.evaluate(async () => {
    await fetch('/api/health');
    await caches.open('joyfrimens-shell-v1');
    await caches.open('unrelated-cache');
  });
  const firstCache = await page.evaluate(async () => (await caches.keys()).find(key => key.startsWith('joyfrimens-shell-') && key !== 'joyfrimens-shell-v1'));
  assert.ok(firstCache);
  worker = worker.replace(/(const CACHE = `\$\{CACHE_PREFIX\})([^`]+)(`;)/, '$1$2-update$3');
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update(); });
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  // Existing windows keep their current worker until they close.
  assert.ok((await page.evaluate(() => caches.keys())).includes(firstCache));
  await page.close();
  page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    return keys.some(key => key.endsWith('-update')) && !keys.includes('joyfrimens-shell-v1') && keys.filter(key => key.startsWith('joyfrimens-shell-')).length === 1;
  });
  assert.ok((await page.evaluate(() => caches.keys())).includes('unrelated-cache'));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.goto('/supplier?token=private-test-token');
  await expect(page.locator('#root')).not.toBeEmpty();
  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith('joyfrimens-shell-')));
    return (await cache.keys()).map(request => request.url);
  });
  assert.ok(cachedUrls.every(url => !url.includes('/api') && !url.includes('token=')));
  assert.equal(await page.evaluate(async () => { try { await fetch('/api/health'); return true; } catch { return false; } }), false);
  assert.deepEqual(pageErrors, []);
  console.log('PASS: waiting update activates on reopen, old shell cleanup preserves unrelated caches, offline reload, and API/private URL cache exclusion.');
} finally {
  await context?.close();
  await app.close();
}
