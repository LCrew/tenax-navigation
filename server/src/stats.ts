import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

// Anonymous usage counters, aggregated per calendar day. No IPs or user identities are stored.
type Day = { views: number; clicks: Record<string, number> };
type Stats = { days: Record<string, Day> };

const file = path.join(env.dataDir, 'stats.json');
const RETAIN_DAYS = 400;
const FLUSH_MS = 15_000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.STATS_TZ ?? 'Europe/Riga' });

let stats: Stats = { days: {} };
let dirty = false;

export const today = (d = new Date()) => dayFormat.format(d); // YYYY-MM-DD

export async function loadStats() {
  try {
    stats = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') console.error('Could not read stats.json, starting fresh', err);
  }
  setInterval(flushStats, FLUSH_MS).unref();
}

function day(key = today()): Day {
  return (stats.days[key] ??= { views: 0, clicks: {} });
}

export function recordView() {
  day().views++;
  dirty = true;
}

export function recordClick(tileId: string) {
  const d = day();
  d.clicks[tileId] = (d.clicks[tileId] ?? 0) + 1;
  dirty = true;
}

export function getStats(days: number) {
  const out: { date: string; views: number; clicks: Record<string, number> }[] = [];
  // Step over calendar dates in UTC (noon) so DST changes can't skip or repeat a day.
  const anchor = Date.parse(`${today()}T12:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(anchor - i * 86_400_000).toISOString().slice(0, 10);
    const d = stats.days[date];
    out.push({ date, views: d?.views ?? 0, clicks: d?.clicks ?? {} });
  }
  return out;
}

export async function flushStats() {
  if (!dirty) return;
  dirty = false;
  const cutoff = today(new Date(Date.now() - RETAIN_DAYS * 86_400_000));
  for (const k of Object.keys(stats.days)) if (k < cutoff) delete stats.days[k];
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(stats));
    await fs.rename(tmp, file);
  } catch (err) {
    dirty = true;
    console.error('Could not write stats.json', err);
  }
}
