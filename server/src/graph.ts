// Microsoft Graph, called as the app itself (client credentials), for tiles shown only to members of
// security groups: searching groups in the editor, and checking who is a member.
//
// The app registration needs these Microsoft Graph *application* permissions, with admin consent:
//   GroupMember.Read.All  – find groups and read their members
//   User.ReadBasic.All    – check a person's group memberships
// Groups with hidden membership also need Member.Read.Hidden.
import { env } from './env';

export type SecurityGroup = { id: string; name: string; description?: string };

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: string) => GUID.test(v);

const MEMBERSHIP_TTL = 5 * 60_000; // membership changes show up within 5 minutes
const FAILED_TTL = 30_000; // after a failed check, try again soon (until then: not a member)
const MAX_CACHED_PEOPLE = 5000;

/**
 * Thrown with a message an administrator can act on. Sent to the editor as 503, not 502: Cloudflare replaces an
 * origin's 502 and 504 responses with its own error page, and the message would be lost.
 */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const PERMISSIONS_HINT =
  'Give the app registration the Microsoft Graph application permissions GroupMember.Read.All and User.ReadBasic.All, then grant admin consent (see README).';

// ---- test mode: made-up groups, so the editor can be tried without a tenant ----

const DEV_GROUPS: SecurityGroup[] = [
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d01', name: 'Finance', description: 'Accounting and invoicing' },
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d02', name: 'IT Administrators', description: 'Servers, accounts and devices' },
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d03', name: 'Production – Riga', description: 'Factory floor staff' },
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d04', name: 'Warehouse', description: 'Logistics and stock' },
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d05', name: 'HR', description: 'People and payroll' },
  { id: '0f6c3a52-1d2e-4b8a-9c41-6a1d2b3c4d06', name: 'Sales Latvia' },
];
/** DEV_GROUPS=<id>,<id>: the groups the test user (DEV_ADMIN=0) is a member of. */
const devMemberOf = new Set((process.env.DEV_GROUPS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

// ---- app token ----

let token: { value: string; until: number } | null = null;
let tokenRequest: Promise<string> | null = null;

/** fetch, with network failures and timeouts turned into a message for the editor */
async function reach(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    console.error(`Could not reach ${new URL(url).host}:`, e instanceof Error ? (e.cause ?? e.message) : e);
    throw new GraphError(`Could not reach ${new URL(url).host} from the server. Check its internet access and DNS.`, 503);
  }
}

async function appToken(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  tokenRequest ??= (async () => {
    const { tenantId, clientId, clientSecret } = env.oidc!;
    const res = await reach(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) {
      console.error('Graph token request failed', res.status, body.error_description);
      const code = body.error_description?.match(/AADSTS\d+/)?.[0] ?? res.status;
      throw new GraphError(`Could not sign in to Microsoft Graph as the app (${code}). Check OIDC_TENANT_ID, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET.`, 503);
    }
    // renew 5 minutes before it runs out
    token = { value: body.access_token, until: Date.now() + Math.max((body.expires_in ?? 3600) - 300, 60) * 1000 };
    return token.value;
  })().finally(() => (tokenRequest = null));
  return tokenRequest;
}

async function graph<T>(path: string, init: { method?: string; body?: unknown; eventual?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${await appToken()}` };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.eventual) headers.ConsistencyLevel = 'eventual'; // needed for $search and $count
  const res = await reach(GRAPH + path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return (await res.json()) as T;
  const err = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  console.error(`Graph ${init.method ?? 'GET'} ${path.split('?')[0]} failed`, res.status, err.error?.code, err.error?.message);
  if (res.status === 401 || res.status === 403) {
    // permissions granted after this token was issued only show up in a new one
    token = null;
    throw new GraphError(`Microsoft Graph refused the request (${err.error?.code ?? res.status}). ${PERMISSIONS_HINT}`, 503);
  }
  if (res.status === 404) throw new GraphError('Not found', 404);
  throw new GraphError(`Microsoft Graph answered with an error (${err.error?.code ?? res.status}): ${err.error?.message ?? 'no details'}`, 503);
}

type GraphGroup = { id: string; displayName: string | null; description: string | null; securityEnabled?: boolean };
const toGroup = (g: GraphGroup): SecurityGroup => ({ id: g.id.toLowerCase(), name: g.displayName ?? '(no name)', description: g.description || undefined });
const SELECT = '$select=id,displayName,description,securityEnabled';

/**
 * Security groups for the editor's picker: by name (words starting with the text), by exact object ID,
 * or the first ones alphabetically when the search is empty.
 */
export async function searchSecurityGroups(q: string): Promise<SecurityGroup[]> {
  q = q.trim().slice(0, 100);
  if (!env.oidc) {
    const t = q.toLowerCase();
    return DEV_GROUPS.filter((g) => !t || g.id === t || g.name.toLowerCase().includes(t) || g.description?.toLowerCase().includes(t));
  }
  if (isGuid(q)) {
    try {
      const g = await graph<GraphGroup>(`/groups/${q}?${SELECT}`);
      return g.securityEnabled ? [toGroup(g)] : [];
    } catch (e) {
      if (e instanceof GraphError && e.status === 404) return [];
      throw e;
    }
  }
  // $search takes a quoted phrase; quotes and backslashes in it would end the phrase early
  const words = q.replace(/["\\]/g, ' ').trim();
  const params = [SELECT, '$filter=securityEnabled eq true', '$orderby=displayName', '$count=true', '$top=25'];
  if (words) params.push(`$search=${encodeURIComponent(`"displayName:${words}"`)}`);
  const res = await graph<{ value: GraphGroup[] }>(`/groups?${params.join('&')}`, { eventual: true });
  return res.value.map(toGroup);
}

/** Current names of the given groups (renamed ones get their new name); missing: deleted, or not a security group. */
export async function lookUpGroups(ids: string[]): Promise<{ groups: SecurityGroup[]; missing: string[] }> {
  ids = [...new Set(ids.map((i) => i.toLowerCase()).filter(isGuid))].slice(0, 20);
  if (!env.oidc) {
    const groups = DEV_GROUPS.filter((g) => ids.includes(g.id));
    return { groups, missing: ids.filter((i) => !groups.some((g) => g.id === i)) };
  }
  const found = await Promise.all(
    ids.map((id) =>
      graph<GraphGroup>(`/groups/${id}?${SELECT}`).then(
        (g) => (g.securityEnabled ? toGroup(g) : null),
        (e) => {
          if (e instanceof GraphError && e.status === 404) return null;
          throw e;
        },
      ),
    ),
  );
  const groups = found.filter((g): g is SecurityGroup => !!g);
  return { groups, missing: ids.filter((i) => !groups.some((g) => g.id === i)) };
}

// ---- membership ----

type Entry = { member: boolean; until: number };
const memberships = new Map<string, Map<string, Entry>>(); // person (oid) → group id → answer
const inFlight = new Map<string, Promise<void>>();

/**
 * Which of these groups the person is a member of, directly or through nested groups. Answers are kept for
 * 5 minutes. When Graph can't be asked, the answer is "not a member": restricted tiles stay hidden.
 */
export async function memberGroups(oid: string, groupIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(groupIds.map((g) => g.toLowerCase()))];
  if (!ids.length) return new Set();
  if (!env.oidc) return new Set(ids.filter((g) => devMemberOf.has(g)));

  // one lookup per person at a time: the page asks for the config and the person's details together
  const pending = inFlight.get(oid);
  if (pending) await pending;
  let answers = memberships.get(oid);
  const now = Date.now();
  const missing = ids.filter((g) => (answers?.get(g)?.until ?? 0) <= now);
  if (missing.length) {
    if (!answers) {
      if (memberships.size >= MAX_CACHED_PEOPLE) memberships.delete(memberships.keys().next().value!);
      answers = new Map();
      memberships.set(oid, answers);
    }
    const p = check(oid, missing, answers).finally(() => inFlight.delete(oid));
    inFlight.set(oid, p);
    await p;
  }
  return new Set(ids.filter((g) => answers!.get(g)?.member));
}

async function check(oid: string, ids: string[], answers: Map<string, Entry>) {
  const ask = (groupIds: string[]) =>
    graph<{ value: string[] }>(`/users/${encodeURIComponent(oid)}/checkMemberGroups`, { method: 'POST', body: { groupIds } }).then(
      (res) => new Set(res.value.map((v) => v.toLowerCase())),
    );
  const save = (groupIds: string[], yes: Set<string> | null) => {
    const until = Date.now() + (yes ? MEMBERSHIP_TTL : FAILED_TTL);
    for (const g of groupIds) answers.set(g, { member: !!yes?.has(g), until });
  };
  // checkMemberGroups takes at most 20 groups per request, and one bad group (e.g. deleted) fails the whole
  // request, so a failed batch is asked again one group at a time
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    try {
      save(chunk, await ask(chunk));
    } catch {
      if (chunk.length === 1) save(chunk, null);
      else await Promise.all(chunk.map((g) => ask([g]).then((yes) => save([g], yes), () => save([g], null))));
    }
  }
}
