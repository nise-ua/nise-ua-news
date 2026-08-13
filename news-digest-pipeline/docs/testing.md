# Production / pipeline tests

Agent contract for running tests **before and after** any `production/lib`
refactor. Always re-run tests after each step.

Work from `news-digest-pipeline/` (the repo root `package.json` has no test
script).

```bash
cd news-digest-pipeline
```

## Commands

| Command | What it runs |
|---------|----------------|
| `npm test` | Vitest: `src/**/*.test.js` + `production/lib/__tests__/**/*.test.js` |
| `npm run test:node` | `node:test` files next to production libs: `production/lib/*.test.js` |
| `npm run test:production` | Vitest production `__tests__` **plus** `node:test` production files |
| `npm run test:all` | Full Vitest suite **plus** `node:test` production files |
| `npm run test:watch` | Vitest watch mode |

Gate for a production-lib change:

```bash
cd news-digest-pipeline
npm run test:production
```

Gate before calling a step done:

```bash
cd news-digest-pipeline
npm run test:all
```

If `npm test` / `test:all` fails in `src/services/publishers/` (for example
YouTube publish tests) and the current task only touches `production/lib`,
still require a green `npm run test:production`. Do not “fix” unrelated
publisher tests unless the user asked.

## Two test styles (do not mix casually)

1. **Vitest** (preferred for new tests)  
   - Location: `src/**/*.test.js`, `production/lib/__tests__/**/*.test.js`  
   - Config: `vitest.config.js`  
   - Import: `import { describe, expect, it, vi } from 'vitest'`

2. **node:test** (legacy, keep until migrated)  
   - Location: `production/lib/*.test.js` (same folder as the module)  
   - Import: `import test from 'node:test'`  
   - Vitest **excludes** these files on purpose. Running only `npm test` does
     not execute them.

New tests for extracted libs go under `production/lib/__tests__/`. Do not add
new `node:test` files.

## Current production-lib coverage

| Module | Vitest | node:test (legacy) |
|--------|--------|--------------------|
| `production/lib/digest.js` | `__tests__/digest.test.js` | — |
| `production/lib/visual-grounding.js` | `__tests__/visual-grounding.test.js` | `visual-grounding.test.js` |
| `production/lib/image-backends.js` | `__tests__/image-backends.test.js` | — |
| `production/lib/tts.js` | `__tests__/tts.test.js` | — |
| `production/lib/ffmpeg-helpers.js` | `__tests__/ffmpeg-helpers.test.js` | — |
| `production/lib/logging.js` | `__tests__/logging.test.js` | — |
| `production/lib/tts-pronunciation.js` | — | `tts-pronunciation.test.js` |
| `production/lib/reel-overlay-theme.js` | — | `reel-overlay-theme.test.js` |
| Shared mocks / digest fixtures | `__tests__/helpers.js`, `__tests__/helpers.test.js`, `__tests__/fixtures/digest.js` | — |
| `production/video/src/generate-reel.js` (ESM/post-stitch) | `__tests__/generate-reel-esm.test.js` | — |
| `src/services/video-generator.js` | `src/services/video-generator.test.js` | — |

Digest callers (do not reimplement load/parse locally):

- `production/image/src/generate.js`
- `production/video/src/generate-reel.js`
- `production/video/src/storyboard.js`
- `production/audio/src/generate-voiceover.js`

Image backend callers (do not reimplement vendor adapters locally; pass `aspect: '4:5'` for feed, `aspect: '9:16'` for reels):

- `production/image/src/generate.js`
- `production/video/src/generate-reel.js`

TTS callers (do not reimplement edge-tts / ElevenLabs shot audio locally; use `production/lib/tts.js`):

- `production/video/src/generate-reel.js`
- `production/video/src/stitch-real-test.mjs`
- `production/audio/src/generate-voiceover.js` (re-exports shared helpers; CLI keeps OpenAI podcast path)

FFmpeg helpers callers (do not reimplement duration probe / shot A+V merge /
music mix filter locally; use `production/lib/ffmpeg-helpers.js`):

- `production/lib/tts.js` (re-exports `getAudioDuration`)
- `production/video/src/stitch.js` (re-exports `mergeShotVideoAndAudio`; keeps background-music resolution)
- `production/video/src/generate-reel.js` (via stitch)
- `production/video/src/stitch-real-test.mjs` (via stitch)

Logging / path helpers (do not reimplement `[HH:MM:SS]` log or
`join(__dirname, '..', '..', '..')` ROOT locally; use `production/lib/logging.js`):

- `production/image/src/generate.js`
- `production/video/src/generate-reel.js`
- `production/video/src/storyboard.js`
- `production/video/src/generate-clips.js`
- `production/video/src/stitch.js`
- `production/audio/src/generate-voiceover.js`
- `production/video/src/stitch-real-test.mjs`
- `production/video/src/test-functional.mjs`

App / publisher tests live under `src/` (hashtags, model catalog, Facebook
caption/video/publish). Those are Vitest-only.

## How to write new production-lib tests

Reuse helpers instead of hitting the network, sqlite, or ffmpeg:

- `production/lib/__tests__/helpers.js` — `withEnv`, `mockFetchResponses`,
  `sqliteExecMock`, `mockExecFileSync`, `unstubGlobals`
- `production/lib/__tests__/fixtures/digest.js` — numbered digest, `#news`
  prefix, inline URLs, sarcastic lead-ins, short items, 🤖 footer

Pattern:

```js
import { afterEach, describe, expect, it } from 'vitest';
import { unstubGlobals } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});
```

Rules:

- No real API keys, no live image/TTS/ffmpeg calls in unit tests.
- Inject fs/exec/fetch where the module supports it (`getDigestContent`
  options). Do not spawn `generate-reel.js` / `generate.js` in unit tests.
- When extracting a lib, write or extend Vitest tests **first**, then move
  callers, then run `npm run test:production`.
- Do not delete legacy `node:test` files; move them to `.archive/` later if
  asked.

## Refactor checklist (agents)

1. Run `npm run test:production` (baseline).
2. Add/adjust Vitest tests for the target module.
3. Extract or migrate code.
4. Run `npm run test:production` again. If it fails, stop and fix.
5. Optionally `npm run test:all` before handing back to the user.
