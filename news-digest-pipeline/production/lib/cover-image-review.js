/**
 * Vision critic for a generated Facebook cover PNG.
 * Checks the pixels (impossible geometry, readable text). Does not name
 * specific products or add prompt catalogs.
 */

export const COVER_IMAGE_REVIEW_SYSTEM = `You inspect one Facebook cover photograph (no on-image caption).

Reject only when the pixels are clearly broken as a photograph of real objects:
- Readable text, letters, logos, watermarks, or UI labels
- Impossible manufactured geometry (wrong grid on a puzzle cube, extra keys on a keypad, extra fingers or limbs, melted faces)
- A screenshot or app UI instead of a physical scene

Accept imperfect lighting, crop, or style. Do not reject a coherent phone, laptop, person, or toy.

Reply JSON only:
{"ok":true}
or
{"ok":false,"reason":"one short English sentence"}`;

export function sniffImageMediaType(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
  return 'image/png';
}

export function parseCoverImageReview(raw) {
  const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Cover image review did not return JSON');
  let data;
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Cover image review JSON is invalid');
  }
  const ok = data.ok === true;
  return {
    ok,
    reason: ok ? '' : String(data.reason || 'Cover image failed visual review').trim(),
  };
}

export function coverImageReviewUserPrompt(visualSubject = '') {
  const subject = String(visualSubject || '').trim();
  return subject
    ? `Intended scene (do not require an exact match): ${subject}\nInspect the attached image.`
    : 'Inspect the attached image.';
}

/**
 * @param {{ buffer: Buffer, visualSubject?: string, inspectJson?: Function, log?: Function }} opts
 * inspectJson(system, user, { mediaType, base64 }) → JSON text
 */
export async function reviewCoverImage({
  buffer,
  visualSubject = '',
  inspectJson,
  log = () => {},
} = {}) {
  if (typeof inspectJson !== 'function') {
    return { ok: true, skipped: true, reason: '' };
  }
  if (!buffer?.length) {
    throw new Error('Cover image review has no image bytes');
  }
  const mediaType = sniffImageMediaType(buffer);
  const base64 = Buffer.from(buffer).toString('base64');
  try {
    const raw = await inspectJson(
      COVER_IMAGE_REVIEW_SYSTEM,
      coverImageReviewUserPrompt(visualSubject),
      { mediaType, base64 },
    );
    const verdict = parseCoverImageReview(raw);
    if (!verdict.ok) {
      log(`Cover image review rejected: ${verdict.reason}`);
    }
    return { ...verdict, skipped: false };
  } catch (err) {
    log(`Cover image review skipped (${err.message})`);
    return { ok: true, skipped: true, reason: err.message };
  }
}
