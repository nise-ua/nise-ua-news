# Distribution

Channel docs and stubs. Live publishers and media CLIs live elsewhere.

## Current layout

| Area | Role |
|------|------|
| `src/` | App server + publishers (`src/services/publishers/…`) |
| `production/` | Media CLI factory (image, reel/video, audio) |
| `distribution/` | Channel setup docs + thin README stubs (no live publisher CLIs) |
| `scripts/` | Mac-local Facebook profile automation (`fb-publish.js`, `fb-profile-watcher.js`) |

## Channels

| Channel | Live code | Notes here |
|---------|-----------|------------|
| Telegram | `src/services/publishers/` | Stub + `telegram/telegram-setup.md` |
| Facebook Page | `src/services/publishers/facebook.js` (+ page helpers) | Stub + `facebook-page/facebook-page-setup.md` |
| Facebook Profile | `scripts/fb-publish.js`, `scripts/fb-profile-watcher.js` | Stub + `facebook-profile/facebook-setup.md` |

Archived duplicate CLIs: `.archive/distribution/`.
