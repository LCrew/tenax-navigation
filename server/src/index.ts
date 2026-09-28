import fs from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { auth, requireLogin } from './auth';
import { loadConfig } from './config-store';
import { env } from './env';
import { api, uploadsDir } from './routes/api';
import { flushStats, loadStats } from './stats';

await fs.mkdir(uploadsDir, { recursive: true });

const app = new Hono();
const ownOrigin = new URL(env.publicUrl).origin;

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!c.res.headers.has('Content-Security-Policy')) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "connect-src 'self'; frame-src http: https:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
    );
  }
});

app.get('/healthz', (c) => c.text('ok'));

// CSRF: mutating requests must come from our own origin.
app.use('*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== ownOrigin) {
    return c.json({ error: 'Bad origin' }, 403);
  }
  await next();
});

const clientIp = (c: any) =>
  (env.trustProxy && c.req.header('x-forwarded-for')?.split(',')[0].trim()) || getConnInfo(c).remote.address || 'unknown';
const limiter = (limit: number) => rateLimiter({ windowMs: 60_000, limit, keyGenerator: clientIp });
app.use('/auth/*', limiter(30));
// Tracking gets its own, higher budget (a whole office may share one IP).
const writeLimiter = limiter(60);
const trackLimiter = limiter(600);
app.on(['POST', 'PUT', 'DELETE'], '/api/*', (c, next) => (c.req.path === '/api/track' ? trackLimiter : writeLimiter)(c, next));

app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path} failed:`, err);
  if (c.req.path.startsWith('/auth/')) {
    return c.text('Sign-in is temporarily unavailable. Please try again later or contact IT.', 503);
  }
  return c.json({ error: 'Internal error' }, 500);
});

app.route('/auth', auth);
app.use('*', requireLogin);
app.route('/api', api);
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.use(
  '/uploads/*',
  async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    c.header('Cache-Control', 'private, max-age=31536000, immutable');
  },
  serveStatic({ root: path.relative(process.cwd(), uploadsDir), rewriteRequestPath: (p) => p.replace(/^\/uploads/, '') }),
);
app.all('/uploads/*', (c) => c.notFound());

const staticRoot = path.relative(process.cwd(), env.staticDir);
app.use(
  '/assets/*',
  async (c, next) => {
    await next();
    if (c.res.ok) c.header('Cache-Control', 'private, max-age=31536000, immutable'); // private: no edge caching behind login
  },
  serveStatic({ root: staticRoot }),
);
app.use('*', serveStatic({ root: staticRoot }));

// SPA fallback
let indexHtml: string | null = null;
app.get('*', async (c) => {
  indexHtml ??= await fs.readFile(path.join(env.staticDir, 'index.html'), 'utf8').catch(() => null);
  if (!indexHtml) return c.text('Frontend not built', 404);
  c.header('Cache-Control', 'no-cache');
  return c.html(indexHtml);
});

await loadConfig();
await loadStats();
const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Navigation server listening on :${info.port}${env.devNoAuth ? ' (DEV_NO_AUTH: everyone is admin)' : ''}`);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    await flushStats();
    server.close();
    process.exit(0);
  });
}
