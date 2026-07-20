# Technical Specification: News Digest Pipeline v2.0

## Overview

This document provides the full technical specification for the News Digest Pipeline automation — a system for collecting, processing, and distributing news digests.

## Project Documents

- **Main README**: `README.md`
- **Changelog**: `CHANGELOG.md`
- **Security Audit**: `SECURITY_AUDIT_2026-04-13.md`

## Document Structure

### 1. Introduction and Project Overview
- **Goal**: Automate the pipeline from article collection to publication.
- **Stakeholders**: Content managers, social media managers.
- **Scope**: Phase 1 (Standalone system), Phase 2 (Media pipelines).

### 2. Current State (AS-IS)
- **Process**: Manual collection via Chrome Extension → JSON upload to Claude → Digest generation.
- **Extension Structure**: Manifest v3.
- **Algorithm**: Parsing, filtering, deduplication.
- **Pain Points**: Manual steps at every stage, poor scalability.

### 3. Target State (TO-BE)
- **Full Automation**: iOS Shortcut / Telegram Bot → API → Accumulation → Auto-generation → Notification → Publication.
- **Mobile Support**: Native sharing from mobile devices.
- **OS Notifications**: Push notifications when a digest is ready.
- **Media Support**: Instagram image and video reels generation.

### 4. System Architecture
**Components:**
- **Input Methods**: iOS Shortcut, Telegram Bot, Chrome Extension.
- **API Gateway**: Express.js REST API.
- **Article Accumulator**: SQLite database.
- **Queue Manager & Digest Generator**: Automated Claude API integration.
- **Notification Service**: Ntfy.sh integration.
- **Social Media Publisher**: Telegram Bot API, Facebook Graph API.
- **Media Pipeline**: fal.ai, Recraft V3, FFmpeg.

**Tech Stack:**
- **Runtime**: Node.js 20+
- **Database**: SQLite (better-sqlite3)
- **LLM**: Claude API (Opus 4)
- **Deployment**: Docker, Traefik

### 5. Component Specification

#### Input Methods Comparison
| Method | Platform | Advantages | Disadvantages | Priority |
|-------|-----------|--------------|-----------|-----------|
| iOS Shortcut | iOS (iPhone/iPad) | System-level integration, fast | Requires user setup | High |
| Telegram Bot | Telegram (All) | Universal, simple API, cross-platform | Requires Telegram account | Medium |
| Desktop Extension | Chrome | Native browsing experience | Desktop only | High |

#### Core Components
- **API Gateway**: RESTful endpoints for articles and digests.
- **Article Accumulator**: URL-based deduplication, status management.
- **Digest Generator**: Multi-phase generation (Commentary + Assembly).
- **Queue Manager**: Threshold-based check (13+ articles) every minute.
- **Notification Service**: Push via Ntfy.sh.
- **Social Media Publisher**: Multi-platform support (TG, FB).

### 6. Data Formats

**Input JSON (from Extension):**
```json
{
  "timestamp": "2026-04-02T14:30:00Z",
  "count": 12,
  "items": [
    { "url": "...", "title": "...", "content": "..." }
  ]
}
```

**Database Record:**
```json
{
  "id": "uuid",
  "url": "string",
  "title": "string",
  "content": "string (nullable)",
  "source": "perplexity | telegram | shortcut",
  "status": "new | pending | published | archived",
  "created_at": "timestamp",
  "digest_id": "uuid | null"
}
```

**Digest:**
```json
{
  "id": "uuid",
  "date": "2026-04-02",
  "part": 1,
  "seq_number": 1,
  "articles_count": 15,
  "content": "#news\n1. [commentary]\n[url]\n...",
  "status": "draft | published",
  "published_at": "timestamp",
  "facebook_post_id": "string | null",
  "telegram_message_id": "string | null"
}
```

### 7. API Specification

**Key Endpoints:**
- `POST /api/articles` — Add an article.
- `GET /api/articles` — List articles with filtering.
- `DELETE /api/articles/:id` — Remove an article.
- `POST /api/digests/generate` — Trigger manual generation.
- `GET /api/digests` — List digests.
- `POST /api/digests/:id/publish` — Publish to social media.

### 8. Implementation Phases
1. **Phase 1**: Core system (API, DB, Digest generation).
2. **Phase 2**: Input methods (iOS Shortcut, TG Bot, Extension updates).
3. **Phase 3**: Notifications & Publishing (Ntfy.sh, FB API).
4. **Phase 4**: Media Pipelines (Instagram images, Video reels).

---

**Status**: Published
**Version**: 2.0
