import path from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const devNoAuth = process.env.DEV_NO_AUTH === '1';
if (devNoAuth && process.env.NODE_ENV === 'production') {
  throw new Error('DEV_NO_AUTH must not be enabled in production');
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: path.resolve(process.env.DATA_DIR ?? '/data'),
  staticDir: path.resolve(process.env.STATIC_DIR ?? '../web/dist'),
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  trustProxy: process.env.TRUST_PROXY === '1',
  devNoAuth,
  sessionSecret: devNoAuth ? 'dev-only-insecure-secret-dev-only-insecure' : required('SESSION_SECRET'),
  oidc: devNoAuth
    ? null
    : {
        tenantId: required('OIDC_TENANT_ID'),
        clientId: required('OIDC_CLIENT_ID'),
        clientSecret: required('OIDC_CLIENT_SECRET'),
        adminRole: process.env.ADMIN_ROLE ?? 'Nav.Admin',
        adminGroupId: process.env.ADMIN_GROUP_ID || undefined,
      },
};

if (env.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
