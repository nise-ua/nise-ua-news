/**
 * Reel overlay copy wrapping. Never drop leftover words: unfinished
 * on-screen sentences come from slicing wrap output, not from SVG.
 */

export function sanitizeDetailText(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  const sentences = s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (sentences.length > 0) {
    s = sentences[0];
  }
  if (!/[.!?]$/.test(s)) {
    s = `${s.replace(/[,:;—-]+$/, '')}.`;
  }
  return s;
}

export function finishHeadline(text) {
  const s = String(text || '').trim().replace(/[,:;—-]+$/, '');
  if (!s) return '';
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** Wrap on spaces. A word longer than maxChars keeps its own line. */
export function wrapWords(text, maxChars) {
  const limit = Math.max(1, Number(maxChars) || 1);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > limit) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function charsPerLine(fontSize, frameWidth = 1080, margin = 80, charWidthEm = 0.52) {
  const usable = Math.max(1, frameWidth - margin * 2);
  const size = Math.max(8, Number(fontSize) || 8);
  return Math.max(10, Math.floor(usable / (size * charWidthEm)));
}

/**
 * Layout headline + detail so every word is drawn. Shrink fonts if the
 * block would overflow the upper readability band (or the lower safe zone).
 */
export function layoutReelOverlayText({
  headline,
  detailText,
  width = 1080,
  height = 1920,
  textPosition = 'upper',
  margin = 80,
} = {}) {
  const cleanHeadline = finishHeadline(headline);
  const cleanDetail = sanitizeDetailText(detailText);
  const upper = textPosition === 'upper';

  let headlineFontSize = 56;
  let detailFontSize = 36;
  const minHeadline = 36;
  const minDetail = 24;
  const brandBottom = margin + 70;
  const solidHeight = Math.round(height * 0.26);
  const fadeHeight = Math.round(height * 0.07);
  const maxBottom = upper
    ? solidHeight + Math.round(fadeHeight * 0.7)
    : height - 420;

  function tryLayout(hSize, dSize) {
    const headlineLineHeight = Math.round(hSize * 1.25);
    const detailLineHeight = Math.round(dSize * 1.28);
    const headlineLines = wrapWords(cleanHeadline, charsPerLine(hSize, width, margin));
    const detailLines = wrapWords(cleanDetail, charsPerLine(dSize, width, margin));
    const gapBetween = 16;
    const headlineTotalHeight = headlineLines.length
      ? (headlineLines.length - 1) * headlineLineHeight + hSize
      : 0;
    const detailTotalHeight = detailLines.length
      ? (detailLines.length - 1) * detailLineHeight + dSize
      : 0;

    let hy;
    if (upper) {
      hy = Math.max(brandBottom + 28, 188);
    } else {
      const targetBottomY = height - 500;
      const totalBlockHeight = headlineTotalHeight
        + (detailLines.length > 0 ? gapBetween + detailTotalHeight : 0);
      hy = targetBottomY - totalBlockHeight + hSize;
    }

    const lastHeadlineBaseline = headlineLines.length
      ? hy + (headlineLines.length - 1) * headlineLineHeight
      : hy;
    let lastBaseline = lastHeadlineBaseline;
    if (detailLines.length) {
      const detailStart = lastHeadlineBaseline + gapBetween + dSize;
      lastBaseline = detailStart + (detailLines.length - 1) * detailLineHeight;
    }
    const visualBottom = lastBaseline + Math.round((detailLines.length ? dSize : hSize) * 0.28);

    return {
      headline: cleanHeadline,
      detailText: cleanDetail,
      headlineLines,
      detailLines,
      headlineFontSize: hSize,
      detailFontSize: dSize,
      headlineLineHeight,
      detailLineHeight,
      hy,
      gapBetween,
      visualBottom,
      maxBottom,
      fits: visualBottom <= maxBottom,
    };
  }

  let layout = tryLayout(headlineFontSize, detailFontSize);
  while (!layout.fits && (headlineFontSize > minHeadline || detailFontSize > minDetail)) {
    if (headlineFontSize > minHeadline) headlineFontSize -= 2;
    if (detailFontSize > minDetail) detailFontSize -= 2;
    layout = tryLayout(headlineFontSize, detailFontSize);
  }
  return layout;
}

export function overlayTextHasEveryWord(source, lines) {
  const expected = String(source || '').split(/\s+/).filter(Boolean).join(' ');
  const drawn = (lines || []).join(' ');
  return expected === drawn;
}
