import fs from 'node:fs';
import path from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const publicUrl = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
export const isLocalHost = (host: string) => LOCAL_HOSTS.includes(host.replace(/:\d+$/, '').toLowerCase());

function tenantGuid(v: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new Error('OIDC_TENANT_ID must be the directory (tenant) ID, a GUID');
  }
  return v.toLowerCase();
}

// DEV_NO_AUTH makes everyone an admin without signing in, so it is for `npm run dev` only. The Docker image
// refuses it through a file baked into the image: NODE_ENV isn't enough, an env_file can override it.
const devNoAuth = process.env.DEV_NO_AUTH === '1';
if (devNoAuth && (fs.existsSync('/app/.production-image') || process.env.NODE_ENV === 'production')) {
  throw new Error('DEV_NO_AUTH is not allowed in the Docker image or with NODE_ENV=production');
}
if (devNoAuth && !isLocalHost(new URL(publicUrl).host)) {
  throw new Error('DEV_NO_AUTH needs a localhost PUBLIC_URL');
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: path.resolve(process.env.DATA_DIR ?? '/data'),
  staticDir: path.resolve(process.env.STATIC_DIR ?? '../web/dist'),
  publicUrl,
  trustProxy: process.env.TRUST_PROXY === '1',
  devNoAuth,
  /** DEV_NO_AUTH only: DEV_ADMIN=0 signs you in as a normal user, to see what non-admins see. */
  devAdmin: process.env.DEV_ADMIN !== '0',
  sessionSecret: devNoAuth ? 'dev-only-insecure-secret-dev-only-insecure' : required('SESSION_SECRET'),
  oidc: devNoAuth
    ? null
    : {
        // A tenant GUID, never common/organizations/consumers: those would let any Microsoft account in.
        tenantId: tenantGuid(required('OIDC_TENANT_ID')),
        clientId: required('OIDC_CLIENT_ID'),
        clientSecret: required('OIDC_CLIENT_SECRET'),
        adminRole: process.env.ADMIN_ROLE ?? 'Nav.Admin',
        adminGroupId: process.env.ADMIN_GROUP_ID || undefined,
      },
};

if (env.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
