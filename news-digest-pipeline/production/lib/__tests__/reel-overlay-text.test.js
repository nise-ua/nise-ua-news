import { describe, expect, it } from 'vitest';
import {
  finishHeadline,
  layoutReelOverlayText,
  overlayTextHasEveryWord,
  sanitizeDetailText,
  wrapWords,
} from '../reel-overlay-text.js';

describe('wrapWords', () => {
  it('keeps every word when the sentence needs more than three lines', () => {
    const text = 'Claude забув власний довідник, півроку заспокоював співробітника, що запізнення — це нормально, і ледь не дав ще один шанс.';
    const lines = wrapWords(text, 40);
    expect(lines.length).toBeGreaterThan(3);
    expect(overlayTextHasEveryWord(text, lines)).toBe(true);
    expect(lines.join(' ')).toContain('ще один шанс.');
  });
});

describe('finishHeadline', () => {
  it('turns a trailing comma into a finished sentence', () => {
    expect(finishHeadline('Anthropic вирішила, що нам бракувало драм у житті,')).toBe(
      'Anthropic вирішила, що нам бракувало драм у житті.',
    );
  });
});

describe('sanitizeDetailText', () => {
  it('keeps the first complete sentence', () => {
    expect(sanitizeDetailText('Перше речення. Друге речення.')).toBe('Перше речення.');
  });
});

describe('layoutReelOverlayText', () => {
  it('draws a long complete detail instead of slicing at three lines', () => {
    const headline = 'ШІ нарешті звільнив людину';
    const detailText = 'Claude забув власний довідник, півроку заспокоював співробітника, що запізнення — це нормально, і ледь не дав ще один шанс.';
    const layout = layoutReelOverlayText({ headline, detailText, textPosition: 'upper' });
    expect(overlayTextHasEveryWord(layout.headline, layout.headlineLines)).toBe(true);
    expect(overlayTextHasEveryWord(layout.detailText, layout.detailLines)).toBe(true);
    expect(layout.detailLines.join(' ')).toMatch(/шанс\.$/);
    expect(layout.headlineLines.join(' ')).toMatch(/\.$/);
  });

  it('keeps a long headline intact rather than cutting on a comma', () => {
    const headline = 'Anthropic вирішила, що нам бракувало драм у житті, тож кожен випадковий вибір слова тепер не випадковий';
    const layout = layoutReelOverlayText({
      headline,
      detailText: 'Тепер кожен вибір слова — прихований QR-код для власників ключа.',
      textPosition: 'upper',
    });
    expect(overlayTextHasEveryWord(layout.headline, layout.headlineLines)).toBe(true);
    expect(layout.headlineLines.join(' ')).toContain('не випадковий.');
  });
});
