import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import * as oidc from 'openid-client';
import { env } from './env';

export type Session = { oid: string; name: string; isAdmin: boolean; exp: number };

const SESSION_COOKIE = 'nav_session';
const LOGIN_COOKIE = 'nav_login';
const SESSION_TTL_S = 8 * 60 * 60;
const secure = env.publicUrl.startsWith('https://');
const redirectUri = `${env.publicUrl}/auth/callback`;

let configPromise: Promise<oidc.Configuration> | null = null;
function getOidcConfig() {
  if (!env.oidc) throw new Error('OIDC not configured');
  const { tenantId, clientId, clientSecret } = env.oidc;
  configPromise ??= oidc
    .discovery(new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`), clientId, clientSecret)
    .catch((err) => {
      configPromise = null; // retry discovery on next login
      throw err;
    });
  return configPromise;
}

export async function getSession(c: Parameters<MiddlewareHandler>[0]): Promise<Session | null> {
  if (env.devNoAuth) return { oid: 'dev', name: 'Dev Admin', isAdmin: true, exp: Infinity };
  const raw = await getSignedCookie(c, env.sessionSecret, SESSION_COOKIE);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

// Only same-site relative paths, so the login flow can't be used as an open redirect.
function safeReturnTo(v: string | undefined) {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') && !v.startsWith('/auth/') ? v : '/';
}

// Site-wide gate: everything except sign-in routes and the health check needs a company login.
export const requireLogin: MiddlewareHandler = async (c, next) => {
  const p = c.req.path;
  if (p === '/healthz' || p.startsWith('/auth/') || (await getSession(c))) return next();
  if (p.startsWith('/api/')) return c.json({ error: 'Not signed in' }, 401);
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.text('Not signed in', 401);
  const url = new URL(c.req.url);
  return c.redirect(`/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const s = await getSession(c);
  if (!s) return c.json({ error: 'Not signed in' }, 401);
  if (!s.isAdmin) return c.json({ error: 'Admin access required' }, 403);
  await next();
};

export const auth = new Hono();

auth.get('/login', async (c) => {
  const returnTo = safeReturnTo(c.req.query('returnTo'));
  if (env.devNoAuth) return c.redirect(returnTo);
  const config = await getOidcConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify({ verifier, state, nonce, returnTo }), env.sessionSecret, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/auth',
    maxAge: 600,
  });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return c.redirect(url.href);
});

auth.get('/callback', async (c) => {
  const raw = await getSignedCookie(c, env.sessionSecret, LOGIN_COOKIE);
  deleteCookie(c, LOGIN_COOKIE, { path: '/auth' });
  if (!raw) return c.redirect('/auth/login'); // e.g. the sign-in tab sat open too long; just start over
  const { verifier, state, nonce, returnTo } = JSON.parse(raw);

  const config = await getOidcConfig();
  const current = new URL(redirectUri);
  current.search = new URL(c.req.url).search;

  let claims: oidc.IDToken | undefined;
  try {
    const tokens = await oidc.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
    claims = tokens.claims();
  } catch (err) {
    console.error('OIDC callback failed', err);
    return c.html(messagePage('Sign-in failed', 'Microsoft sign-in could not be completed.'), 401);
  }
  if (!claims) return c.html(messagePage('Sign-in failed', 'Microsoft sign-in could not be completed.'), 401);

  const roles = (claims.roles as string[] | undefined) ?? [];
  const groups = (claims.groups as string[] | undefined) ?? [];
  const isAdmin =
    roles.includes(env.oidc!.adminRole) || (!!env.oidc!.adminGroupId && groups.includes(env.oidc!.adminGroupId));

  const session: Session = {
    oid: String(claims.oid ?? claims.sub),
    name: String(claims.name ?? claims.preferred_username ?? 'User'),
    isAdmin,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
  };
  await setSignedCookie(c, SESSION_COOKIE, JSON.stringify(session), env.sessionSecret, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
  return c.redirect(safeReturnTo(returnTo));
});

// Signing out lands on a static page instead of the site, which would immediately bounce back to Microsoft.
auth.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ redirect: '/auth/signed-out' });
});

auth.get('/signed-out', (c) => c.html(messagePage('Signed out', 'You have been signed out.')));

function messagePage(title: string, text: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0e1020;color:#eef0ff}
main{text-align:center;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}p{opacity:.75;margin:0 0 20px}
a{display:inline-block;padding:10px 18px;border-radius:10px;background:#f5a623;color:#12142a;font-weight:600;text-decoration:none}
</style></head><body><main><h1>${title}</h1><p>${text}</p><a href="/auth/login">Sign in with Microsoft</a></main></body></html>`;
}
