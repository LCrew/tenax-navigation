// Checks whether a URL allows being framed by this site, by inspecting
// X-Frame-Options and CSP frame-ancestors on the target's response.
export async function probeEmbeddable(url: string, ownOrigin: string): Promise<{ embeddable: boolean | null; reason: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': 'TenaxNavigation/1.0 (frame probe)' },
    });
    res.body?.cancel().catch(() => {});
  } catch (err: any) {
    // Unknown (e.g. internal host not reachable from the container): let the browser try.
    return { embeddable: null, reason: `Not reachable from server (${err?.message ?? err}), will try inside page` };
  }

  const xfo = res.headers.get('x-frame-options')?.toLowerCase().trim();
  if (xfo === 'deny') return { embeddable: false, reason: 'X-Frame-Options: DENY' };
  if (xfo === 'sameorigin' && new URL(res.url).origin !== ownOrigin) {
    return { embeddable: false, reason: 'X-Frame-Options: SAMEORIGIN' };
  }

  const csp = res.headers.get('content-security-policy');
  const fa = csp
    ?.split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (fa) {
    const sources = fa.split(/\s+/).slice(1);
    const own = new URL(ownOrigin);
    const allowed = sources.some((s) => {
      if (s === '*') return true;
      if (s === "'self'") return new URL(res.url).origin === ownOrigin;
      if (s === `${own.protocol}`) return true;
      const m = s.match(/^(https?:\/\/)?(\*\.)?([^/:]+)(:\d+)?/i);
      if (!m) return false;
      const host = m[3].toLowerCase();
      return m[2] ? own.hostname.endsWith(`.${host}`) : own.hostname === host;
    });
    if (!allowed) return { embeddable: false, reason: `CSP ${fa}` };
  }

  return { embeddable: true, reason: 'No framing restrictions found' };
}
