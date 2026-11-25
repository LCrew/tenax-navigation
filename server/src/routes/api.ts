import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ConfigSchema, warningVersion, type Config, type Tile } from '../../../shared/schema';
import { ackDetails, acksOf, AUDIT_DAYS, auditAccept, auditOpen, auditVisit, listPeople, personOf, queryEvents, type AuditType } from '../audit';
import { getSession, requireAdmin, type Session } from '../auth';
import { loadConfig, saveConfig } from '../config-store';
import { env } from '../env';
import { GraphError, lookUpGroups, memberGroups, searchSecurityGroups } from '../graph';
import { probeEmbeddable } from '../probe';
import { getStats, recordClick, recordView } from '../stats';

export const uploadsDir = path.join(env.dataDir, 'uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const tooLarge = { error: 'File too large (max 10 MB)' };

export const api = new Hono();

api.get('/config', async (c) => {
  // The answer depends on who asks (admin-only sections), so it must never be shared by a cache.
  c.header('Cache-Control', 'private, no-cache');
  c.header('Vary', 'Cookie');
  return c.json(await configFor(await loadConfig(), await getSession(c)));
});

api.get('/me', async (c) => {
  c.header('Cache-Control', 'no-store');
  const s = await getSession(c);
  // acks: the warnings this person accepted (tile id → warning version), so acknowledged ones aren't shown again
  return c.json(s ? { signedIn: true, name: s.name, isAdmin: s.isAdmin, acks: acksOf(s.oid) } : { signedIn: false, isAdmin: false, acks: {} });
});

const who = (s: Session) => ({ oid: s.oid, name: s.name, email: s.email });

/**
 * The config as this person may see it. Administrators get all of it (the editor saves the whole config).
 * Everyone else: no admin-only sections, only the tiles of security groups they are in (nested groups
 * count), and not which groups those are.
 */
async function configFor(config: Config, s: Session | null): Promise<Config> {
  if (s?.isAdmin) return config;
  const groups = config.groups.filter((g) => !g.adminOnly);
  const wanted = groups.flatMap((g) => g.tiles.flatMap((t) => t.securityGroups?.map((r) => r.id) ?? []));
  const mine = s && wanted.length ? await memberGroups(s.oid, wanted) : new Set<string>();
  const visible = (t: Tile) => !t.securityGroups?.length || t.securityGroups.some((r) => mine.has(r.id));
  const shown = groups.map((g) => ({ ...g, tiles: g.tiles.filter(visible).map(({ securityGroups: _, ...t }) => t) }));
  // a section whose every tile is for other groups is left out, rather than shown empty
  return { ...config, groups: shown.filter((g, i) => g.tiles.length || !groups[i].tiles.length) };
}

/** A tile the person may see. */
async function findTile(config: Config, id: string, s: Session | null): Promise<Tile | undefined> {
  for (const g of (await configFor(config, s)).groups) {
    const t = g.tiles.find((t) => t.id === id);
    if (t) return t;
  }
}

/** The warning this person still has to read for the tile (none when acknowledged and it allows that). */
const pendingWarning = (t: Tile, oid: string) =>
  t.warning && !(t.warning.acknowledge && acksOf(oid)[t.id] === warningVersion(t.warning)) ? t.warning : undefined;

// Usage tracking: anonymous daily totals for the overview, and each signed-in person's activity for the audit.
// Only ids of tiles that exist are counted.
const TrackSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('view') }),
  z.object({ type: z.literal('click'), tileId: z.string().max(40) }),
]);

api.post('/track', async (c) => {
  const ev = TrackSchema.safeParse(await c.req.json().catch(() => null));
  if (!ev.success) return c.body(null, 400);
  const s = await getSession(c);
  if (ev.data.type === 'view') {
    recordView();
    if (s) auditVisit(who(s));
  } else {
    const tile = await findTile(await loadConfig(), ev.data.tileId, s);
    if (!tile) return c.body(null, 404);
    recordClick(tile.id);
    // a tile with a warning only shows the warning; the page opens when it is accepted (POST /ack)
    if (s) auditOpen(who(s), tile, pendingWarning(tile, s.oid)?.level);
  }
  return c.body(null, 204);
});

// A warning was read and accepted: saved per person, and the page opens.
api.post('/ack', async (c) => {
  const body = z.object({ tileId: z.string().max(40) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.body(null, 400);
  const s = await getSession(c);
  if (!s) return c.json({ error: 'Not signed in' }, 401);
  const tile = await findTile(await loadConfig(), body.data.tileId, s);
  if (!tile?.warning) return c.json({ error: 'This tile has no warning' }, 404);
  const version = warningVersion(tile.warning);
  auditAccept(who(s), tile, tile.warning.level, version);
  return c.json({ tileId: tile.id, version });
});

const rangeOf = (v: string | undefined) => Math.min(Math.max(Number(v) || 30, 1), 365);

api.get('/stats', requireAdmin, (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ days: getStats(rangeOf(c.req.query('days'))) });
});

// ---- per-person activity (admins) ----

api.get('/people', requireAdmin, async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ people: await listPeople(rangeOf(c.req.query('days'))), keptDays: AUDIT_DAYS });
});

api.get('/people/:oid', requireAdmin, async (c) => {
  c.header('Cache-Control', 'no-store');
  const oid = c.req.param('oid');
  const person = personOf(oid);
  if (!person) return c.json({ error: 'Unknown person' }, 404);
  const config = await loadConfig();
  const tiles = new Map(config.groups.flatMap((g) => g.tiles).map((t) => [t.id, t]));
  // every warning this person accepted, and whether that still covers the warning as it reads today
  const acks = Object.entries(ackDetails(oid))
    .map(([tileId, a]) => {
      const w = tiles.get(tileId)?.warning;
      const state = !w ? 'removed' : warningVersion(w) === a.v ? 'current' : 'changed';
      return { tileId, title: tiles.get(tileId)?.title ?? a.title, level: w?.level ?? a.level, at: a.at, state, acknowledge: !!w?.acknowledge };
    })
    .sort((a, b) => b.at - a.at);
  return c.json({ person: { oid, ...person }, acks });
});

const TYPES: Record<string, AuditType[]> = { opened: ['open', 'accept'], warnings: ['warned', 'accept'], visits: ['visit'] };

api.get('/audit', requireAdmin, async (c) => {
  c.header('Cache-Control', 'no-store');
  const q = c.req.query();
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
  const before = Number(q.before) || Infinity;
  return c.json(
    await queryEvents(rangeOf(q.days), { oid: q.oid || undefined, types: q.type && Object.hasOwn(TYPES, q.type) ? TYPES[q.type] : undefined, q: q.q?.slice(0, 100) }, limit, before),
  );
});

// Security groups for the tile editor: ?q= searches by name or object ID, ?ids= gives the current names.
api.get('/security-groups', requireAdmin, async (c) => {
  c.header('Cache-Control', 'no-store');
  try {
    const ids = c.req.query('ids');
    if (ids !== undefined) return c.json(await lookUpGroups(ids.split(',')));
    return c.json({ groups: await searchSecurityGroups(c.req.query('q') ?? '') });
  } catch (e) {
    if (e instanceof GraphError) return c.json({ error: e.message }, 503);
    throw e;
  }
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
