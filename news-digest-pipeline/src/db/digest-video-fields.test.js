import { describe, expect, it } from 'vitest';
import { digestVideoUpdateFields } from './digest-video-fields.js';

describe('digestVideoUpdateFields', () => {
  it('writes only youtube_shorts_url for shorts', () => {
    expect(digestVideoUpdateFields('shorts', {
      videoUrl: 'http://localhost:3000/videos/shorts_1.mp4',
      reelUrl: 'http://localhost:3000/reels/shorts_1.mp4',
    })).toEqual({
      youtube_shorts_url: 'http://localhost:3000/videos/shorts_1.mp4',
    });
  });

  it('writes Facebook video/reel URLs for the default cut', () => {
    expect(digestVideoUpdateFields('facebook', {
      videoUrl: 'http://localhost:3000/videos/reel_1.mp4',
      reelUrl: 'http://localhost:3000/reels/reel_1.mp4',
    })).toEqual({
      video_url: 'http://localhost:3000/videos/reel_1.mp4',
      reel_url: 'http://localhost:3000/reels/reel_1.mp4',
    });
  });
});
