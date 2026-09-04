import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDigest, getDigest, initDb, updateDigest } from './index.js';

describe('digest youtube_shorts_url', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'news-db-'));
    initDb(join(dir, 'news-digest.db'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists youtube_shorts_url without touching video_url', () => {
    const id = createDigest({ date: '2026-08-24', part: 1 });
    updateDigest(id, {
      video_url: 'http://localhost:3000/videos/reel_1.mp4',
      youtube_shorts_url: 'http://localhost:3000/videos/shorts_1.mp4',
    });
    const row = getDigest(id);
    expect(row.video_url).toBe('http://localhost:3000/videos/reel_1.mp4');
    expect(row.youtube_shorts_url).toBe('http://localhost:3000/videos/shorts_1.mp4');
  });

  it('persists image_url for the Facebook digest cover', () => {
    const id = createDigest({ date: '2026-09-01', part: 1 });
    updateDigest(id, {
      image_url: 'http://localhost:3000/images/digest-cover_1.png',
    });
    expect(getDigest(id).image_url).toBe('http://localhost:3000/images/digest-cover_1.png');
  });
});
