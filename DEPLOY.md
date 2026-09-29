# Deploy — Beast Kingdom Online → game.appkhun.com/bko/

DirectAdmin @ aws3.hostinglotus.net:2222, account `appkhunc`. The domain already serves another
game at its root, so BKO lives in the **/bko/** subfolder and the game server under **/ws**.

Both zips are built and verified locally: the client was served from a `/bko/` path and the server
was run behind the same `/ws` mount a client then connected through.

## 1. Client — `client.zip`

File Manager → `domains/game.appkhun.com/public_html` → create folder **bko** → open it →
Upload `client.zip` → Extract → delete the zip.

`index.html` must end up at `public_html/bko/index.html` (not `bko/client/index.html`; the zip
contains a `client/` folder, so either extract and move the contents up, or extract the inner
folder's contents into `bko/`).

Check: **https://game.appkhun.com/bko/** shows the character creator and plays single-player.
It says "โหมดออฟไลน์" until step 2 is done.

## 2. Server — `server-app.zip` (multiplayer)

Upload and extract to `~/bko-server` — **outside** public_html.

Setup Node.js App:

| Field | Value |
|---|---|
| Application root | `bko-server` |
| Application URL | `game.appkhun.com/ws` |
| Application startup file | `app.js` |
| Node version | 18 or newer |

Environment variables (same screen):

| Name | Value |
|---|---|
| `BKO_BASE_PATH` | `/ws` — must match the Application URL path |
| `BKO_DATA` | `/home/appkhunc/bko-data` — character saves; create that folder first |
| `GOOGLE_CLIENT_ID` | OAuth Web application client id — must equal the `VITE_GOOGLE_CLIENT_ID` used for the client build |

`PORT` is set by the panel — do not add it. Then **Run NPM Install** → **Start**.

Check the mount from any machine:

```bash
curl -X POST -H 'content-type: application/json' -d '{}' \
  https://game.appkhun.com/ws/matchmake/joinOrCreate/map
```

JSON back (even an error about the token) = the mount works. `404` = the Application URL and
`BKO_BASE_PATH` disagree. A hang = the host is not passing WebSocket upgrades, see below.

Then reload https://game.appkhun.com/bko/ — the chat should read
"ออนไลน์ — ผู้เล่นคนอื่นในแมพเดียวกันมองเห็นกัน", and two browsers should see each other move.

The client already points at `wss://game.appkhun.com/ws` (baked in at build time). To aim it
somewhere else without rebuilding: `?server=wss://other-host`. `?offline=1` forces single-player.

### If the host blocks WebSocket
Shared hosting sometimes proxies HTTP only. Keep the client where it is and run `server-app` on a
box that allows long-lived sockets (small VPS, Fly.io, Railway), then rebuild the client with:

```bash
cd web && BASE_PATH=/bko/ VITE_SERVER_URL=wss://<that-host> npm run build
```

## Rebuilding

```bash
cd web
BASE_PATH=/bko/ VITE_SERVER_URL=wss://game.appkhun.com/ws VITE_GOOGLE_CLIENT_ID=<oauth-web-client-id> npm run build   # → dist/, upload into bko/
```

For `pawtalekingdoms.com`, use `BASE_PATH=/`, `VITE_SERVER_URL=wss://pawtalekingdoms.com/ws`, and add
`https://pawtalekingdoms.com` plus `https://www.pawtalekingdoms.com` as Authorized JavaScript origins in the OAuth
client. Google Identity Services does not need a redirect URI in this implementation. Never upload the downloaded
`client_secret*.json`; only the public client id is required.

Bump `CACHE` in `client/public/sw.js` whenever assets change, or the service worker keeps serving
the old build to anyone who has already visited.

## Letting Claude deploy (no password anywhere)

Claude will not type your panel password into a login form. Install a deploy key instead:

1. DirectAdmin → **SSH Keys** → Add Key → paste, tick "Allow this key to login":
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILamtAsuvvySBPjLGuK2Y/CNYOfsBOo5jw94O4Jy5FLF bko-deploy@4-25911
   ```
2. Enable SSH for the account, and tell Claude the host and port.
   (Port 22 on `aws3.hostinglotus.net` currently times out from here — it may need whitelisting.)
3. Deploys then run without any secret on Claude's side:
   ```bash
   rsync -az --delete -e "ssh -i ~/.ssh/bko_deploy -p <port>" web/dist/ \
     appkhunc@<host>:domains/game.appkhun.com/public_html/bko/
   ```

The private key never leaves this machine; revoking access is deleting the key in the panel.

## Notes before a public launch

- `shared/data/levels.json` → `startGold` is `20` in this build. Raise it there (never in code) for
  rich test characters.
- Characters are keyed by a random token in the browser's localStorage. Clearing site data loses the
  character — real accounts (email login) are unfinished W3 work.
- Saves land in `BKO_DATA` as one JSON per account. Set `DATABASE_URL` instead to use Postgres.
