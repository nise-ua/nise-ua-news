# Unified Social Image Pipeline

This document explains how the visual approach (originally designed for Instagram) can be used across all social platforms (Facebook, Telegram) to increase engagement.

## Architecture

1.  **Generation Phase**:
    *   `production/image/src/generate.js` uses **Claude** to create clickbait headlines and **fal.ai** to create abstract backgrounds.
    *   **Sharp** overlays the text.
    *   Result: A high-impact 1080x1350 image.

2.  **Publication Phase**:
    *   **Instagram**: Official Graph API for Images and Reels.
    *   **Facebook (Pages)**: 
        *   **Images**: Uses `facebook-image.js` via the `/photos` endpoint.
        *   **Videos/Reels**: Uses `facebook-video.js` via the `/videos` endpoint.
    *   **Facebook (Personal)**: Can be done via Patchright browser automation by uploading the file.

## Video & Audio Integration (Reels Approach)
The pipeline also supports high-engagement video content:
- **Audio**: `production/audio/` handles TTS (Text-to-Speech) using ElevenLabs or Google Cloud TTS to create voice-overs from the digest.
- **Video**: `production/video/` handles stitching AI-generated clips (Kling/Veo) and audio using FFmpeg to create 9:16 Reels/Shorts.

The new `facebook-video.js` publisher allows sending these finished Reels directly to your Facebook Page.

## Why use Images for Facebook?
- **Stopping the scroll**: Abstract backgrounds with bold, high-contrast text stand out much more than standard link previews or plain text.
- **Native Look**: Images are treated as native content by the FB algorithm, often receiving better distribution than external links.

## How to use the new FB Image Publisher
The system now includes a specialized publisher: `src/services/publishers/facebook-image.js`.

To trigger it via the main `publishDigest` service, ensure the `digest` object has an `image_url` property and include `'facebook-image'` in your requested platforms.

```javascript
// Example usage in the pipeline
const results = await publishDigest(digest, config, ['facebook-image', 'telegram']);
```

## Future Improvements
- **Facebook-Specific Aspect Ratios**: Add a 1200x630 (16:9) option to the generator for better FB feed fitting.
- **Auto-Upload to S3/Cloudinary**: To use the Graph API for both FB and IG, the generated images must be hosted on a public URL. A future step should include auto-uploading local `output/` images to a storage provider.
