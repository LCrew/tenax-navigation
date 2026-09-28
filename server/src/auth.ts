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

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const s = await getSession(c);
  if (!s) return c.json({ error: 'Not signed in' }, 401);
  if (!s.isAdmin) return c.json({ error: 'Admin access required' }, 403);
  await next();
};

export const auth = new Hono();

auth.get('/login', async (c) => {
  if (env.devNoAuth) return c.redirect('/');
  const config = await getOidcConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify({ verifier, state, nonce }), env.sessionSecret, {
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
  if (!raw) return c.text('Login expired, please try again.', 400);
  const { verifier, state, nonce } = JSON.parse(raw);

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
    return c.text('Sign-in failed.', 401);
  }
  if (!claims) return c.text('Sign-in failed.', 401);

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
  return c.redirect(isAdmin ? '/' : '/?denied=1');
});

auth.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
