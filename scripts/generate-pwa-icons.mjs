// Recreate the checked-in PNG icons from the vector mark using the test browser.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const directory = new URL('../frontend/public/icons/', import.meta.url);
const svg = await readFile(new URL('app.svg', directory), 'utf8');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
try {
  for (const [name, size] of [['app-192.png', 192], ['app-512.png', 512], ['app-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(name, directory)) });
    await page.close();
  }
} finally {
  await browser.close();
}
