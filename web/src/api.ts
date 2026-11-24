import type { Config, WarningLevel } from '../../shared/schema';

export type StatsDay = { date: string; views: number; clicks: Record<string, number> };

/** acks: tile id → version of the warning this person accepted (see warningVersion) */
export type Me = { signedIn: boolean; isAdmin: boolean; name?: string; acks: Record<string, string> };

/** visit: opened this page; open: opened a tool; warned: was shown a tool's warning; accept: accepted it and opened the tool */
export type AuditType = 'visit' | 'open' | 'warned' | 'accept';
export type AuditEvent = { t: number; oid: string; type: AuditType; tile?: string; title?: string; level?: WarningLevel; name: string; email?: string };
export type AuditFilter = 'opened' | 'warnings' | 'visits';
export type PersonRow = { oid: string; name: string; email?: string; first: number; last: number; visits: number; opens: number; accepts: number };
/** state: current = still covers the warning; changed = the warning was edited since; removed = the tile or its warning is gone */
export type PersonAck = { tileId: string; title: string; level: WarningLevel; at: number; state: 'current' | 'changed' | 'removed'; acknowledge: boolean };


export const signIn = () => {
  location.href = `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Your session has expired. Please sign in again.');
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const send = (method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  config: () =>
    fetch('/api/config').then((r) => {
      if (r.status === 401) signIn(); // session expired while the tab was open
      return json<Config>(r);
    }),
  me: () => fetch('/api/me').then((r) => json<Me>(r)),
  saveConfig: (c: Config) => send('PUT', '/api/config', c).then((r) => json<Config>(r)),
  probe: (url: string) => send('POST', '/api/probe', { url }).then((r) => json<{ embeddable: boolean | null; reason: string }>(r)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/uploads', { method: 'POST', body: fd }).then((r) => json<{ path: string }>(r));
  },
  stats: (days: number) => fetch(`/api/stats?days=${days}`).then((r) => json<{ days: StatsDay[] }>(r)),
  people: (days: number) => fetch(`/api/people?days=${days}`).then((r) => json<{ people: PersonRow[]; keptDays: number }>(r)),
  person: (oid: string) =>
    fetch(`/api/people/${encodeURIComponent(oid)}`).then((r) => json<{ person: Omit<PersonRow, 'visits' | 'opens' | 'accepts'>; acks: PersonAck[] }>(r)),
  audit: (p: { days: number; oid?: string; type?: AuditFilter; q?: string; before?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return fetch(`/api/audit?${qs}`).then((r) => json<{ events: AuditEvent[]; more: boolean }>(r));
  },
  /** A warning was accepted: saved for this person (keepalive, as the page may open right away). */
  ack: (tileId: string) =>
    fetch('/api/ack', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tileId }) }).then((r) =>
      json<{ tileId: string; version: string }>(r),
    ),
  // Fire-and-forget; keepalive lets it finish even if the page navigates away.
  track: (ev: { type: 'view' } | { type: 'click'; tileId: string }) =>
    fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }).catch(() => {}),
  logout: () =>
    fetch('/auth/logout', { method: 'POST' })
      .then((r) => r.json())
      .then((r: { redirect: string }) => (location.href = r.redirect)),
};

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
