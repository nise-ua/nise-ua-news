# HTML Template Reel Images (alternative path)

Hybrid alternative to the pure AI-image reel path: grounded **AI 9:16 scene
background** + **HTML text/brand overlay** (Patchright screenshot). Frames are
already complete (`overlay: false`), so Sharp does not redraw headlines.

Pass `--no-ai-bg` for typography-only CSS gradients (no image provider).

Nothing in `production/video/src/generate-reel.js`, `production/lib/image-backends.js`,
`production/video/src/generate-clips.js` or `production/lib/reel-overlay-theme.js`
is modified by this path.

## When to use which

| | `generate-reel.js` (AI images) | `generate-reel-html.js` (HTML hybrid) |
| --- | --- | --- |
| Background scene | AI, text-free | AI, text-free (same vendors) |
| Text / brand | Sharp SVG overlay | HTML template (baked in) |
| Cost & latency | Paid API + overlay | Paid API + fast Chromium composite |
| Typography control | SVG layout | Full HTML/CSS |
| Offline / no keys | Not available | `--no-ai-bg` typography-only |

## Commands

Set dashboard routing via settings / `.env`:

```bash
REEL_FRAME_MODE=html   # Video / Shorts buttons use this path
# REEL_FRAME_MODE=ai   # classic generate-reel.js
```

Or Settings → Загальні → «Режим кадрів Reel».

Review frames first (no TTS / video):

```bash
cd news-digest-pipeline
node production/html-reel/src/generate-reel-html.js latest --images-only
# typography only (no AI picture):
node production/html-reel/src/generate-reel-html.js latest --images-only --no-ai-bg
```

Outputs: `production/video/output/reel-html-image_<timestamp>_NN.png`

Full reel after approval:

```bash
node production/html-reel/src/generate-reel-html.js latest
```

Final MP4: `production/video/output/reel_html_<timestamp>.mp4`

## Layout contract

- Canvas **1080×1920**
- Full-bleed AI scene via `{{backgroundImage}}` (`object-fit: cover`)
- NiSeNews brand + Ukrainian headline/detail in upper dark band
- Safe margins ~80 left / 180 right
- No `Більше новин тут...` CTA
- One frame per digest news block

## Templates

`editorial-dark`, `editorial-light`, `accent-number` — round-robin by shot index.

Placeholders: `{{headline}}`, `{{detail}}`, `{{shotNumber}}`, `{{brandNiSe}}`,
`{{brandNews}}`, `{{backgroundImage}}`.

## Tests

```bash
cd news-digest-pipeline
npx vitest run production/html-reel
HTML_REEL_BROWSER_TEST=1 npx vitest run production/html-reel
```
