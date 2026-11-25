# Tenax Navigation

A start page of large, animated link tiles. The whole site sits behind a Microsoft Entra ID (company account) login. Every employee can view it; admins also edit tiles, icons, colors and layout in the page. Tools open inside the page (iframe) when the target site allows it, and in a new tab otherwise.

- **Frontend:** React + Vite (`web/`)
- **Backend:** Node 22 + Hono, bundled into one `server.js` (`server/`)
- **Auth:** [`openid-client`](https://github.com/panva/openid-client) (OpenID Foundation certified), authorization code + PKCE
- **Storage:** `/data/config.json` + `/data/uploads/`, no database
- **Image:** ~53 MB compressed / ~132 MB unpacked, ~30 MB RAM idle

## Run with Docker

```bash
cp .env.example .env        # fill in the values, see "Entra ID setup"
openssl rand -base64 48     # use as SESSION_SECRET
docker compose up -d --build
```

Put it behind your existing reverse proxy (TLS). `PUBLIC_URL` must be the https URL users see, because session cookies are `Secure` when it is https. The first start seeds a demo config.

Backups: copy the `navigation-data` volume, or use **Settings → Export JSON** in the page. `config.prev.json` in the volume always holds the previous version.

## Entra ID setup

1. **Entra admin center → App registrations → New registration**
   - Name: `Tenax Navigation`, single tenant.
   - Redirect URI (Web): `https://<PUBLIC_URL>/auth/callback`
2. **Certificates & secrets → New client secret** → `OIDC_CLIENT_SECRET`.
3. **Overview** → copy the tenant ID to `OIDC_TENANT_ID` and the application (client) ID to `OIDC_CLIENT_ID`.
4. **App roles → Create app role**: display name `Navigation admin`, value `Nav.Admin`, allowed member types Users/Groups.
5. **Enterprise applications → Tenax Navigation → Users and groups** → assign the admins (or an admin group) to the `Nav.Admin` role.

6. *Only for tiles limited to security groups:* **API permissions → Add a permission → Microsoft Graph → Application permissions** → `GroupMember.Read.All` and `User.ReadBasic.All` → **Grant admin consent**. The server uses them, signed in as the app itself, to search groups in the editor and to check who is a member. Groups with hidden membership also need `Member.Read.Hidden`.

Alternatively, set `ADMIN_GROUP_ID` to a security group's object ID and enable the *groups* claim under **Token configuration**. The app role is preferred because it avoids the groups-overage limit.

**Viewers need no role.** The `Nav.Admin` role only adds **Edit page** and **Statistics**. Who can sign in at all is set under **Enterprise applications → Tenax Navigation → Properties → Assignment required?**:
- **No** (the default): any account in your tenant can sign in, including guest accounts invited from other companies.
- **Yes**: only users or groups you assign under *Users and groups* can sign in. Use this once the page is reachable from the internet, and assign an "All staff" group.

Accounts from other organizations are rejected by Microsoft, because the app is single-tenant.

## Using it

- **Hover a tile** (or focus it with Tab): the icon glides to the left and a pane of glass slides in with the description and URL. **Click** to open the tool. On touch devices the first tap reveals the tile and the second tap opens it.
- **Opening the site** sends you to Microsoft sign-in, then back to the page you asked for. Usually there's no prompt, because you're already signed in to Microsoft 365. The session lasts 8 h, after which a reload silently signs you in again. **Sign out** (top right) shows a *Signed out* page.
- **Admins** also see **Edit page** and **Statistics** in the top bar. **Edit page**:
  - Drag tiles to reorder them, and use ✎ / 🗑 on each tile.
  - **+ Section** adds a section. Sections can be renamed, moved and deleted, and get an optional company logo.
  - **Everyone / Admins only** on each section: an admin-only section is left out of the page for everyone without the `Nav.Admin` role. The server removes it before sending the page, so normal users can't find those links in the browser either.
  - **Who can see this tile** in the tile editor: *Everyone*, or *Members of security groups*. Search Entra ID security groups by name or paste an object ID; each group shows its object ID with a copy button. Only members of at least one picked group see the tile, including people in a group nested inside it. Admins always see every tile, with a 👥 badge on restricted ones in edit mode. The server leaves hidden tiles out before sending the page, and drops a section whose tiles are all hidden. Membership is checked with Microsoft Graph and kept 5 minutes, so changes show up within 5 minutes. If Graph can't be reached or the permissions from step 6 are missing, restricted tiles stay hidden (the editor's search says what's wrong).
  - **Settings**: title, logo, default theme, column count, and JSON import/export. A tile can have its own highlight colour for its hover pane.
  - **Save** publishes to everyone. **Cancel** discards the changes.
- **Open as** per tile:
  - `Auto` (default): opens inside the page unless the framing check found the site blocks it.
  - `Always inside page`.
  - `Always new tab`.
- The framing check runs when a tile is saved. The server fetches the URL and inspects `X-Frame-Options` / CSP `frame-ancestors`.

### Statistics

Signed-in admins see a **Statistics** button in the top bar, with three views for the last 7 / 30 / 90 / 365 days:

- **Overview**: page views, tool clicks, clicks per view, a daily trend, and every tool ranked by clicks. Unused tools show 0, so you can spot what nobody opens.
- **People**: everyone who has signed in, with name and email (searchable), visits, opened tools, accepted warnings and when they were last seen. Open a person to see the warnings they accepted (still valid, or the warning changed since) and their activity.
- **Activity**: the audit log of everyone: who visited the page, opened a tool, was shown a warning or accepted one. Search by person or tool, and filter by kind.

Details:

- A *view* is one page load. A *click* is one opened tool: normal, Ctrl/⌘ or middle click. On touch devices the first tap only reveals the tile, so it isn't counted.
- In the activity log, page loads by the same person within 30 minutes count as one visit.
- The daily totals are in `/data/stats.json` (kept ~400 days). The per-person activity is in `/data/audit/YYYY-MM-DD.jsonl`, one file per day, kept `AUDIT_DAYS` days (default 365). Names and emails are in `/data/people.json` and are dropped when a person's last activity expires. Accepted warnings are in `/data/acks.json`. Days follow `STATS_TZ` (default `Europe/Riga`).
- **This is personal data** (who opened what, and when). Tell the people using the page that it is recorded, and check it against your privacy policy (GDPR).
- Data is written to disk every 5–15 s and on shutdown.

### Warnings before opening

A tile can show a warning that people must read and tick before the page opens (tile editor → *Warning before opening*): level, icon, heading, text, checkbox text, and an optional wait before the open button unlocks. Every acceptance is saved per person.

- *Can be acknowledged* → **No, every time**: the warning is shown every time.
- **Yes, once per person**: someone who accepted it isn't asked again until you change its level, heading, text or checkbox text. Changing only the icon or the wait doesn't ask everyone again.

### Letting internal tools open inside the page

Many sites (Microsoft 365, GitHub, most SaaS) forbid being framed, so they always open in a new tab. For your own tools, allow the navigation host in their response headers:

```
Content-Security-Policy: frame-ancestors 'self' https://nav.tenax.lv
```
(and remove `X-Frame-Options: DENY/SAMEORIGIN`). Also note that `http://` tools cannot be framed from an `https://` page.

## Development

```bash
npm install
npm run dev -w server   # :8080, DEV_NO_AUTH=1 → everyone is admin, data in ./data
npm run dev -w web      # :5173, proxies /api /auth /uploads to :8080
```
`DEV_NO_AUTH` is for local development only. The server refuses to start with it inside the Docker image, with `NODE_ENV=production`, or with a non-localhost `PUBLIC_URL`. While it runs, it only answers requests from this machine (a loopback address and a localhost `Host`), and never answers requests passed on by a Cloudflare tunnel.
Start the server with `DEV_ADMIN=0` to see the page as a normal user (admin-only sections hidden).

## Security notes

- Every route except `/auth/*` and `/healthz` requires a signed-in session: pages redirect to sign-in, and `/api/*` returns 401. Static files are sent with `Cache-Control: private`, so Cloudflare's edge never caches them for other visitors. Every route that changes the page or shows statistics requires an admin session; signed-in users can only record their own visits, clicks and accepted warnings. The session is an HMAC-signed, httpOnly, SameSite=Lax cookie with an 8 h lifetime. On top of that, each write must send an `Origin` header matching `PUBLIC_URL` (CSRF protection).
- The config is validated with zod on the server:
  - Only `http(s)` URLs are allowed.
  - Colors and ids are pattern-checked.
  - Lengths are capped.
- Uploads:
  - The file type is sniffed from its contents.
  - Size is capped at 10 MB, and files get random names.
  - They are served with `CSP: sandbox` + `nosniff`, so an SVG containing script can't run.
- The page CSP is strict (`script-src 'self'`), plus `X-Frame-Options`, `nosniff` and, on https, HSTS.
- Sign-in only accepts accounts of the tenant in `OIDC_TENANT_ID`, which must be the tenant GUID (not `common`/`organizations`). After sign-in, the user is only sent back to a path on this site.
- Limits:
  - `/auth/*` allows 30 requests a minute per address.
  - API writes are limited per signed-in person.
  - JSON bodies are capped at 64 KB (2 MB for the page config).
  - The activity log records at most 2,000 events per person per day, and a repeat of the same event within 3 s is recorded once.
- The visitor's address for the limits comes from `CF-Connecting-IP` (Cloudflare tunnel), else from the last `X-Forwarded-For` entry when `TRUST_PROXY=1`, else from the connection.

### Publishing through a Cloudflare tunnel

- Use a production `.env`: an https `PUBLIC_URL` (the tunnel hostname), real Entra values, and no `DEV_NO_AUTH`.
- Publish the port on this machine only (`HOST_PORT=127.0.0.1:8080`) and point cloudflared at `http://localhost:8080`, or run cloudflared in the same compose project and remove `ports:`. Then nobody can skip Cloudflare by connecting to the server directly.
- In Entra, set **Enterprise applications → Tenax Navigation → Properties → Assignment required?** to **Yes** and assign your staff group. Otherwise every account in the tenant can sign in, including guest accounts invited from other companies.
- Changing `SESSION_SECRET` signs everyone out at once; sessions otherwise last up to 8 h, also after someone loses the admin role.
- The container runs as non-root on a read-only root filesystem with all capabilities dropped, limited to 128 MB of memory.
