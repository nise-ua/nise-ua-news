# Instagram Pipeline — Working Document

## Goal

Automated publication of news digests to Instagram with unique images and clickbait headlines.

## Instagram Limitations

- **Caption**: Maximum 2200 characters (including hashtags).
- **Images**: Square (1080x1080) or 4:5 (1080x1350) — 4:5 is best for the feed.
- **Hashtags**: Up to 30, 5-15 recommended.
- **Comments**: Can be added programmatically via API (for remaining text).
- **API**: Instagram Graph API via Facebook App (Business/Creator account).
- **Text on Image**: Not indexed but attracts attention in the feed.

## Pipeline Architecture

```
Digest (ready text)
    │
    ├── 1. Generate Image Prompt
    │       Claude API: digest → short clickbait headline + image prompt
    │
    ├── 2. Select Template Reference (Randomly from 2-10 templates)
    │
    ├── 3. AI Image Generation (img2img based on template + prompt)
    │       Service: [TBD — research result]
    │
    ├── 4. Text Overlay on Image
    │       - Clickbait headline (large font, support for Cyrillic)
    │       - Programmatic (Sharp/Canvas), perfect spelling
    │       - Format: 1080x1350 (4:5)
    │
    ├── 5. Prepare Caption
    │       - First 2000 characters of the digest (or shortened version)
    │       - Hashtags at the end
    │       - Remaining text → comments
    │
    └── 6. Publication
            - Instagram Graph API or Patchright
            - First comment with the rest of the text (if needed)
```

## Implementation Phases

### Phase 1: Image Generation (Current)

**Task:** Learn to create unique images based on reference templates.

**Steps:**
1. Create 2 test templates (style, palette, composition).
2. Choose a generation service.
3. Write a script: template + prompt → unique image.
4. Test with 5-10 variations.

**Success Criteria:**
- High visual quality image.
- Consistent style (recognizable brand).
- Generation takes < 30 seconds.
- Works via API without manual intervention.

### Phase 2: Text Overlay

**Task:** Programmatically overlay a clickbait headline on the generated image.

**Steps:**
1. Choose a font (bold, readable, Cyrillic support).
2. Write an overlay script (Sharp or node-canvas).
3. Handle edge cases: long text, line wraps, background contrast.
4. Add a backing/shadow for readability on any background.

**Success Criteria:**
- 100% readable text on any background.
- Perfect spelling (text comes from Claude).
- 1080x1350 (4:5) format.

### Phase 3: Instagram Publication

**Task:** Automated publication of image + caption.

**Steps:**
1. Determine approach (API or Patchright).
2. Caption: first ~2000 characters + hashtags.
3. Test publication.
4. If text > 2000: remaining in the first comment.

### Phase 4: Main Pipeline Integration

**Task:** Instagram is published automatically alongside Telegram and Facebook.

## Reference Templates

| # | Description | Style | File |
|---|----------|-------|------|
| 1 | TBD | TBD | templates/instagram-01.png |
| 2 | TBD | TBD | templates/instagram-02.png |

## Headline Generation Prompt

```
Based on this digest, create:
1. A clickbait headline (5-8 words, Ukrainian) — for image overlay.
2. A background image generation prompt (English, 1 sentence).

The headline should:
- Provoke curiosity.
- Be provocative but not false.
- Contain specifics (numbers, names).

Example: "AI fired 80% of the department. Boss doesn't regret it."
Example: "Stack Overflow is dead. What's next?"
```

## Phase 5: Video Reels (Working, Aug 2026)

**Task:** Generate a synchronized Reel from the same digest + carousel images — voice-over + music — published via the video pipeline.

**Status:** ✅ Implemented in production. The UI button and CLI use the same
production entry point. `POST /api/digests/:id/generate-video` calls
`startVideoGeneration(digest.id)`, which spawns:
`node production/video/src/generate-reel.js <digest-id>`.
There are no UI-specific generation flags or alternate styles; `latest` is the
CLI shorthand for selecting the newest digest.

**Working Reel Recipe (matches current on-brand results):**

1. **Source of truth = newest digest by DATE** (not alphabetical file sort):
   `SELECT content FROM digests ORDER BY date DESC LIMIT 1` from `data/news-digest.db`.
   The carousel images are built from the same newest digest, so pictures, voice, and text always match.

2. **Images = complete fresh set generated for this digest.**
    - Video uses OpenRouter (`POST /api/v1/images`), OpenAI, or fal for text-free 9:16 backgrounds.
    - Prompts place the focal object away from the selected `textPosition` (`upper` or `lower`) and leave negative space for the overlay.
    - A missing or partial set stops the reel before TTS/clips; older carousel files are never reused.

3. **Locked V1 editorial and visual style:**
    - Full-bleed background only: no plashka/card layout, borders, or red `НОВИНИ` label.
    - Large meaningful Ukrainian headline (6–11 words) followed, when useful, by smaller detail text (one or two complete sentences).
    - Short complete spoken hook per story (8–12 Ukrainian words); total duration is determined by the number of digest blocks and TTS output, and narration must never be truncated mid-phrase.
    - Use `textPosition: "upper"` for the current reel layout; headlines/details occupy the upper 25% below branding.
    - No `Більше новин тут...` CTA is embedded in the MP4 because it cannot be clicked there.

4. **Voice = natural neural Ukrainian TTS**:
   - Default: `uvx edge-tts --voice uk-UA-PolinaNeural` (free, no API credits, human-quality).
   - Optional: `ELEVENLABS_API_KEY` switches to ElevenLabs multilingual.

5. **Music = energetic 132 BPM news bed**:
   - `assets/background-music.mp3` (synthesized by `generate-background-music.cjs`, −14 LUFS).

6. **Clip sync**: each clip duration = its TTS duration; voiceover mixed per clip before stitching; music under voice.

7. **Output**: `production/video/output/reel_<timestamp>.mp4` — 1080×1920 9:16 H.264/AAC.

8. **Facebook Reel caption**: the publisher adds `Більше новин тут:` plus a
   permalink to the already-published Facebook digest post. Publishing a Reel
   also posts the digest video as a Facebook Story. The MP4 contains no CTA text.

**Scripts:**
```
production/video/src/generate-reel.js              # production entry (UI)
production/video/src/stitch-real-test.mjs           # real-data test harness
production/video/src/generate-background-music.cjs  # music synthesis
```

### Success Criteria (Phase 5)
- Voiceover matches the latest digest text AND the on-screen carousel headlines (verified via OCR).
- Voice is natural neural Ukrainian (edge-tts / ElevenLabs), not robotic.
- Background music is energetic/advertising-friendly, not noise.
- Reel generation is fully automated from the UI button.

## Notes

- Instagram API requires a Business/Creator account.
- @your_account — check account type.
- If personal, switch to Creator (free, no follower loss).
