import Fastify from 'fastify';

export function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  // Public liveness only. No shop, staff, price, or financial data is exposed.
  app.get('/api/health', async () => ({
    status: 'ok', service: 'joyfrimens-api', version: '0.1.0',
  }));
  return app;
}
