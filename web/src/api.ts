import type { Config } from '../../shared/schema';

export type StatsDay = { date: string; views: number; clicks: Record<string, number> };

export type Me = { signedIn: boolean; isAdmin: boolean; name?: string };

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
