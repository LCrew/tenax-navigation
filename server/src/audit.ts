import fs from 'node:fs/promises';
import path from 'node:path';
import type { WarningLevel } from '../../shared/schema';
import { env } from './env';
import { today } from './stats';

/*
 * Per-person activity (who opened what, who accepted which warning) for the admin Statistics.
 * Everyone signs in with Microsoft, so every event carries the person's account id.
 *
 *  data/audit/YYYY-MM-DD.jsonl  one event per line, one file per day (Latvian time), kept AUDIT_DAYS days
 *  data/people.json             name and email of everyone seen, for search; dropped with their last event
 *  data/acks.json               the latest accepted version of each warning per person
 *
 * This is personal data: the people using the page should be told it is recorded.
 */

export type AuditType = 'visit' | 'open' | 'warned' | 'accept';
/** t: ms since epoch; tile/title/level: the tile as it was at that moment */
export type AuditEvent = { t: number; oid: string; type: AuditType; tile?: string; title?: string; level?: WarningLevel };
export type Person = { name: string; email?: string; first: number; last: number };
export type Ack = { v: string; at: number; title: string; level: WarningLevel };
type Who = { oid: string; name: string; email?: string };

const dir = path.join(env.dataDir, 'audit');
const peopleFile = path.join(env.dataDir, 'people.json');
const acksFile = path.join(env.dataDir, 'acks.json');
export const AUDIT_DAYS = Math.max(1, Number(process.env.AUDIT_DAYS) || 365);
const FLUSH_MS = 5_000;
/** a reload within this time doesn't count as a new visit */
const VISIT_GAP_MS = 30 * 60_000;

let people: Record<string, Person> = {};
let acks: Record<string, Record<string, Ack>> = {};
let pending: { day: string; line: string }[] = [];
let metaDirty = false;
const lastVisit = new Map<string, number>();

const dayOf = (t: number) => today(new Date(t));
const cutoffDay = () => today(new Date(Date.now() - (AUDIT_DAYS - 1) * 86_400_000));

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') console.error(`Could not read ${path.basename(file)}, starting fresh`, err);
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export async function loadAudit() {
  await fs.mkdir(dir, { recursive: true });
  people = await readJson(peopleFile, {});
  acks = await readJson(acksFile, {});
  await prune();
  setInterval(flushAudit, FLUSH_MS).unref();
  setInterval(prune, 6 * 3_600_000).unref();
}

/** Drop day files past the retention and the people whose last event went with them. */
async function prune() {
  const cutoff = cutoffDay();
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cutoff) await fs.rm(path.join(dir, f), { force: true });
  }
  const oldest = Date.parse(`${cutoff}T00:00:00Z`) - 86_400_000; // a day of slack for the time zone
  for (const [oid, p] of Object.entries(people)) {
    if (p.last < oldest && !acks[oid]) {
      delete people[oid];
      metaDirty = true;
    }
  }
}

function seen(who: Who, t: number) {
  const p = people[who.oid];
  if (p) {
    p.last = t;
    p.name = who.name;
    if (who.email) p.email = who.email;
  } else people[who.oid] = { name: who.name, email: who.email, first: t, last: t };
  metaDirty = true;
}

function add(who: Who, e: Omit<AuditEvent, 't' | 'oid'>) {
  const t = Date.now();
  seen(who, t);
  const ev: AuditEvent = { t, oid: who.oid, ...e };
  pending.push({ day: dayOf(t), line: JSON.stringify(ev) });
}

export function auditVisit(who: Who) {
  const now = Date.now();
  const prev = lastVisit.get(who.oid) ?? 0;
  lastVisit.set(who.oid, now);
  if (now - prev < VISIT_GAP_MS) return seen(who, now);
  add(who, { type: 'visit' });
}

export function auditOpen(who: Who, tile: { id: string; title: string }, warned?: WarningLevel) {
  add(who, warned ? { type: 'warned', tile: tile.id, title: tile.title, level: warned } : { type: 'open', tile: tile.id, title: tile.title });
}

export function auditAccept(who: Who, tile: { id: string; title: string }, level: WarningLevel, version: string) {
  add(who, { type: 'accept', tile: tile.id, title: tile.title, level });
  (acks[who.oid] ??= {})[tile.id] = { v: version, at: Date.now(), title: tile.title, level };
  metaDirty = true;
}

/** tile id → accepted warning version, for one person */
export function acksOf(oid: string): Record<string, string> {
  return Object.fromEntries(Object.entries(acks[oid] ?? {}).map(([id, a]) => [id, a.v]));
}
export const ackDetails = (oid: string) => acks[oid] ?? {};

export async function flushAudit() {
  const batch = pending;
  pending = [];
  const byDay = new Map<string, string[]>();
  for (const { day, line } of batch) byDay.set(day, [...(byDay.get(day) ?? []), line]);
  for (const [day, lines] of byDay) {
    try {
      await fs.appendFile(path.join(dir, `${day}.jsonl`), lines.join('\n') + '\n');
    } catch (err) {
      console.error('Could not write the activity log', err);
      pending.unshift(...lines.map((line) => ({ day, line })));
    }
    dayCache.delete(day);
  }
  if (!metaDirty) return;
  metaDirty = false;
  try {
    await writeJson(peopleFile, people);
    await writeJson(acksFile, acks);
  } catch (err) {
    metaDirty = true;
    console.error('Could not write people.json / acks.json', err);
  }
}

/* ---------- reading ---------- */

/** Calendar days of the range, newest first. */
function rangeDays(days: number) {
  const anchor = Date.parse(`${today()}T12:00:00Z`);
  return Array.from({ length: Math.min(days, AUDIT_DAYS) }, (_, i) => new Date(anchor - i * 86_400_000).toISOString().slice(0, 10));
}

// Parsed past days, so paging through the log doesn't re-read every file. Today is always read fresh, and a
// past day that still gets a late write (around midnight) is dropped from it.
const dayCache = new Map<string, AuditEvent[]>();
const MAX_CACHED_DAYS = 120;

/** One day's events, oldest first, including those not written to disk yet. */
async function readDay(day: string): Promise<AuditEvent[]> {
  let events = dayCache.get(day);
  if (!events) {
    const raw = await fs.readFile(path.join(dir, `${day}.jsonl`), 'utf8').catch(() => '');
    events = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        /* a line cut short by a crash */
      }
    }
    if (day !== today()) dayCache.set(day, events);
    if (dayCache.size > MAX_CACHED_DAYS) dayCache.delete(dayCache.keys().next().value!);
  }
  const extra = pending.filter((p) => p.day === day).map((p) => JSON.parse(p.line) as AuditEvent);
  return extra.length ? [...events, ...extra] : events;
}

export type Filter = { oid?: string; types?: AuditType[]; q?: string };

function matcher(f: Filter) {
  const q = f.q?.trim().toLowerCase();
  return (e: AuditEvent) => {
    if (f.oid && e.oid !== f.oid) return false;
    if (f.types && !f.types.includes(e.type)) return false;
    if (q) {
      const p = people[e.oid];
      const hay = `${p?.name ?? ''} ${p?.email ?? ''} ${e.title ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
}

/** Newest first, at most `limit`, only events before `before` (ms) for the next page. */
export async function queryEvents(days: number, f: Filter, limit: number, before = Infinity) {
  const match = matcher(f);
  const out: (AuditEvent & { name: string; email?: string })[] = [];
  for (const day of rangeDays(days)) {
    const events = await readDay(day);
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.t >= before || !match(e)) continue;
      if (out.length === limit) return { events: out, more: true };
      const p = people[e.oid];
      out.push({ ...e, name: p?.name ?? 'Unknown person', email: p?.email });
    }
  }
  return { events: out, more: false };
}

/** Everyone known, with what they did in the range; the most recently seen first. */
export async function listPeople(days: number) {
  const counts = new Map<string, { visits: number; opens: number; accepts: number }>();
  for (const day of rangeDays(days)) {
    for (const e of await readDay(day)) {
      let c = counts.get(e.oid);
      if (!c) counts.set(e.oid, (c = { visits: 0, opens: 0, accepts: 0 }));
      if (e.type === 'visit') c.visits++;
      else if (e.type === 'open') c.opens++;
      else if (e.type === 'accept') (c.opens++, c.accepts++);
    }
  }
  return Object.entries(people)
    .map(([oid, p]) => ({ oid, ...p, ...(counts.get(oid) ?? { visits: 0, opens: 0, accepts: 0 }) }))
    .sort((a, b) => b.last - a.last);
}

export const personOf = (oid: string) => people[oid];
