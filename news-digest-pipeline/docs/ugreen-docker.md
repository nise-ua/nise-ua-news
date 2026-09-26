## Canonical NAS deploy (this household)

The live app is the NAS container, not the laptop process on port 3000. Application code is baked into the image at `/volume1/docker/news-digest`. Restarting localhost, or editing files only on the laptop, does not change what the dashboard and Chrome plugin use.

After every application change, deploy this repo and confirm health:

```bash
/Users/nicksergeenkov/DevProjects/ugreen/news-digest/scripts/deploy-nas.sh
curl -sS http://192.168.1.22:3010/health
```

| | |
|---|---|
| NAS | `192.168.1.22` (`/volume1/docker/news-digest`) |
| SSH | `Nick@192.168.1.22` port **122** |
| Dashboard | http://192.168.1.22:3010 |
| Host port | **3010** (Sure already uses 3000; container listens on 3000) |

Chrome plugin: load `extension/`, URL `http://192.168.1.22:3010`, Bearer = `API_SECRET_KEY` from `news-digest-pipeline/.env`.


Run the dashboard on a UGREEN NAS (Container Manager / Docker), then send articles from Chrome on your laptop.

## What you get

- Container on port **3000** (no Traefik)
- Persistent SQLite in `./data`
- Prompt files mounted from `news-digest-pipeline/prompts`
- Chrome extension posts to `http://192.168.1.22:3010/api/articles/batch`

Facebook Profile composer (Patchright) still needs a Mac. Covers/reels need the same API keys as local.

## Files to copy onto the NAS

Keep this layout on a share (example: `/volume1/docker/news/`):

```text
news/
  news-digest-pipeline/
    prompts/
      prompt.md
      assembly_prompt.md
      prompt_deep.md
      config.md
    Dockerfile
    docker-compose.ugreen.yml
    .env
    src/
    production/
    package.json
    package-lock.json
```

## .env (all parameters)

Copy `news-digest-pipeline/.env.example` to `.env` on the NAS and fill:

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `production` (enables API + dashboard auth) |
| `PORT` | yes | `3000` |
| `BASE_URL` | yes | `http://192.168.1.22:3010` |
| `API_SECRET_KEY` | yes | Bearer key for Chrome plugin + API |
| `DASHBOARD_USER` | yes | Basic auth user (default `admin`) |
| `DASHBOARD_PASSWORD` | yes | Dashboard login password |
| `LLM_VENDOR` | yes | `openai` / `anthropic` / `openrouter` / `moonshot` / `cursor` |
| `LLM_MODEL` | yes | Model id from `model-catalog.js` |
| `OPENAI_API_KEY` | if vendor openai | Digest LLM |
| `ANTHROPIC_API_KEY` | if vendor anthropic | Digest LLM |
| `OPENROUTER_API_KEY` | if vendor openrouter | Digest / some images |
| `MOONSHOT_API_KEY` | if vendor moonshot | Kimi |
| `CURSOR_API_KEY` | if vendor cursor | Cloud Agents for digest text |
| `CLOUDFLARE_ACCOUNT_ID` | for covers/reels | Workers AI images |
| `CLOUDFLARE_API_TOKEN` | for covers/reels | Workers AI images |
| `IMAGE_VENDOR` | optional | default `cloudflare` |
| `COVER_IMAGE_VENDOR` | optional | default `cloudflare` |
| `REEL_FRAME_MODE` | optional | `ai` or `html` |
| `DB_PATH` | optional | compose sets `/app/data/news-digest.db` |
| `ARTICLE_THRESHOLD` | optional | default `13` |
| `MAX_ARTICLES_PER_DIGEST` | optional | default `17` |
| `CHECK_INTERVAL_MS` | optional | default `60000` |
| `NTFY_TOPIC` | optional | push notifications |
| `FACEBOOK_PAGE_*` | optional | Page Graph publish |
| `POSTIZ_*` | optional | Postiz publisher |
| `TELEGRAM_*` | optional | Telegram ingest/publish |
| `YOUTUBE_*` | optional | unused unless you enable it |

Generate secrets:

```bash
openssl rand -base64 32
```

Use different values for `API_SECRET_KEY` and `DASHBOARD_PASSWORD`.

## UGREEN Container Manager

1. Open **Container Manager** → **Project** → **Create**.
2. Path: the `news-digest-pipeline` folder on the share.
3. Compose file: `docker-compose.ugreen.yml`.
4. Build and start.

Or SSH into the NAS:

```bash
cd /volume1/docker/news-digest
docker compose up -d --build
docker compose ps
curl -sS http://127.0.0.1:3010/health
```

Open the dashboard from a PC on the same LAN:

```text
http://192.168.1.22:3010
```

Login: `DASHBOARD_USER` / `DASHBOARD_PASSWORD`.

If the page does not load, in UGREEN **Control Panel → Firewall** allow inbound TCP **3010** on the LAN.

## Chrome plugin → UGREEN app

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**.
2. Select the repo `extension/` folder.
3. Open the plugin popup.
4. **UGREEN / app URL:** `http://192.168.1.22:3010` (no trailing slash).
5. **API_SECRET_KEY:** the same value as in NAS `.env`.
6. **Save destination**.
7. Open a news article, refresh the tab once after installing, then **Collect Current Page**.

The plugin POSTs scraped `{ url, title, content }` to `/api/articles/batch`. Production mode rejects requests without the Bearer key.

## Notes

- Mixed HTTP on LAN is expected. Do not put this port on the public internet without a reverse proxy and TLS.
- The live app is this NAS image. Rebuild after code changes with `/Users/nicksergeenkov/DevProjects/ugreen/news-digest/scripts/deploy-nas.sh`, then check http://192.168.1.22:3010/health.
