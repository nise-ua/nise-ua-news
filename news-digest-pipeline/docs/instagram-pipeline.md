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

## Notes

- Instagram API requires a Business/Creator account.
- @your_account — check account type.
- If personal, switch to Creator (free, no follower loss).
