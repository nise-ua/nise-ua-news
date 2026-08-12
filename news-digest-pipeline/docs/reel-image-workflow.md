# Reel Image Workflow

This document is the persistent operating contract for generating NiSeNews
reel backgrounds and reels.

## Visual grounding rules

Every news block must produce a visual based on its factual core:

1. Extract the neutral fact: who did what.
2. Extract concrete entities: companies, products, technologies, places, or
   events.
3. Create one concrete visual subject showing those entities and their action.
4. Generate the English image prompt from that subject.

Do not turn the author's sarcastic framing into imagery. In particular,
`революція`, `історія`, `story`, `curious`, `funny`, and similar words are not
visual subjects when they occur as sarcasm, rhetorical questions, or commentary.
For example, the GPT-5.6 Sol story must show ChatGPT/product functionality
such as a reasoning-depth slider, not a revolution, crowd, history book, or
generic hostile-robot scene.

The shared implementation is:

- `production/lib/visual-grounding.js`
- `production/video/src/storyboard.js`
- `production/video/src/generate-reel.js`
- `production/image/src/generate.js`

The reel path grounds prompts both after storyboard generation and immediately
before the image provider call. This protects the fallback path as well.

## Reel layout contract

These rules apply to the final reel text overlay:

- Use a fresh, text-free, native 9:16 AI background for every shot.
- Keep the existing NiSeNews branding and reel composition.
- Put the headline/detail block in the upper 25% of the frame, below the
  branding row.
- Always draw a locked dark readability band over the top ~25% of the frame
  (solid panel + soft fade) with white overlay text — same treatment as the
  Google Earth slide. Do not switch to dark navy text based on background
  brightness for the upper reel layout.
- Do not render `Більше новин тут...` or another CTA inside the reel.
- Do not use carousel PNGs as reel backgrounds.
- If any background image fails, stop before TTS and video assembly.

The overlay implementation is in
`production/video/src/generate-clips.js`. Do not move the text block to the
bottom or reintroduce the CTA without an explicit product decision.

## CLI workflow

Run commands from `news-digest-pipeline/`.

### 1. Generate backgrounds only for review

This runs digest loading, storyboard generation, grounding, and image
generation, then stops before TTS and video assembly:

```bash
node production/video/src/generate-reel.js latest --images-only
```

For a fixed digest:

```bash
node production/video/src/generate-reel.js d651aa62-b4d3-42f0-9773-28766d130605 --images-only
```

Outputs:

```text
production/video/output/reel-image_<timestamp>_01.png
production/video/output/reel-image_<timestamp>_02.png
...
```

Review these images and get approval before running the full reel.

### 2. Generate the full reel after approval

```bash
node production/video/src/generate-reel.js latest
```

The full command generates a fresh image set again, creates Ukrainian TTS and
Ukrainian on-screen text, adds the unchanged reel layout, creates synchronized
clips, and stitches the final MP4:

```text
production/video/output/reel_<timestamp>.mp4
```

The UI uses the same entry point with a digest ID.

### 3. Generate carousel images only

Carousel stills use the same grounding rules but a separate 4:5 image
pipeline:

```bash
node production/image/src/generate.js latest
```

Outputs:

```text
production/image/output/instagram_<timestamp>_NN.png
```

## Provider configuration

The current working local configuration uses:

- `LLM_VENDOR=openrouter` for storyboard/headline JSON generation.
- `IMAGE_VENDOR=google` with `GOOGLE_MODEL=gemini-2.5-flash-image` for images.

OpenAI and OpenRouter image generation may fail when their account has no
credits. Do not silently substitute old images or synthetic placeholders.
The pipeline must fail before TTS if it cannot produce a complete fresh set.

## Dynamic shot count and language

The number of images and shots is determined dynamically from the numbered
news blocks in the selected digest. Generate exactly one image and one shot per
actual block; do not add, merge, duplicate, or invent blocks. No configuration
file should contain a fixed story/image count.

All editorial output must be Ukrainian:

- `headline`, `detailText`, and `spokenText` are Ukrainian.
- Voice uses Ukrainian neural TTS (`uk-UA-PolinaNeural`) unless an explicitly
  configured Ukrainian-capable ElevenLabs voice is selected.
- Company, product, and model names may remain in Latin script.
- Image prompts remain English internally for the image provider, but they are
  never rendered as reel text.

## Known post-run warning

The full reel can successfully create the MP4 and then exit with
`Database not initialized. Call initDb() first.` during the final metadata
update. Verify the MP4 exists in `production/video/output/` before treating
that warning as an image or video generation failure.
