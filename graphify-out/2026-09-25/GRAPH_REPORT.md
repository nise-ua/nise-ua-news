# Graph Report - news  (2026-09-21)

## Corpus Check
- 192 files · ~126,461 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 8, .mdc 2, .disabled 1)

## Summary
- 1554 nodes · 3409 edges · 105 communities (85 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4da1f8d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- stitch.js
- image-backends.js
- generate.js
- visual-grounding.js
- tts-pronunciation.js
- generate-reel.js
- dependencies
- reel-copy-review.js
- facebook-page-browser.js
- publishers/postiz.js
- background-music.js
- News Digest Pipeline v3.1.0
- manifest.json
- vitest
- render-frame.js
- local-fetcher.js
- digest-generator.js
- image-generator.js
- video-generator.js
- digest-workflow.js
- overlay.js
- settings.js
- cursor-cloud-agent.js
- src/index.js
- auth.js
- publishers/index.js
- db/index.js
- config.js
- facebook-story.js
- version.js
- telegram-bot.js
- queue-manager.js
- youtube.js
- collect.js
- framework-state-mode.sh
- schema.sql
- digest-image-file.js
- popup.js
- generate-reel-html.js
- digest-format.js
- video-generator.test.js
- Security Audit Report
- summarizeCliFailure
- buildReelCaption
- monitor.sh
- restart-on-open.sh
- mcp.json
- pre-commit
- setup-cron.sh
- setup-fb-watcher.sh
- bump-version.sh
- switch-repo-access.sh
- Changelog
- llm-client.js
- Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research
- generate-digest-cover.js
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
- generate-clips.js
- Document Structure
- Telegram Setup: Bot and Channel Publication
- tts.js
- VPS Setup — News Digest Pipeline
- Video Generation API for Instagram Reels Pipeline — April 2026 Update
- ref_url
- README.md
- log
- News Digest Pipeline
- Reel Image Workflow
- stitch-real-test.mjs
- Step-by-Step Instructions (iOS 26)
- Audio Pipeline — TTS Voice-Over для Reels + Подкаст
- PROMPT: ARCHITECT (DEEP VISIONARY ANALYTICS)
- iOS Shortcut Setup — News Digest
- ugreen-docker.md
- Project Manifest
- Unified Social Image Pipeline
- HTML Template Reel Images (alternative path)
- facebook-video-file.js
- 2. Webhook for Receiving URLs
- 7. Troubleshooting
- Prompt for Digest Assembly
- Digest Configuration
- Media Production Pipeline
- Distribution
- YouTube Shorts setup
- ref_fs
- digestVideoUpdateFields
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
- `Reel Image Workflow` --references--> `assertFinishedReelCopy()`  [INFERRED]
  news-digest-pipeline/docs/reel-image-workflow.md → news-digest-pipeline/production/lib/reel-ukrainian-copy.js
- `How to write new production-lib tests` --references--> `withEnv()`  [INFERRED]
  news-digest-pipeline/docs/testing.md → news-digest-pipeline/production/lib/__tests__/helpers.js

## Import Cycles
- None detected.

## Communities (105 total, 20 thin omitted)

### Community 0 - "stitch.js"
Cohesion: 0.21
Nodes (18): Current production-lib coverage, buildMusicMixFilter(), getAudioDuration(), getMediaDuration(), getVideoDuration(), mergeAudioWithVideo(), mergeShotVideoAndAudio(), runMusicMix() (+10 more)

### Community 1 - "image-backends.js"
Cohesion: 0.17
Nodes (30): generateAiBackgroundsForShots(), generateCoverImage(), generateBackgroundImages(), cloudflareCredentials(), cloudflareImageFromPayload(), cloudflareImageSize(), falImageSize(), fireflyCredentials() (+22 more)

### Community 2 - "generate.js"
Cohesion: 0.20
Nodes (12): claude, __dirname, fetchImageBuffer(), genAI, generateHeadlinesAndPrompts(), main(), openai, OUTPUT_DIR (+4 more)

### Community 3 - "visual-grounding.js"
Cohesion: 0.13
Nodes (44): BANNED_RE, BANNED_VISUAL_TERMS, buildAtmosphereClause(), buildGroundedPrompt(), buildImageFactClause(), buildSafeCoverVisualSubject(), buildSafeVisualSubject(), containsCyrillic() (+36 more)

### Community 4 - "tts-pronunciation.js"
Cohesion: 0.11
Nodes (28): analyzeTextRegionBrightness(), BRIGHTNESS_THRESHOLD, getOverlayThemeColors(), luminanceFromChannels(), pickOverlayTheme(), regionLuminance(), resolveOverlayTheme(), TEXT_REGION (+20 more)

### Community 5 - "generate-reel.js"
Cohesion: 0.16
Nodes (16): __dirname, projectRoot(), reportFatal(), scriptDir(), DB_PATH, __dirname, fallbackStoryboard(), firstSentence() (+8 more)

### Community 6 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @anthropic-ai/sdk, better-sqlite3, cheerio, cors, dotenv, express, express-rate-limit (+10 more)

### Community 7 - "reel-copy-review.js"
Cohesion: 0.06
Nodes (100): Frozen control: finished overlay copy, fallbackStoryboard(), firstSentence(), main(), createReviewedStoryboard(), persistCoverUrl(), findLatestDigestId(), initDigestStore() (+92 more)

### Community 8 - "facebook-page-browser.js"
Cohesion: 0.14
Nodes (30): __dirname, log(), main(), clickableLoggedInMarker(), clickFirstVisible(), DEFAULT_PROFILE_DIR, __dirname, insertDigest() (+22 more)

### Community 9 - "publishers/postiz.js"
Cohesion: 0.13
Nodes (27): getClient(), router, statsCache, aggregatePostizAnalytics(), captionFor(), collectPosts(), createPostizClient(), facebookPostMatchKey() (+19 more)

### Community 10 - "background-music.js"
Cohesion: 0.13
Nodes (30): addClap(), addHats(), addKick(), addPad(), ASSETS_DIR, buildMusicConfig(), chordFreqs(), DEFAULT_MUSIC_DURATION_SEC (+22 more)

### Community 11 - "News Digest Pipeline v3.1.0"
Cohesion: 0.07
Nodes (30): 1. Fork and Clone, 2. Configuration, 3. Launch, 4. Local Docker / UGREEN NAS (no Traefik), 5. Production (Docker / VPS + Traefik), 6. Restart, API, Architecture (+22 more)

### Community 12 - "manifest.json"
Cohesion: 0.06
Nodes (30): action, default_icon, default_popup, default_title, background, service_worker, commands, _execute_action (+22 more)

### Community 13 - "vitest"
Cohesion: 0.07
Nodes (50): Commands, How to write new production-lib tests, Production / pipeline tests, Refactor checklist (agents), Two test styles (do not mix casually), COVER_ASPECT, COVER_SELECTION_SYSTEM_PROMPT, COVER_VISUAL_SYSTEM_PROMPT (+42 more)

### Community 14 - "render-frame.js"
Cohesion: 0.09
Nodes (39): __dirname, escapeHtml(), fillTemplate(), FRAME_HEIGHT, FRAME_WIDTH, launchChromium(), readTemplate(), renderFrameToPng() (+31 more)

### Community 15 - "local-fetcher.js"
Cohesion: 0.14
Nodes (22): AUTH_HEADERS, closeActiveTab(), CONTENT_SELECTORS, __dirname, extractFromHtml(), fetchArticlesWithoutContent(), getActiveTabSource(), getActiveTabUrl() (+14 more)

### Community 16 - "digest-generator.js"
Cohesion: 0.17
Nodes (24): assignArticlesToDigest(), createDigest(), updateArticleCommentary(), updateArticleStatus(), buildCursorDigestPrompt(), isCursorLlmVendor(), ASSEMBLY_MAX_TOKENS, callModel() (+16 more)

### Community 17 - "image-generator.js"
Cohesion: 0.13
Nodes (21): withActiveJobs(), coverScriptPath(), __dirname, findActiveImageJob(), finishImageJob(), getImageJob(), jobs, OUTPUT_DIR (+13 more)

### Community 18 - "video-generator.js"
Cohesion: 0.20
Nodes (19): normalizeReelFrameMode(), buildScriptArgs(), __dirname, findActiveVideoJob(), finishVideoJob(), generateVideoForDigest(), getVideoJob(), jobs (+11 more)

### Community 19 - "digest-workflow.js"
Cohesion: 0.20
Nodes (17): createDashboard(), context(), render(), showError(), channels, digestWorkflow(), escapeHtml(), formatDateTime() (+9 more)

### Community 20 - "overlay.js"
Cohesion: 0.17
Nodes (22): applyTemplateOverlay(), createInstagramImage(), createTemplate1(), createTemplate2(), createTemplate3(), createTemplate4(), createTemplate5(), createTemplate6() (+14 more)

### Community 21 - "settings.js"
Cohesion: 0.15
Nodes (15): LLM_VENDORS, MODEL_CATALOG, priceFor(), atomicWrite(), buildSettingsPayload(), ENV_WRITABLE, isInt(), maskSecret() (+7 more)

### Community 22 - "cursor-cloud-agent.js"
Cohesion: 0.20
Nodes (15): buildCursorModelSelection(), CURSOR_MODEL_ALIASES, CURSOR_POLL_INTERVAL_MS, CURSOR_POLL_TIMEOUT_MS, CURSOR_TWO_PARAGRAPH_RULES, cursorRequest(), DEFAULT_CURSOR_MODEL, extractJsonObject() (+7 more)

### Community 23 - "src/index.js"
Cohesion: 0.12
Nodes (17): appConfig, apiLimiter, app, __dirname, __filename, generateLimiter, imageGenerateLimiter, publishLimiter (+9 more)

### Community 24 - "auth.js"
Cohesion: 0.24
Nodes (13): apiAuth(), tokenMatches(), authDisabled(), clearLoginAttempts(), dashboardAuth(), getClientIp(), isLoginBlocked(), loginAttempts (+5 more)

### Community 25 - "publishers/index.js"
Cohesion: 0.24
Nodes (11): publishImageToFacebook(), publishVideoToFacebook(), publishDigest(), firstFacebookRelease(), mergePostizPosts(), publishToTelegram(), sendOne(), sleep() (+3 more)

### Community 26 - "db/index.js"
Cohesion: 0.25
Nodes (11): ROOT, deleteArticle(), __dirname, getArticlesByDigestId(), getDb(), getDigest(), getDigests(), initDb() (+3 more)

### Community 27 - "config.js"
Cohesion: 0.23
Nodes (13): buildConfig(), __dirname, localPromptsDir, normalizePublishBackend(), parentDir, parseConfigMd(), parsePostizChannelIds(), paths (+5 more)

### Community 28 - "facebook-story.js"
Cohesion: 0.23
Nodes (15): publishReelToFacebook(), bufferForFacebookStory(), execFileAsync, probeDurationSeconds(), publishStoryToFacebook(), trimVideo(), finishPageVideoUpload(), GRAPH_VERSION (+7 more)

### Community 29 - "version.js"
Cohesion: 0.20
Nodes (8): router, appBuildDate, appVersion, root, ref_node_child_process, ref_node_fs, ref_node_path, ref_node_url

### Community 30 - "telegram-bot.js"
Cohesion: 0.35
Nodes (10): Webhook URL, getArticleCount(), insertArticle(), handleGenerate(), handleStatus(), handleTelegramUpdate(), handleUrls(), sendMessage() (+2 more)

### Community 31 - "queue-manager.js"
Cohesion: 0.42
Nodes (7): getNewArticles(), resetStuckProcessingArticles(), notify(), notifyDigestReady(), processQueue(), startQueueManager(), sweepStaleProcessing()

### Community 32 - "youtube.js"
Cohesion: 0.38
Nodes (4): getYouTubeOAuth2Client(), publishToYouTube(), { insertMock, createReadStreamMock, statSyncMock }, googleapis

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

### Community 38 - "generate-reel-html.js"
Cohesion: 0.21
Nodes (11): DB_PATH, __dirname, OUTPUT_DIR, removeStaleTempRuns(), ROOT, SERVER, news_digest_pipeline_production_lib_digest_store_digestvideoupdatefields, planShortsRuntime() (+3 more)

### Community 39 - "digest-format.js"
Cohesion: 0.60
Nodes (4): DEFAULT_OPENING_HASHTAG, joinOpeningHashtagToLead(), normalizeDigestFormat(), stripTrailingHashtags()

### Community 40 - "video-generator.test.js"
Cohesion: 0.40
Nodes (3): __dirname, PIPELINE_ROOT, { spawnMock, updateDigestMock }

### Community 41 - "Security Audit Report"
Cohesion: 0.07
Nodes (28): Dependency and Tooling Notes, Evidence, Evidence, Evidence, Evidence, Evidence, Executive Summary, F-01: Public admin API and dashboard without authentication (+20 more)

### Community 54 - "Changelog"
Cohesion: 0.07
Nodes (27): [0.1.0] — 2026-04-03, [2.0.0] — 2026-04-11, [2.0.1] — 2026-04-12, [2.0.2] — 2026-04-13, [2.0.3] — 2026-04-13, [2.0.4] — 2026-04-13, [3.0.1] — 2026-08-17, [3.1.0] — 2026-09-20 (+19 more)

### Community 55 - "llm-client.js"
Cohesion: 0.16
Nodes (23): cloudflareError(), cloudflareLlmModel(), completeCloudflareJson(), completeCloudflareJsonText(), DEFAULT_CLOUDFLARE_LLM_MODEL, extractJsonObject(), extractLlmText(), postCloudflare() (+15 more)

### Community 56 - "Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research"
Cohesion: 0.10
Nodes (20): 1. Meta Official Documentation: Does Silent Removal Exist?, 2. Types of Restrictions: Four Different Mechanisms, 3. Known Causes of Silent Post Removal, 4. Duration and Recovery Dynamics, 5. Recommended Actions, 6. Technical Background: Andromeda System (2024–2025), Automatic Removal, Automation Detection (+12 more)

### Community 57 - "generate-digest-cover.js"
Cohesion: 0.13
Nodes (19): claude, completeJson(), coverFallbackEnabled(), DB_PATH, __dirname, genAI, main(), openai (+11 more)

### Community 58 - "2. Facebook Personal Profile (Publication via Patchright)"
Cohesion: 0.10
Nodes (19): 1.1. Create a Meta Developer App, 1.2. Get a Page Access Token, 1.3. Exchange for a Long-Lived Token, 1.4. Page text posts (composer, not Graph `/feed`), 1.5. Limitations, 1. Facebook Graph API (Publication to Page), 2.1. Why Browser Automation?, 2.2. Why Patchright? (+11 more)

### Community 59 - "package.json"
Cohesion: 0.12
Nodes (16): description, devDependencies, vitest, main, name, type, version, genAI (+8 more)

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

### Community 68 - "generate-clips.js"
Cohesion: 0.23
Nodes (13): createReelsOverlay(), createShotImage(), __dirname, escapeXml(), fetchImageBuffer(), generateShotClip(), ROOT, mixVoiceoverWithMusic() (+5 more)

### Community 69 - "Document Structure"
Cohesion: 0.13
Nodes (14): 1. Introduction and Project Overview, 2. Current State (AS-IS), 3. Target State (TO-BE), 4. System Architecture, 5. Component Specification, 6. Data Formats, 7. API Specification, 8. Implementation Phases (+6 more)

### Community 70 - "Telegram Setup: Bot and Channel Publication"
Cohesion: 0.14
Nodes (13): 1. Telegram Bot, 3. Channel Publication, 4. Splitting Long Messages, 5. iOS Shortcut for Sending URLs, 6. Environment Variables, Channel, Environment Variable, How it Works (+5 more)

### Community 71 - "tts.js"
Cohesion: 0.31
Nodes (12): defaultFfmpegPath(), defaultFfprobePath(), require, buildExecMock(), completeClause(), DEFAULT_EDGE_VOICE, EDGE_VOICE, generatePerArticleAudio() (+4 more)

### Community 72 - "VPS Setup — News Digest Pipeline"
Cohesion: 0.15
Nodes (13): Access Model, Agent Access Requirements, Agent Restrictions, Decisions Log, Deploy User (for CI/CD agent), Deployment Flow, Docker Architecture, Monitoring (+5 more)

### Community 73 - "Video Generation API for Instagram Reels Pipeline — April 2026 Update"
Cohesion: 0.15
Nodes (12): 1. Kling 3.0 / Kling O3 — ⭐⭐⭐⭐⭐ Best for Storyboard Pipelines, 2. Veo 3.1 Lite — ⭐⭐⭐⭐⭐ Cheapest High Quality, 3. Runway Gen-4.5 — ⭐⭐⭐⭐ Best Visual Fidelity, Backup/Budget: Veo 3.1 Lite (Gemini API), Comparison Table (April 2026), Costs (April 2026), Detailed Breakdown, FFmpeg Stitching: Minimal Working Code (+4 more)

### Community 74 - "ref_url"
Cohesion: 0.18
Nodes (11): authorizationUrl, oauth2Client, scopes, server, __dirname, main(), refreshPageToken(), refreshSpecificPageToken() (+3 more)

### Community 75 - "README.md"
Cohesion: 0.17
Nodes (8): Instagram (moved), CRITICAL ANTI-INSTRUCTIONS, FORMATTING RULES, INVISIBLE INTERNAL LOGIC, Prompt for News Processing, STEP 0. SEMANTIC TRANSLATION (INTERNAL, NOT VISIBLE), STRICT LENGTH LIMIT (MOST IMPORTANT RULE), TONE AND STYLE REQUIREMENTS

### Community 76 - "log"
Cohesion: 0.24
Nodes (11): __dirname, generateTTS(), main(), openai, OUTPUT_DIR, prepareAudioScript(), ROOT, log() (+3 more)

### Community 77 - "News Digest Pipeline"
Cohesion: 0.18
Nodes (10): Autonomy, Dashboard UI, Digest Format, File Paths, News Digest Pipeline, Processing Flow, Project Description, Reel and Image Generation (+2 more)

### Community 78 - "Reel Image Workflow"
Cohesion: 0.18
Nodes (10): 1. Review overlay copy (Reels and Shorts), 2. Generate backgrounds only for review (Reels and Shorts), 3. Generate the full reel or Short after approval, 4. Generate carousel images only, CLI workflow, Dynamic shot count and language, Provider configuration, Reel Image Workflow (+2 more)

### Community 79 - "stitch-real-test.mjs"
Cohesion: 0.24
Nodes (9): news_digest_pipeline_production_video_src_stitch_mergeshotvideoandaudio, DB_PATH, __dirname, IMAGE_DIR, loadLatestDigestItems(), main(), OUTPUT_DIR, toSpokenText() (+1 more)

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
Cohesion: 0.25
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

### Community 88 - "facebook-video-file.js"
Cohesion: 0.43
Nodes (5): digestVideoUrl(), __dirname, loadVideoBuffer(), localVideoPathFromUrl(), VIDEO_OUTPUT_DIR

### Community 89 - "2. Webhook for Receiving URLs"
Cohesion: 0.33
Nodes (6): 2. Webhook for Receiving URLs, Bot Commands, Message Processing, Protection, Security: Filtering by Chat ID, Threshold Notification

### Community 90 - "7. Troubleshooting"
Cohesion: 0.33
Nodes (6): 7. Troubleshooting, Bot cannot send a message to the channel, Bot not responding to messages, "chat not found" when publishing to a channel, Checking webhook status, Webhook not registering

### Community 91 - "Prompt for Digest Assembly"
Cohesion: 0.33
Nodes (5): Border / Disclaimer, Digest Structure, Input Data, Prompt for Digest Assembly, Rules

### Community 92 - "Digest Configuration"
Cohesion: 0.33
Nodes (5): Digest Configuration, Hashtags, URL Template, Кордон (відписка/бан), Хештег

### Community 93 - "Media Production Pipeline"
Cohesion: 0.40
Nodes (4): Architecture, Components, Media Production Pipeline, Structure

### Community 94 - "Distribution"
Cohesion: 0.50
Nodes (3): Channels, Current layout, Distribution

### Community 95 - "YouTube Shorts setup"
Cohesion: 0.50
Nodes (3): One-time Google Cloud + OAuth, Quota, YouTube Shorts setup

### Community 96 - "ref_fs"
Cohesion: 0.50
Nodes (3): __dirname, GENERATE_REEL, ref_fs

## Knowledge Gaps
- **534 isolated node(s):** `restart-on-open.sh script`, `figma`, `manifest_version`, `name`, `version` (+529 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 610 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `stitch.js`, `image-backends.js`, `visual-grounding.js`, `generate-reel.js`, `reel-copy-review.js`, `facebook-page-browser.js`, `publishers/postiz.js`, `render-frame.js`, `digest-generator.js`, `image-generator.js`, `digest-workflow.js`, `settings.js`, `cursor-cloud-agent.js`, `auth.js`, `db/index.js`, `config.js`, `facebook-story.js`, `youtube.js`, `digest-image-file.js`, `generate-reel-html.js`, `digest-format.js`, `video-generator.test.js`, `summarizeCliFailure`, `buildReelCaption`, `llm-client.js`, `package.json`, `tts.js`, `facebook-video-file.js`, `ref_fs`, `digestVideoUpdateFields`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Why does `2. Webhook for Receiving URLs` connect `2. Webhook for Receiving URLs` to `Telegram Setup: Bot and Channel Publication`, `telegram-bot.js`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `log()` (e.g. with `createReviewedStoryboard()` and `tts.test.js`) actually correct?**
  _`log()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `restart-on-open.sh script`, `figma`, `manifest_version` to the rest of the system?**
  _534 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `visual-grounding.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12858464384828863 - nodes in this community are weakly interconnected._
- **Should `tts-pronunciation.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10685483870967742 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._