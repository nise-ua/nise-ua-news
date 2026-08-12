import { describe, expect, it } from 'vitest';
import { digestVideoUrl, localVideoPathFromUrl } from './facebook-video-file.js';

describe('digestVideoUrl', () => {
  it('prefers video_url from the digest video button', () => {
    expect(digestVideoUrl({
      video_url: 'https://example.com/videos/reel_1.mp4',
      reel_url: 'https://example.com/reels/reel_old.mp4',
    })).toBe('https://example.com/videos/reel_1.mp4');
  });

  it('falls back to reel_url', () => {
    expect(digestVideoUrl({ reel_url: 'https://example.com/reels/reel_1.mp4' }))
      .toBe('https://example.com/reels/reel_1.mp4');
  });
});

describe('localVideoPathFromUrl', () => {
  it('returns null for a missing file', () => {
    expect(localVideoPathFromUrl('https://example.com/videos/missing-reel.mp4')).toBeNull();
  });

  it('rejects non-mp4 names', () => {
    expect(localVideoPathFromUrl('https://example.com/videos/note.txt')).toBeNull();
  });
});
