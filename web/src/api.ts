import type { Config } from '../../shared/schema';

export type Me = { signedIn: boolean; isAdmin: boolean; name?: string };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const send = (method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  config: () => fetch('/api/config').then((r) => json<Config>(r)),
  me: () => fetch('/api/me').then((r) => json<Me>(r)),
  saveConfig: (c: Config) => send('PUT', '/api/config', c).then((r) => json<Config>(r)),
  probe: (url: string) => send('POST', '/api/probe', { url }).then((r) => json<{ embeddable: boolean | null; reason: string }>(r)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/uploads', { method: 'POST', body: fd }).then((r) => json<{ path: string }>(r));
  },
  logout: () => fetch('/auth/logout', { method: 'POST' }),
};

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
