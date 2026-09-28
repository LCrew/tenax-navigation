import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ConfigSchema } from '../../../shared/schema';
import { getSession, requireAdmin } from '../auth';
import { loadConfig, saveConfig } from '../config-store';
import { env } from '../env';
import { probeEmbeddable } from '../probe';
import { getStats, recordClick, recordView } from '../stats';

export const uploadsDir = path.join(env.dataDir, 'uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const tooLarge = { error: 'File too large (max 10 MB)' };

export const api = new Hono();

api.get('/config', async (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.json(await loadConfig());
});

api.get('/me', async (c) => {
  const s = await getSession(c);
  return c.json(s ? { signedIn: true, name: s.name, isAdmin: s.isAdmin } : { signedIn: false, isAdmin: false });
});

// Public, anonymous usage tracking. Only ids of tiles that exist are counted.
const TrackSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('view') }),
  z.object({ type: z.literal('click'), tileId: z.string().max(40) }),
]);

api.post('/track', async (c) => {
  const ev = TrackSchema.safeParse(await c.req.json().catch(() => null));
  if (!ev.success) return c.body(null, 400);
  if (ev.data.type === 'view') recordView();
  else {
    const { tileId } = ev.data;
    const config = await loadConfig();
    if (!config.groups.some((g) => g.tiles.some((t) => t.id === tileId))) return c.body(null, 404);
    recordClick(tileId);
  }
  return c.body(null, 204);
});

api.get('/stats', requireAdmin, (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 365);
  c.header('Cache-Control', 'no-store');
  return c.json({ days: getStats(days) });
});

api.put('/config', requireAdmin, async (c) => {
  const parsed = ConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid config', issues: parsed.error.issues }, 400);
  await saveConfig(parsed.data);
  return c.json(parsed.data);
});

api.post('/probe', requireAdmin, async (c) => {
  const body = z.object({ url: z.string().url() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success || !/^https?:$/.test(new URL(body.data.url).protocol)) {
    return c.json({ error: 'Invalid URL' }, 400);
  }
  return c.json(await probeEmbeddable(body.data.url, new URL(env.publicUrl).origin));
});

// Detect the real file type from its contents; never trust the client's MIME type.
function sniff(buf: Buffer): 'png' | 'jpg' | 'webp' | 'svg' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  const head = buf.subarray(0, 1024).toString('utf8').trimStart();
  if ((head.startsWith('<svg') || head.startsWith('<?xml')) && head.includes('<svg')) return 'svg';
  return null;
}

api.post(
  '/uploads',
  requireAdmin,
  // Reject oversized bodies while streaming, before they are buffered (small allowance for multipart overhead).
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: (c) => c.json(tooLarge, 413) }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: 'No file' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json(tooLarge, 413);
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniff(buf);
    if (!ext) return c.json({ error: 'Only PNG, JPG, WebP or SVG images are allowed' }, 415);
    const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, name), buf);
    return c.json({ path: `/uploads/${name}` });
  },
);
