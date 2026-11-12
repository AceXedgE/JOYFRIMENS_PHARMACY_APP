import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Stamp each production worker with its exact shell and bundle assets.
// A changed build installs atomically and waits for open app windows to close.
function serviceWorker() {
  return {
    name: 'joyfrimens-service-worker',
    apply: 'build' as const,
    enforce: 'post' as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array }>) {
      const publicFiles = ['manifest.webmanifest', 'icons/app.svg', 'icons/app-192.png', 'icons/app-512.png', 'icons/app-maskable-512.png', 'icons/apple-touch-icon.png'];
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) hash.update(name).update(bundle[name].code ?? bundle[name].source ?? '');
      for (const name of publicFiles) hash.update(name).update(readFileSync(new URL(`./public/${name}`, import.meta.url)));
      const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
      hash.update(template);
      const paths = ['/', ...Object.keys(bundle).filter(name => name !== 'index.html' && !name.endsWith('.map')).map(name => `/${name}`), ...publicFiles.map(name => `/${name}`)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__BUILD_ID__', hash.digest('hex').slice(0, 16)).replace('/* __PRECACHE_URLS__ */', JSON.stringify(paths)) });
    },
  } satisfies import('vite').Plugin;
}

export default defineConfig({
  plugins: [serviceWorker()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.E2E_API_PORT || '3001'}` } },
});
