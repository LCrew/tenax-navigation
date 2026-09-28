# Tenax Navigation

A start page of large, animated link tiles. Anyone on the network can view it. Admins sign in with Microsoft Entra ID and edit tiles, icons, colors and layout in the page. Tools open inside the page (iframe) when the target site allows it, and in a new tab otherwise.

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

Alternatively, set `ADMIN_GROUP_ID` to a security group's object ID and enable the *groups* claim under **Token configuration**. The app role is preferred because it avoids the groups-overage limit.

People who sign in without the role can still view the page but cannot edit it.

## Using it

- **Hover a tile** (or focus it with Tab): bars sweep in, then the description and URL appear. **Click** to open the tool. On touch devices the first tap reveals the tile and the second tap opens it.
- **Admin link** (top right, subtle) → Microsoft sign-in → **Edit page**:
  - Drag tiles to reorder them, and use ✎ / 🗑 on each tile.
  - **+ Section** adds a section. Sections can be renamed, moved and deleted.
  - **Settings**: title, logo, color mode, column count, theme colors, the three hover-bar colors, and JSON import/export.
  - **Save** publishes to everyone. **Cancel** discards the changes.
- **Open as** per tile:
  - `Auto` (default): opens inside the page unless the framing check found the site blocks it.
  - `Always inside page`.
  - `Always new tab`.
- The framing check runs when a tile is saved. The server fetches the URL and inspects `X-Frame-Options` / CSP `frame-ancestors`.

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
`DEV_NO_AUTH` refuses to start when `NODE_ENV=production`.

## Security notes

- Every write route requires an admin session. The session is an HMAC-signed, httpOnly, SameSite=Lax cookie with an 8 h lifetime. On top of that, each write must send an `Origin` header matching `PUBLIC_URL` (CSRF protection).
- The config is validated with zod on the server:
  - Only `http(s)` URLs are allowed.
  - Colors and ids are pattern-checked.
  - Lengths are capped.
- Uploads:
  - The file type is sniffed from its contents.
  - Size is capped at 10 MB, and files get random names.
  - They are served with `CSP: sandbox` + `nosniff`, so an SVG containing script can't run.
- The page CSP is strict (`script-src 'self'`). Rate limits apply to `/auth/*` and to API writes.
- The container runs as non-root on a read-only root filesystem with all capabilities dropped, limited to 128 MB of memory.
