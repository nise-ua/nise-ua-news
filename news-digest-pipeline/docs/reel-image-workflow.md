# Reel Image Workflow

This document is the persistent operating contract for generating NiSeNews
reel backgrounds and reels.

**FROZEN.** Overlay copy, layout, grounding, and CLI review-first workflow
below are locked. Do not loosen word bands, allow unfinished sentences,
reintroduce mid-sentence truncation, move text off the upper 25%, add an
in-video CTA, or skip `assertFinishedReelCopy` without an explicit product
decision.

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

### 1. Generate backgrounds only for review (Reels and Shorts)

This runs digest loading, storyboard generation, grounding, and image
generation, then stops before TTS and video assembly:

```bash
node production/video/src/generate-reel.js latest --images-only
```

For a fixed digest:

```bash
node production/video/src/generate-reel.js d651aa62-b4d3-42f0-9773-28766d130605 --images-only
```

To review images for a YouTube Short:

```bash
node production/video/src/generate-reel.js latest --images-only --format shorts
```

Outputs:

```text
production/video/output/reel-image_<timestamp>_01.png
production/video/output/reel-image_<timestamp>_02.png
...
```

Review these images and get approval before running the full reel or Short.

### 2. Generate the full reel or Short after approval

For Facebook Reels:

```bash
node production/video/src/generate-reel.js latest
```

For YouTube Shorts:

```bash
node production/video/src/generate-reel.js latest --format shorts
```

The full command generates a fresh image set again, creates Ukrainian TTS and
Ukrainian on-screen text, adds the unchanged reel layout, creates synchronized
clips, and stitches the final MP4:

```text
production/video/output/reel_<timestamp>.mp4
production/video/output/shorts_<timestamp>.mp4
```

The UI uses the same entry point with a digest ID. The dashboard **Reel**
button publishes that digest video to Facebook as a Reel (caption links to the
already-posted digest feed post) and also as a Facebook Story. The dashboard
**YouTube** button publishes the generated Short to YouTube.

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

## Frozen control: finished overlay copy

**Locked bands** (do not retune without a product decision):

- `headline`: one complete Ukrainian sentence, 6–11 words.
- `detailText`: exactly one complete Ukrainian sentence, 8–12 words.
- `spokenText`: one complete Ukrainian sentence.

A trailing period is not enough. Forbidden: cutting on a comma/dash, ending on
a conjunction or preposition, dangling verbs (`а тепер ріже.`), lead-ins like
`і ледь не дав ще один шанс` with no object, two-sentence details, or
five-word stubs. Never slice overlay copy by character/word cap.

Enforced in `production/lib/reel-ukrainian-copy.js`
(`HEADLINE_WORD_*`, `DETAIL_WORD_*`, `looksUnfinishedSentence`,
`ensureUkrainianOnScreenCopy`, `assertFinishedReelCopy`). Incomplete LLM copy
is replaced from `spokenText` or the run fails. Do not ship review frames that
still trail off or overflow the smaller headline.

After a successful full reel, the script stores `video_url` and `reel_url` on
the digest so the dashboard Reel button can publish it.
