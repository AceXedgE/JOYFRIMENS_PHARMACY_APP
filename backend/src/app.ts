import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { Database } from './database.ts';
import { readConfig, type Config } from './config.ts';
import { registerRoutes } from './routes.ts';

export function buildApp(options: { logger?: boolean; db?: Database; config?: Config } = {}) {
  const app = Fastify({ logger: options.logger ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'res.headers.set-cookie'] } : false,
    bodyLimit: 16384, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  // Public liveness only. No shop, staff, price, or financial data is exposed.
  app.get('/api/health', async () => ({
    status: 'ok', service: 'joyfrimens-api', version: '0.1.0',
  }));
  if (options.db) app.register(async scope => {
    await scope.register(cookie);
    await registerRoutes(scope, options.db!, options.config ?? readConfig());
  });
  return app;
}
