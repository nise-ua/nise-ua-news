import { describe, expect, it, vi } from 'vitest';
import {
  COVER_IMAGE_REVIEW_SYSTEM,
  coverImageReviewUserPrompt,
  parseCoverImageReview,
  reviewCoverImage,
  sniffImageMediaType,
} from '../cover-image-review.js';

describe('parseCoverImageReview', () => {
  it('accepts ok true', () => {
    expect(parseCoverImageReview('{"ok":true}')).toEqual({ ok: true, reason: '' });
  });

  it('returns a reject reason', () => {
    expect(parseCoverImageReview('{"ok":false,"reason":"Puzzle cube face has an extra row of tiles"}'))
      .toMatchObject({ ok: false, reason: /extra row of tiles/i });
  });
});

describe('sniffImageMediaType', () => {
  it('detects JPEG magic bytes', () => {
    expect(sniffImageMediaType(Buffer.from([0xFF, 0xD8, 0xFF, 0x00]))).toBe('image/jpeg');
  });
});

describe('reviewCoverImage', () => {
  it('skips when no inspector is provided', async () => {
    const verdict = await reviewCoverImage({ buffer: Buffer.from([1, 2, 3]) });
    expect(verdict).toMatchObject({ ok: true, skipped: true });
  });

  it('rejects when the vision critic reports broken geometry', async () => {
    const inspectJson = vi.fn().mockResolvedValue(JSON.stringify({
      ok: false,
      reason: 'Manufactured cube face shows four tiles across the top row',
    }));
    const verdict = await reviewCoverImage({
      buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
      visualSubject: 'A puzzle cube on a desk',
      inspectJson,
      log: () => {},
    });
    expect(verdict.ok).toBe(false);
    expect(inspectJson).toHaveBeenCalledWith(
      COVER_IMAGE_REVIEW_SYSTEM,
      coverImageReviewUserPrompt('A puzzle cube on a desk'),
      expect.objectContaining({ mediaType: 'image/png' }),
    );
  });

  it('does not fail the cover if vision is unavailable', async () => {
    const verdict = await reviewCoverImage({
      buffer: Buffer.from([0xFF, 0xD8, 0xFF]),
      inspectJson: async () => {
        throw new Error('Cloudflare LLM does not inspect images');
      },
      log: () => {},
    });
    expect(verdict).toMatchObject({ ok: true, skipped: true });
  });
});
