# Technical Task: Research of Image Generation Services

## Context

We are building an automated news digest publication pipeline for Instagram. A service is needed to generate unique images (1080x1350, 4:5 format) for each post.

## Generation Method

**Image-to-image (img2img) based on reference templates.**

We have 2-10 pre-created templates that define the style, color palette, and composition. For each publication:

1. A random template is chosen.
2. A short prompt is generated based on the digest content (1 sentence, in English).
3. The service receives the template + prompt → returns a unique image in the same style.
4. Headline text is overlaid **separately, programmatically** (not by the AI generator).

Thus, the service is **only** required to generate the background image in the style of the reference. We do NOT generate text on the image via AI.

## Service Requirements

### Mandatory

1. **API Access** — Programmatic calling, no manual intervention.
2. **Image-to-image** — Accept a reference image + text prompt.
3. **Style Control** — Result must be visually close to the reference (palette, mood, style).
4. **Resolution** — Minimum 1080x1350 pixels (or ability to set 4:5 aspect ratio).
5. **Speed** — Generation in < 30 seconds.
6. **Quality** — Image must look professional (no "AI junk" with artifacts).
7. **Cost** — Reasonable for 1-3 images per day (~30-90 per month).

### Desirable

8. **Style Reference / Style Transfer** — Ability to set "style as on this image."
9. **Negative Prompts** — Ability to exclude unwanted elements.
10. **Seed / Determinism** — Reproducibility of results.
11. **Inpainting** — Ability to keep part of the image (e.g., a frame) and only generate the background.
12. **Batch API** — Generate several variations in one call.

## Services for Research

### Priority (2025-2026, Current)

- **Google Imagen 3 / Gemini** — Google's latest model, API via Vertex AI.
- **Flux (Black Forest Labs)** — Flux Pro / Flux Dev, API via Replicate or BFL directly.
- **Ideogram v3** — Strong in text on images (though we don't need it for text).
- **Midjourney API** — Check for public API availability.
- **Recraft v3** — Strong in design, style support.
- **Leonardo.ai** — API, img2img, style reference.
- **Stability AI (SDXL, SD3, Stable Cascade)** — Open models, Replicate/self-host.

### Model Hosting Platforms

- **Replicate** — Hosts Flux, SDXL, SD3, etc.; simple API, pay-per-use.
- **Together.ai** — Fast inference, supports Flux.
- **fal.ai** — Fast API for generative models.
- **RunPod** — GPU serverless for self-hosting.

## Comparison Criteria

For each service, collect:

| Parameter | What to Find Out |
|----------|-----------|
| Model | Name and version |
| API | Documentation URL, request format |
| img2img | Supported? What parameters? |
| Style Reference | Can an image be passed as a style ref? |
| Resolution | Max resolution, aspect ratio support |
| Speed | Average generation time |
| Price | Per 1 image, monthly plan if any |
| Quality | Subjective evaluation |
| Limits | Content policy, rate limits |
| SDK | Node.js / Python support |

## Research Constraints

- Focus on services with a **ready API** (not models requiring manual self-hosting).
- Priority on **current 2025-2026 models**.
- Do not research services without img2img / style reference.
- Do not research services with only a Web UI (no API).
