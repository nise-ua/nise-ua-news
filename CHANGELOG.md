# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [3.0.1] — 2026-08-17

### Baseline

Current product baseline after reel overlay, Ukrainian copy, and publishing work.

---

## [2.0.4] — 2026-04-13

### Security Hardening + Public Release

#### Added

- Separate keys for API and Dashboard.
- 256-bit random keys (`crypto.randomBytes`).
- Rate limiting on dashboard (10 attempts / 15 min).
- Timing-safe comparison (`crypto.timingSafeEqual`).
- Domain replaced with placeholders for public repository.
- Version info in README and Dashboard.

---

## [2.0.3] — 2026-04-13

### Per-platform Publishing + Digest Fixes

#### Added

- Publication buttons per platform (📨 TG / 📘 FB separately).
- Unique `seq_number` for each digest.
- Delete digest button.
- Auto-removal of preamble before #news.
- Protection against duplicate articles between digests.

---

## [2.0.2] — 2026-04-13

### Security Audit + Authentication

#### Added

- API authentication (Bearer token).
- Dashboard authentication (HTTP Basic Auth).
- Rate limiting (30/5/3 req/min).
- SSRF protection (whitelist `perplexity.ai`).
- Disabled body logging in production.
- Full security audit (`SECURITY_AUDIT_2026-04-13.md`).

---

## [2.0.1] — 2026-04-12

### Facebook Profile Automation

#### Added

- Publication to personal Facebook Profile via Patchright (stealth Playwright).
- Separate Chromium instance with persistent session.
- Removal of link preview snippets before publication.
- macOS alert before publication.
- `fb-profile-watcher.js` (launchd cron, every 5 min).

---

## [2.0.0] — 2026-04-11

### Auto-publishing + Dashboard

#### Added

- **Article Collection**: Telegram bot accepts URLs, Chrome Extension for batch upload.
- **Digest Generation**: 2-phase generation via Claude API (Opus 4) — commentary + assembly.
- **Dashboard**: Web interface for digest management (view, copy, publish, delete).
- **Telegram Publication**: Bot API, automatic splitting into parts (max 4096 chars).
- **Facebook Page Publication**: Graph API v19.0, Page Access Token.
- **Facebook Profile Publication**: Browser automation via Patchright (stealth Playwright fork).
- **Content Enrichment**: `local-fetcher.js` — content extraction via Chrome + AppleScript (Cloudflare bypass).
- **Queue Manager**: Automatic generation when 13+ articles are accumulated.
- **Push Notifications**: Ntfy.sh.
- **Docker**: Dockerfile + `docker-compose.yml` with Traefik reverse proxy.
- **iOS Shortcut**: Share Sheet URL submission.

#### Security

- API authentication (Bearer token).
- Dashboard authentication (HTTP Basic Auth, separate password).
- Rate limiting: 30 req/min (API), 5/min (publish), 3/min (generate), 10 attempts/15min (dashboard).
- SSRF protection: whitelist only `perplexity.ai`.
- Timing-safe key comparison (`crypto.timingSafeEqual`).
- Full security audit (`SECURITY_AUDIT_2026-04-13.md`).

#### Media Pipelines (In Development)

- **Instagram**: Headline generation (5-step method, Opus 4), text overlay on templates (Sharp).
- **Video**: Research completed (Kling 3.0, Veo 3.1, Seedance 2.0).
- **Audio**: Placeholder.

#### Documentation

- Telegram setup (bot + channel).
- Facebook Page setup (Graph API, token acquisition).
- Facebook Profile setup (Patchright, bot detection bypass).
- VPS setup (Docker, Traefik, monitoring).
- iOS Shortcut.
- Mermaid architecture diagrams in README.

---

## [0.1.0] — 2026-04-03

### Prototype

#### Added

- Basic project structure.
- SQLite schema (articles + digests).
- Express API skeleton.
- Chrome Extension for article collection from Perplexity.
- Prompts: `prompt.md`, `assembly_prompt.md`, `config.md`.
