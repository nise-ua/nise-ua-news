# Graph Report - news  (2026-09-25)

## Corpus Check
- 192 files · ~127,768 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 8, .mdc 2, .disabled 1)

## Summary
- 1563 nodes · 3444 edges · 92 communities (75 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4da1f8d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- stitch.js
- generate-digest-cover.js
- reel-ukrainian-copy.js
- visual-grounding.js
- generate-clips.js
- generate-reel.js
- dependencies
- reel-copy-review.js
- facebook-page-browser.js
- publishers/postiz.js
- background-music.js
- News Digest Pipeline v3.1.0
- manifest.json
- lib/digest.js
- ref_fs
- local-fetcher.js
- digest-generator.js
- video-generator.js
- storyboard.js
- digest-workflow.js
- generate.js
- settings.js
- fb-profile-watcher.js
- src/index.js
- auth.js
- publishers/index.js
- hashtags.js
- config.js
- facebook-story.js
- 4. Duration and Recovery Dynamics
- db/index.js
- youtube.js
- collect.js
- framework-state-mode.sh
- schema.sql
- digest-image-file.js
- popup.js
- lib/shorts-runtime.js
- Security Audit Report
- vitest
- monitor.sh
- restart-on-open.sh
- mcp.json
- pre-commit
- setup-cron.sh
- setup-fb-watcher.sh
- bump-version.sh
- switch-repo-access.sh
- Changelog
- Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research
- 2. Facebook Personal Profile (Publication via Patchright)
- package.json
- Full Publication Scenario
- Facebook Page API — Quick Setup Guide
- Instagram Pipeline — Working Document
- scripts
- Text-to-Speech API for Automated Content Pipeline — April 2026 Update
- Image Generation API for Instagram Pipeline — April 2026 Update
- Technical Description: Facebook & Instagram Reels Layout Template for News Blocks
- Current Working Implementation (Aug 2026)
- Document Structure
- Telegram Setup: Bot and Channel Publication
- tts.js
- VPS Setup — News Digest Pipeline
- Video Generation API for Instagram Reels Pipeline — April 2026 Update
- ref_path
- Prompt for News Processing
- generate-voiceover.js
- News Digest Pipeline
- Reel Image Workflow
- Step-by-Step Instructions (iOS 26)
- Audio Pipeline — TTS Voice-Over для Reels + Подкаст
- PROMPT: ARCHITECT (DEEP VISIONARY ANALYTICS)
- iOS Shortcut Setup — News Digest
- ugreen-docker.md
- Project Manifest
- Unified Social Image Pipeline
- HTML Template Reel Images (alternative path)
- Prompt for Digest Assembly
- README.md
- Media Production Pipeline
- Distribution
- YouTube Shorts setup
- distribution/audio/README.md
- facebook-page/README.md
- facebook-profile/README.md
- telegram/README.md
- production/prompts/README.md
- news-digest-pipeline/prompts/README.md

## God Nodes (most connected - your core abstractions)
1. `vitest` - 46 edges
2. `log()` - 45 edges
3. `main()` - 25 edges
4. `main()` - 25 edges
5. `reviewReelStoryboard()` - 24 edges
6. `ensureUkrainianOnScreenCopy()` - 24 edges
7. `groundVisualVariant()` - 23 edges
8. `repairShotCopy()` - 20 edges
9. `looksUnfinishedSentence()` - 20 edges
10. `publishDigest()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Key production components` --references--> `mergeShotVideoAndAudio()`  [INFERRED]
  news-digest-pipeline/production/video/README.md → news-digest-pipeline/production/lib/ffmpeg-helpers.js
- `Symptom: "Couldn't Load Post" for another user` --references--> `checkFacebookPostVisibility()`  [INFERRED]
  news-digest-pipeline/docs/facebook-shadow-ban-research.md → news-digest-pipeline/src/services/publishers/facebook-visibility.js
- `How to use the new FB Image Publisher` --references--> `publishDigest()`  [INFERRED]
  news-digest-pipeline/docs/unified-image-pipeline.md → news-digest-pipeline/src/services/publishers/index.js
- `Current production-lib coverage` --references--> `getAudioDuration()`  [INFERRED]
  news-digest-pipeline/docs/testing.md → news-digest-pipeline/production/lib/ffmpeg-helpers.js
- `Current production-lib coverage` --references--> `mergeShotVideoAndAudio()`  [INFERRED]
  news-digest-pipeline/docs/testing.md → news-digest-pipeline/production/lib/ffmpeg-helpers.js

## Import Cycles
- None detected.

## Communities (92 total, 17 thin omitted)

### Community 0 - "stitch.js"
Cohesion: 0.18
Nodes (16): DEFAULT_MUSIC_DURATION_SEC, reelMusicPathFor(), ASSETS_DIR, __dirname, FFMPEG, findStaticBackgroundMusic(), isUsableMusic(), mixVoiceoverWithMusic() (+8 more)

### Community 1 - "generate-digest-cover.js"
Cohesion: 0.06
Nodes (73): genAI, generateAiBackgroundsForShots(), openai, claude, completeJson(), coverFallbackEnabled(), DB_PATH, __dirname (+65 more)

### Community 2 - "reel-ukrainian-copy.js"
Cohesion: 0.20
Nodes (29): Frozen control: finished overlay copy, localizeShot(), asFinishedUkrainianSentence(), assertFinishedReelCopy(), bandScore(), capitalizeUkrainian(), completeSentencesFrom(), ensureTerminalPunctuation() (+21 more)

### Community 3 - "visual-grounding.js"
Cohesion: 0.09
Nodes (65): COVER_ASPECT, COVER_SELECTION_SYSTEM_PROMPT, COVER_VISUAL_SYSTEM_PROMPT, coverSelectionUserPrompt(), coverVisualUserPrompt(), FALLBACK_STORY_HINTS, fallbackCoverFromArticles(), firstSentence() (+57 more)

### Community 4 - "generate-clips.js"
Cohesion: 0.07
Nodes (44): charsPerLine(), finishHeadline(), headerRowBottom(), layoutReelOverlayText(), tryLayout(), overlayCopyTop(), overlayTextHasEveryWord(), REEL_HEADER_LAYOUT (+36 more)

### Community 5 - "generate-reel.js"
Cohesion: 0.09
Nodes (51): DB_PATH, __dirname, fallbackStoryboard(), firstSentence(), main(), createReviewedStoryboard(), OUTPUT_DIR, removeStaleTempRuns() (+43 more)

### Community 6 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @anthropic-ai/sdk, better-sqlite3, cheerio, cors, dotenv, express, express-rate-limit (+10 more)

### Community 7 - "reel-copy-review.js"
Cohesion: 0.14
Nodes (39): alignSpokenToHeadline(), applyCopyFields(), buildReviewUserPrompt(), capitalizeUkrainian(), contentTokens(), contextIssues(), COPY_FIELDS, COPY_REVIEW_MAX_ROUNDS (+31 more)

### Community 8 - "facebook-page-browser.js"
Cohesion: 0.14
Nodes (30): __dirname, log(), main(), clickableLoggedInMarker(), clickFirstVisible(), DEFAULT_PROFILE_DIR, __dirname, insertDigest() (+22 more)

### Community 9 - "publishers/postiz.js"
Cohesion: 0.16
Nodes (24): joinOpeningHashtagToLead(), aggregatePostizAnalytics(), captionFor(), collectPosts(), facebookPostMatchKey(), findPostizPostByFacebookRef(), isHttpUrl(), listPostizPosts() (+16 more)

### Community 10 - "background-music.js"
Cohesion: 0.16
Nodes (27): addClap(), addHats(), addKick(), addPad(), ASSETS_DIR, buildMusicConfig(), chordFreqs(), __dirname (+19 more)

### Community 11 - "News Digest Pipeline v3.1.0"
Cohesion: 0.07
Nodes (30): 1. Fork and Clone, 2. Configuration, 3. Launch, 4. Local Docker / UGREEN NAS (no Traefik), 5. Production (Docker / VPS + Traefik), 6. Restart, API, Architecture (+22 more)

### Community 12 - "manifest.json"
Cohesion: 0.06
Nodes (30): action, default_icon, default_popup, default_title, background, service_worker, commands, _execute_action (+22 more)

### Community 13 - "lib/digest.js"
Cohesion: 0.10
Nodes (34): Commands, Current production-lib coverage, How to write new production-lib tests, Production / pipeline tests, Refactor checklist (agents), Two test styles (do not mix casually), __dirname, escapeSqlLiteral() (+26 more)

### Community 14 - "ref_fs"
Cohesion: 0.11
Nodes (29): __dirname, escapeHtml(), fillTemplate(), FRAME_HEIGHT, FRAME_WIDTH, launchChromium(), readTemplate(), renderFrameToPng() (+21 more)

### Community 15 - "local-fetcher.js"
Cohesion: 0.14
Nodes (22): AUTH_HEADERS, closeActiveTab(), CONTENT_SELECTORS, __dirname, extractFromHtml(), fetchArticlesWithoutContent(), getActiveTabSource(), getActiveTabUrl() (+14 more)

### Community 16 - "digest-generator.js"
Cohesion: 0.08
Nodes (45): MODEL_CATALOG, priceFor(), assignArticlesToDigest(), createDigest(), getDigests(), updateArticleCommentary(), updateArticleStatus(), buildCursorDigestPrompt() (+37 more)

### Community 17 - "video-generator.js"
Cohesion: 0.07
Nodes (45): normalizeReelFrameMode(), withActiveJobs(), humanizeFetchFailure(), summarizeCliFailure(), coverScriptPath(), __dirname, findActiveImageJob(), finishImageJob() (+37 more)

### Community 18 - "storyboard.js"
Cohesion: 0.14
Nodes (18): criticSystemPrompt(), FACEBOOK_SPOKEN_WORD_MAX, FACEBOOK_SPOKEN_WORD_MIN, FEED_HEADLINE_WORD_MAX, FEED_HEADLINE_WORD_MIN, reelCopyPromptRules(), SHORTS_SPOKEN_WORD_MAX, SHORTS_SPOKEN_WORD_MIN (+10 more)

### Community 19 - "digest-workflow.js"
Cohesion: 0.13
Nodes (22): createDashboard(), context(), render(), showError(), channels, digestWorkflow(), escapeHtml(), formatDateTime() (+14 more)

### Community 20 - "generate.js"
Cohesion: 0.12
Nodes (30): claude, __dirname, fetchImageBuffer(), genAI, generateHeadlinesAndPrompts(), main(), openai, OUTPUT_DIR (+22 more)

### Community 21 - "settings.js"
Cohesion: 0.18
Nodes (13): paths, atomicWrite(), buildSettingsPayload(), ENV_WRITABLE, isInt(), maskSecret(), REEL_FRAME_MODES, router (+5 more)

### Community 22 - "fb-profile-watcher.js"
Cohesion: 0.47
Nodes (4): __dirname, log(), main(), sleep()

### Community 23 - "src/index.js"
Cohesion: 0.11
Nodes (20): appConfig, apiLimiter, app, __dirname, __filename, generateLimiter, imageGenerateLimiter, publishLimiter (+12 more)

### Community 24 - "auth.js"
Cohesion: 0.24
Nodes (13): apiAuth(), tokenMatches(), authDisabled(), clearLoginAttempts(), dashboardAuth(), getClientIp(), isLoginBlocked(), loginAttempts (+5 more)

### Community 25 - "publishers/index.js"
Cohesion: 0.17
Nodes (16): updateDigest(), publishImageToFacebook(), digestVideoUrl(), __dirname, localVideoPathFromUrl(), VIDEO_OUTPUT_DIR, publishVideoToFacebook(), publishDigest() (+8 more)

### Community 26 - "hashtags.js"
Cohesion: 0.53
Nodes (4): buildDynamicHashtags(), normalizeWord(), replaceHashtagFooter(), STOP_WORDS

### Community 27 - "config.js"
Cohesion: 0.23
Nodes (13): buildConfig(), __dirname, LLM_VENDORS, localPromptsDir, normalizePublishBackend(), parentDir, parseConfigMd(), parsePostizChannelIds() (+5 more)

### Community 28 - "facebook-story.js"
Cohesion: 0.23
Nodes (16): publishReelToFacebook(), bufferForFacebookStory(), execFileAsync, probeDurationSeconds(), publishStoryToFacebook(), trimVideo(), loadVideoBuffer(), finishPageVideoUpload() (+8 more)

### Community 29 - "4. Duration and Recovery Dynamics"
Cohesion: 0.50
Nodes (4): 4. Duration and Recovery Dynamics, Automatic Removal, Typical Timelines, What Worsens the Situation

### Community 30 - "db/index.js"
Cohesion: 0.15
Nodes (25): Webhook URL, deleteArticle(), __dirname, getArticleCount(), getArticlesByDigestId(), getDb(), getDigest(), getNewArticles() (+17 more)

### Community 32 - "youtube.js"
Cohesion: 0.47
Nodes (3): getYouTubeOAuth2Client(), publishToYouTube(), { insertMock, createReadStreamMock, statSyncMock }

### Community 33 - "collect.js"
Cohesion: 0.39
Nodes (7): collectTab(), getCollectorSettings(), normalizeBackendUrl(), postArticle(), scrapeTab(), sendTabMessage(), withTimeout()

### Community 34 - "framework-state-mode.sh"
Cohesion: 0.47
Nodes (7): check_safe_mode(), get_repo_access(), is_shared_mode(), list_tracked_framework_paths(), framework-state-mode.sh script, should_commit_framework_state(), usage()

### Community 35 - "schema.sql"
Cohesion: 0.46
Nodes (7): articles, digests, idx_articles_digest_id, idx_articles_status, idx_articles_url, idx_digests_date, idx_digests_status

### Community 36 - "digest-image-file.js"
Cohesion: 0.43
Nodes (6): digestImageUrl(), __dirname, IMAGE_OUTPUT_DIR, loadImageBuffer(), localImagePathFromUrl(), mimeFromImageFilename()

### Community 37 - "popup.js"
Cohesion: 0.67
Nodes (5): loadSettings(), saveSettings(), sendCollectMessage(), setup(), updateStatus()

### Community 38 - "lib/shorts-runtime.js"
Cohesion: 0.62
Nodes (4): planShortsRuntime(), SHORTS_INTRO_OUTRO_SEC, SHORTS_MAX_SEC, SHORTS_PAD_SEC

### Community 41 - "Security Audit Report"
Cohesion: 0.07
Nodes (28): Dependency and Tooling Notes, Evidence, Evidence, Evidence, Evidence, Evidence, Executive Summary, F-01: Public admin API and dashboard without authentication (+20 more)

### Community 43 - "vitest"
Cohesion: 0.31
Nodes (5): initDb(), buildFacebookPostPermalink(), buildReelCaption(), ref_os, vitest

### Community 54 - "Changelog"
Cohesion: 0.07
Nodes (27): [0.1.0] — 2026-04-03, [2.0.0] — 2026-04-11, [2.0.1] — 2026-04-12, [2.0.2] — 2026-04-13, [2.0.3] — 2026-04-13, [2.0.4] — 2026-04-13, [3.0.1] — 2026-08-17, [3.1.0] — 2026-09-20 (+19 more)

### Community 56 - "Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research"
Cohesion: 0.12
Nodes (16): 1. Meta Official Documentation: Does Silent Removal Exist?, 2. Types of Restrictions: Four Different Mechanisms, 3. Known Causes of Silent Post Removal, 5. Recommended Actions, 6. Technical Background: Andromeda System (2024–2025), Automation Detection, Behavioral Patterns, Conclusion (+8 more)

### Community 58 - "2. Facebook Personal Profile (Publication via Patchright)"
Cohesion: 0.10
Nodes (19): 1.1. Create a Meta Developer App, 1.2. Get a Page Access Token, 1.3. Exchange for a Long-Lived Token, 1.4. Page text posts (composer, not Graph `/feed`), 1.5. Limitations, 1. Facebook Graph API (Publication to Page), 2.1. Why Browser Automation?, 2.2. Why Patchright? (+11 more)

### Community 59 - "package.json"
Cohesion: 0.13
Nodes (14): description, devDependencies, vitest, main, name, type, version, @anthropic-ai/sdk (+6 more)

### Community 60 - "Full Publication Scenario"
Cohesion: 0.12
Nodes (15): Architectural Diagram, Configuration, Costs, Folder Structure, Full Publication Scenario, Input, Instagram Pipeline, Scenario (+7 more)

### Community 61 - "Facebook Page API — Quick Setup Guide"
Cohesion: 0.13
Nodes (14): 1. Create a Meta App, 2. Get a Page Access Token, 3. Publication, 4. Token Expiration, 5. Environment Variables, 6. Verification, Automatic Token Refresh (Built-in), Exchange short-lived → long-lived (+6 more)

### Community 62 - "Instagram Pipeline — Working Document"
Cohesion: 0.13
Nodes (14): Goal, Headline Generation Prompt, Implementation Phases, Instagram Limitations, Instagram Pipeline — Working Document, Notes, Phase 1: Image Generation (Current), Phase 2: Text Overlay (+6 more)

### Community 63 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, dev, generate:cover, generate:image, generate:reel, generate:reel:html, generate:voiceover, restart (+7 more)

### Community 64 - "Text-to-Speech API for Automated Content Pipeline — April 2026 Update"
Cohesion: 0.13
Nodes (14): 1. ElevenLabs — ⭐⭐⭐⭐⭐ Best for Expressive Ukrainian/Russian, 2. Fish Audio S2 Pro — ⭐⭐⭐⭐⭐ Best Quality/Price, 3. Inworld TTS-1.5 — ⭐⭐⭐⭐⭐ #1 Benchmark Leader, 4. Mistral Voxtral TTS — ⭐⭐⭐⭐ New Open-weight Player, Comparison Table, Detailed Breakdown of Key Services, Final Matrix, Market Snapshot: April 2026 (+6 more)

### Community 65 - "Image Generation API for Instagram Pipeline — April 2026 Update"
Cohesion: 0.13
Nodes (14): Current Comparison (April 2026), Detailed Breakdown, Final Pipeline Choice, FLUX.2 Klein 4B / 9B — Black Forest Labs, Image Generation API for Instagram Pipeline — April 2026 Update, Nano Banana 2 — Gemini 3.1 Flash Image, Recommendations (April 2026), Seedream 5 Lite — ByteDance (+6 more)

### Community 66 - "Technical Description: Facebook & Instagram Reels Layout Template for News Blocks"
Cohesion: 0.13
Nodes (14): 1. Platform Requirements: FB/IG Reels Safe Zones, 2. Text Box ("Plashka") Specifications (Asymmetric for FB Reels UI), 3. Typography & Information Hierarchy, 4. Visual Elements & Color Palette, 5. Technical Implementation Blueprint (SVG Reference), 6. Execution & Safety Rules for Generation Scripts, A. Brand/Category Indicator (Top Header - Outside of Plashka), B. Headline (Within Plashka - Primary Title) (+6 more)

### Community 67 - "Current Working Implementation (Aug 2026)"
Cohesion: 0.13
Nodes (14): Concept, Configuration (`.env`), Current Working Implementation (Aug 2026), Key production components, Locked V1 Reel Style, Model Comparison (April 2026), Original Research (Kling/Veo/Seedance — not required anymore), Pipeline (UI button → final reel) (+6 more)

### Community 69 - "Document Structure"
Cohesion: 0.13
Nodes (14): 1. Introduction and Project Overview, 2. Current State (AS-IS), 3. Target State (TO-BE), 4. System Architecture, 5. Component Specification, 6. Data Formats, 7. API Specification, 8. Implementation Phases (+6 more)

### Community 70 - "Telegram Setup: Bot and Channel Publication"
Cohesion: 0.08
Nodes (25): 1. Telegram Bot, 2. Webhook for Receiving URLs, 3. Channel Publication, 4. Splitting Long Messages, 5. iOS Shortcut for Sending URLs, 6. Environment Variables, 7. Troubleshooting, Bot cannot send a message to the channel (+17 more)

### Community 71 - "tts.js"
Cohesion: 0.22
Nodes (18): buildMusicMixFilter(), defaultFfmpegPath(), defaultFfprobePath(), getAudioDuration(), getMediaDuration(), getVideoDuration(), mergeAudioWithVideo(), require (+10 more)

### Community 72 - "VPS Setup — News Digest Pipeline"
Cohesion: 0.15
Nodes (13): Access Model, Agent Access Requirements, Agent Restrictions, Decisions Log, Deploy User (for CI/CD agent), Deployment Flow, Docker Architecture, Monitoring (+5 more)

### Community 73 - "Video Generation API for Instagram Reels Pipeline — April 2026 Update"
Cohesion: 0.15
Nodes (12): 1. Kling 3.0 / Kling O3 — ⭐⭐⭐⭐⭐ Best for Storyboard Pipelines, 2. Veo 3.1 Lite — ⭐⭐⭐⭐⭐ Cheapest High Quality, 3. Runway Gen-4.5 — ⭐⭐⭐⭐ Best Visual Fidelity, Backup/Budget: Veo 3.1 Lite (Gemini API), Comparison Table (April 2026), Costs (April 2026), Detailed Breakdown, FFmpeg Stitching: Minimal Working Code (+4 more)

### Community 74 - "ref_path"
Cohesion: 0.11
Nodes (17): __dirname, GENERATE_REEL, { join }, main(), authorizationUrl, oauth2Client, scopes, server (+9 more)

### Community 75 - "Prompt for News Processing"
Cohesion: 0.25
Nodes (7): CRITICAL ANTI-INSTRUCTIONS, FORMATTING RULES, INVISIBLE INTERNAL LOGIC, Prompt for News Processing, STEP 0. SEMANTIC TRANSLATION (INTERNAL, NOT VISIBLE), STRICT LENGTH LIMIT (MOST IMPORTANT RULE), TONE AND STYLE REQUIREMENTS

### Community 76 - "generate-voiceover.js"
Cohesion: 0.18
Nodes (14): __dirname, generateTTS(), main(), openai, OUTPUT_DIR, prepareAudioScript(), ROOT, __dirname (+6 more)

### Community 77 - "News Digest Pipeline"
Cohesion: 0.18
Nodes (10): Autonomy, Dashboard UI, Digest Format, File Paths, News Digest Pipeline, Processing Flow, Project Description, Reel and Image Generation (+2 more)

### Community 78 - "Reel Image Workflow"
Cohesion: 0.18
Nodes (10): 1. Review overlay copy (Reels and Shorts), 2. Generate backgrounds only for review (Reels and Shorts), 3. Generate the full reel or Short after approval, 4. Generate carousel images only, CLI workflow, Dynamic shot count and language, Provider configuration, Reel Image Workflow (+2 more)

### Community 80 - "Step-by-Step Instructions (iOS 26)"
Cohesion: 0.22
Nodes (9): Step 1. Create a New Command, Step 2. Add "Get URL from Input", Step 3. Add "Get Contents of URL", Step 4. Configure Server Address, Step 5. Configure HTTP Request, Step 6. Add Notification (Optional), Step 7. Rename Shortcut, Step 8. Enable Share Sheet (+1 more)

### Community 81 - "Audio Pipeline — TTS Voice-Over для Reels + Подкаст"
Cohesion: 0.22
Nodes (8): Audio Pipeline — TTS Voice-Over для Reels + Подкаст, FFmpeg інтеграція, Voice Cloning (один раз), Архитектура, Концепція, Порівняння TTS-сервісів (квітень 2026), Рекомендації, Структура

### Community 82 - "PROMPT: ARCHITECT (DEEP VISIONARY ANALYTICS)"
Cohesion: 0.22
Nodes (8): FORMATTING, PROMPT: ARCHITECT (DEEP VISIONARY ANALYTICS), Prompt for Deep Analytics, REQUIRED ELEMENTS (INSIDE THE TEXT), RULE ZERO READING (INTERNAL), STRICT PROHIBITIONS (ZERO TOLERANCE), STRUCTURE: "CAMERA ZOOM OUT" METHOD, TONE AND STYLE (CRITICAL)

### Community 83 - "iOS Shortcut Setup — News Digest"
Cohesion: 0.29
Nodes (7): Endpoint, Final Command Structure, iOS Shortcut Setup — News Digest, Purpose, Setup Date, Troubleshooting, Verification

### Community 84 - "ugreen-docker.md"
Cohesion: 0.25
Nodes (7): Canonical NAS deploy (this household), Chrome plugin → UGREEN app, .env (all parameters), Files to copy onto the NAS, Notes, UGREEN Container Manager, What you get

### Community 85 - "Project Manifest"
Cohesion: 0.29
Nodes (6): Dashboard UI, File deletion policy, Project Manifest, Reel / Image Generation Instructions, Restart after every app fix, Subagent Task Delegation

### Community 86 - "Unified Social Image Pipeline"
Cohesion: 0.29
Nodes (6): Architecture, Future Improvements, How to use the new FB Image Publisher, Unified Social Image Pipeline, Video & Audio Integration (Reels Approach), Why use Images for Facebook?

### Community 87 - "HTML Template Reel Images (alternative path)"
Cohesion: 0.29
Nodes (6): Commands, HTML Template Reel Images (alternative path), Layout contract, Templates, Tests, When to use which

### Community 91 - "Prompt for Digest Assembly"
Cohesion: 0.33
Nodes (5): Border / Disclaimer, Digest Structure, Input Data, Prompt for Digest Assembly, Rules

### Community 92 - "README.md"
Cohesion: 0.18
Nodes (6): Instagram (moved), Digest Configuration, Hashtags, URL Template, Кордон (відписка/бан), Хештег

### Community 93 - "Media Production Pipeline"
Cohesion: 0.40
Nodes (4): Architecture, Components, Media Production Pipeline, Structure

### Community 94 - "Distribution"
Cohesion: 0.50
Nodes (3): Channels, Current layout, Distribution

### Community 95 - "YouTube Shorts setup"
Cohesion: 0.50
Nodes (3): One-time Google Cloud + OAuth, Quota, YouTube Shorts setup

## Knowledge Gaps
- **535 isolated node(s):** `restart-on-open.sh script`, `figma`, `manifest_version`, `name`, `version` (+530 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 611 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `generate-digest-cover.js`, `reel-ukrainian-copy.js`, `visual-grounding.js`, `generate-clips.js`, `generate-reel.js`, `reel-copy-review.js`, `facebook-page-browser.js`, `publishers/postiz.js`, `lib/digest.js`, `ref_fs`, `digest-generator.js`, `video-generator.js`, `storyboard.js`, `digest-workflow.js`, `auth.js`, `publishers/index.js`, `hashtags.js`, `config.js`, `facebook-story.js`, `youtube.js`, `digest-image-file.js`, `lib/shorts-runtime.js`, `package.json`, `tts.js`, `ref_path`, `generate-voiceover.js`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `checkFacebookPostVisibility()` connect `facebook-page-browser.js` to `Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `log()` (e.g. with `createReviewedStoryboard()` and `tts.test.js`) actually correct?**
  _`log()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `restart-on-open.sh script`, `figma`, `manifest_version` to the rest of the system?**
  _535 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate-digest-cover.js` be split into smaller, more focused modules?**
  _Cohesion score 0.060828680575962385 - nodes in this community are weakly interconnected._
- **Should `visual-grounding.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `generate-clips.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07294117647058823 - nodes in this community are weakly interconnected._