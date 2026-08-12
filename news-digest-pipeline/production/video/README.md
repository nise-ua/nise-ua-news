# Video Pipeline — Instagram Reels / YouTube Shorts

**Status:** ✅ Implemented & working end-to-end (production, UI-triggered)

## Concept

Automatic generation of short reels from the digest: one synchronized clip per
news block, natural Ukrainian neural voice-over, and an energetic
background-music bed — assembled locally via FFmpeg into 1080×1920 (9:16)
H.264 MP4.

## Current Working Implementation (Aug 2026)

This is the **proven, in-production** path — the same quality you get from the UI "Generate video" button.

### Locked V1 Reel Style

These rules are the production contract for every V1 run:

- Use a full-bleed fresh AI background in native 9:16. Do not use the old plashka/card layout, borders, or the red `НОВИНИ` label.
- Render a meaningful Ukrainian editorial headline first: normally 6–11 words, large and readable, and complete enough to explain the main fact without relying on the paragraph below.
- Render optional Ukrainian detail text below the headline in a smaller font. It must be one or two short, complete sentences and must not repeat the headline.
- Keep each spoken hook short and complete (8–12 Ukrainian words); narration must never end mid-phrase.
- Keep the headline/detail block in the upper 25% of the frame, below the branding row. Image prompts must leave negative space in that upper area so text does not cover the subject.
- Do not render `Більше новин тут...` or any other CTA inside the MP4. Video text is not clickable. When `BASE_URL` is configured, the Facebook Reel/Video caption contains `Більше новин тут: <BASE_URL>` followed by the digest content, making the URL clickable in the post.
- Generate a complete new background set for every digest. Never reuse an older carousel image or substitute a synthetic fallback for a missing shot.

The CLI and UI use this same contract and entry point. The UI request
`POST /api/digests/:id/generate-video` calls `startVideoGeneration(digest.id)`,
which spawns `production/video/src/generate-reel.js <digest-id>` with no alternate
configuration. To reproduce a UI run from a shell, use the same script and digest ID.

### Pipeline (UI button → final reel)

```
Digest (DB, newest by DATE) ──► Storyboard
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        │                                                   │
   AI storyboard (Anthropic/OpenAI)             Fallback parser (digest
   when API credits available                             items → shots)
                                  │
                                  ▼
   Shot background images
         └─ Required: complete AI 9:16 text-free set (OpenRouter/OpenAI/fal)
            If any shot image fails, stop before TTS/video work.
                                  │
                                  ▼
   Natural Ukrainian TTS per shot (edge-tts uk-UA-PolinaNeural,
   neural, free via `uvx`; ElevenLabs auto if ELEVENLABS_API_KEY set)
                                  │
                                  ▼
   Motion clip generated per shot (duration = TTS duration,
   exact A/V sync)
                                  │
                                  ▼
   Stitch all clips + background-music.mp3 (132 BPM news bed)
                                  │
                                  ▼
   reel_<timestamp>.mp4   (1080×1920, H.264/AAC, faststart; one shot per digest block)
```

### Key production components

| Step | What works today | Notes |
|------|------------------|-------|
| **Digest source** | `news-digest.db` — `ORDER BY date DESC LIMIT 1` | The image carousels are built from the same newest digest, so voiceover/pictures/text always match. Falls back to API → local `output/digest_*.txt`. |
| **Storyboard** | Fallback: parse numbered digest items → shots (headline + spokenText + prompt) | AI storyboard is attempted first; when API credits are unavailable it auto-falls back. |
| **Background images** | Complete fresh AI-generated text-free 9:16 set for this digest | OpenRouter uses `POST /api/v1/images`; no old carousel or synthetic fallback. |
| **Voice-over** | `uvx edge-tts` → validated `uk-UA-*` voice (default `uk-UA-PolinaNeural`) | Free, no API key, natural Ukrainian. ElevenLabs is used only with an explicit Ukrainian voice ID. |
| **Background music** | `assets/background-music.mp3` — synthesized 132 BPM anthemic news bed | Regenerate: `node src/generate-background-music.cjs` (loudnorm −14 LUFS + limiter). |
| **Sync** | Each clip's duration = its TTS duration; voiceover paired per clip before stitching | `mergeShotVideoAndAudio` per shot; music ducked under voice in `stitch.js`. |
| **Assembly** | `stitchClips({ clipPaths, outputPath, backgroundMusic: true })` | 1080×1920 9:16, H.264/AAC, faststart. |

### Scripts

```
src/generate-reel.js                # MAIN entry (UI / production)
   node src/generate-reel.js latest
   node src/generate-reel.js <digest-id>
   node src/generate-reel.js latest --images-only  # review fresh backgrounds only

src/stitch-real-test.mjs            # Real-data test harness (proven path)
src/generate-background-music.cjs   # Synthesizes assets/background-music.mp3
src/stitch.js                       # FFmpeg concat + music mix
src/generate-clips.js              # Static 9:16 frame + locked V1 overlay
src/storyboard.js                   # AI storyboard (optional; fallback in script)
```

For the complete review-first workflow, including factual visual grounding,
dynamic shot counts, Ukrainian output requirements, provider configuration, and
output paths, see
`../../docs/reel-image-workflow.md`.

### Configuration (`.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `EDGE_TTS_VOICE` | Neural Ukrainian voice | `uk-UA-PolinaNeural` |
| `ELEVENLABS_API_KEY` | ElevenLabs API access (optional) | *(none → edge-tts)* |
| `ELEVENLABS_UKRAINIAN_VOICE_ID` | Explicit Ukrainian ElevenLabs voice ID | *(none → edge-tts)* |
| `OPENROUTER_API_KEY` | OpenRouter image generation | *(none → image generation fails fast)* |
| `OPENROUTER_BASE_URL` | OpenRouter-compatible base URL | `https://openrouter.ai/api/v1` |
| `IMAGE_VENDOR` | `openrouter`, `openai`/`dalle`, or `fal` | auto-detect |
| `DALLE_MODEL` | Image model; OpenRouter example `qwen/qwen-image-3-pro` | `dall-e-3` for OpenAI |
| `OPENAI_API_KEY` | AI storyboard + OpenAI Images (optional) | *(none → storyboard fallback)* |
| `FAL_KEY` | fal/flux 9:16 backgrounds (optional) | *(none → image generation fails fast)* |
| `SERVER_URL` | Digest API for named digests | `http://localhost:3000` |
| `API_ACCESS_KEY` | Auth header for digest API | *(none)* |

---

## Original Research (Kling/Veo/Seedance — not required anymore)

The current pipeline produces reels **locally without paid video-generation APIs** (static AI stills + TTS + music). The research below remains relevant if you later want AI-generated **native video motion**.

### Model Comparison (April 2026)

| Model | Storyboard API | Style ref | 9:16 | Audio | Max clip | Price/sec | 60s Reel |
|--------|---------------|-----------|------|-------|-------------|----------|----------|
| **Kling 3.0** | ✅ 6 shots | ✅ Elements 3.0 | ✅ | ✅ | 15 sec | $0.075 | $4.50 |
| **Veo 3.1 Lite** | ❌ | ✅ 3 ref img | ✅ | ✅ | 8 sec | $0.05-0.08 | $3.00-4.80 |
| **Seedance 2.0** | ⚠️ auto | ✅ 12 ref files | ✅ | ✅ | 15 sec | $0.081 | $4.86 |
| **Runway Gen-4.5** | ❌ | ✅ single ref | ✅ | ❌ | 10 sec | ~$0.12 | $7.20 |

### Recommended (if adding native video motion later)

- **Primary: Kling 3.0 (EvoLink)** — only one with multi-shot `guidances[]` API.
- **Backup: Veo 3.1 Lite (Gemini API)** — cheapest ($0.05/sec@720p).

## Structure

```
production/video/
├── README.md                # This file (working implementation + research)
├── research-video-apis.md   # Full research
├── assets/
│   └── background-music.mp3 # Energetic 132 BPM news music bed (synthesized)
├── output/                  # Finished reels
└── src/
    ├── generate-reel.js         # MAIN production entry (UI)
    ├── generate-background-music.cjs  # Music synth → assets/*.mp3
    ├── stitch-real-test.mjs     # Real-data test harness
    ├── storyboard.js            # AI storyboard (optional)
    ├── generate-clips.js        # Static 9:16 clips + locked V1 overlay
    ├── stitch.js                # FFmpeg concat + music mix
    └── test-functional.mjs      # Functional tests
```

## Risks / Notes

- **TTS network:** edge-tts calls Microsoft servers — needs internet. Retry logic recommended in batch jobs.
- **Images:** a complete fresh image set is mandatory; missing/partial images stop the run before TTS and clips.
- **Generation time:** depends on the number of digest blocks and provider latency.