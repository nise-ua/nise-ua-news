# Video Pipeline V2 — Direct Veo Generation

This directory is the handover boundary for the V2 direct-video pipeline. V1
remains in `../src` and is not modified by Phase 1.

## Goal

Generate Facebook Reel clips directly from a digest prompt with
`x-ai/grok-imagine-video-1.5` through OpenRouter. Grok produces the video; V2
must not call the image generator, TTS, motion-clip
generator, or music mixer.

Grok is a clip generator, not a long-form storyboard endpoint. It supports
1–15 second clips, so a future 45–60 second Reel will still need
mechanical concatenation of several completed MP4s.

## OpenRouter capability snapshot (2026-08-06)

- Endpoint: `POST https://openrouter.ai/api/v1/videos`
- Polling: the returned job's `polling_url`
- Content: `GET /api/v1/videos/{id}/content?index=0`
- Model: `x-ai/grok-imagine-video-1.5`
- Input: text and optional reference images
- Output: video (the model catalog does not advertise native audio)
- Durations: 1–15 seconds
- Resolutions: 480p, 720p, and 1080p
- Aspect ratios: 16:9 and 9:16
- Portrait target: 720x1280 or 1080x1920
- Pricing currently listed by OpenRouter: $0.08/sec at 480p, $0.14/sec at
  720p, and $0.25/sec at 1080p; image input is $0.01/image

Source: OpenRouter video model metadata and text-to-video cookbook. Verify model
metadata and pricing before production rollout.

## Phase 1

`veo-openrouter.js` provides a small provider adapter:

1. validate supported request values;
2. submit an asynchronous video job;
3. poll with bounded exponential backoff;
4. download the first MP4 content asset;
5. return job metadata and the local file path.

Run a paid smoke test only after setting a valid key:

```bash
cd news-digest-pipeline
node production/video/v2/test-veo-openrouter.mjs --prompt "...
```

Use `--dry-run` to validate configuration and request construction without
spending credits.

## Planned phases

- **Phase 1 (current):** provider adapter and one-clip smoke test.
- **Phase 2:** digest-to-direct-video storyboard JSON; Ukrainian narration and
  visual prompt policy.
- **Phase 3:** `generate-reel-v2.js`, bounded parallel jobs, media validation,
  and minimal MP4 concatenation.
- **Phase 4:** select V1/V2 from the existing job route and expose V2 progress.
- **Phase 5:** real-digest acceptance test, Facebook publishing, cost and
  quality gates, then gradual rollout.

## Security

Never commit `.env` or an API key. The repository currently contains an
OpenRouter-looking value in tracked/example configuration from earlier work;
rotate that key and replace it with a placeholder before publishing changes.