import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.E2E_API_PORT || '3001'}` } },
});
