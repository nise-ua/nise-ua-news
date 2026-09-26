/**
 * Single source for overlay copy bands. Frozen reel numbers live in
 * reel-ukrainian-copy.js; this module names spoken/feed variants and prompt text.
 */

export {
  DETAIL_HARD_MAX,
  DETAIL_WORD_MAX,
  DETAIL_WORD_MIN,
  HEADLINE_WORD_MAX,
  HEADLINE_WORD_MIN,
} from './reel-ukrainian-copy.js';

import {
  DETAIL_WORD_MAX,
  DETAIL_WORD_MIN,
  HEADLINE_WORD_MAX,
  HEADLINE_WORD_MIN,
} from './reel-ukrainian-copy.js';

/** Facebook / Instagram Reels spoken band (matches frozen storyboard default). */
export const FACEBOOK_SPOKEN_WORD_MIN = 8;
export const FACEBOOK_SPOKEN_WORD_MAX = 12;

/** YouTube Shorts spoken band (longer VO). */
export const SHORTS_SPOKEN_WORD_MIN = 18;
export const SHORTS_SPOKEN_WORD_MAX = 30;

/** Instagram carousel clickbait headlines (feed images, not reel overlay). */
export const FEED_HEADLINE_WORD_MIN = 5;
export const FEED_HEADLINE_WORD_MAX = 8;

export function spokenWordBand(format = 'facebook') {
  if (format === 'shorts') {
    return { min: SHORTS_SPOKEN_WORD_MIN, max: SHORTS_SPOKEN_WORD_MAX };
  }
  return { min: FACEBOOK_SPOKEN_WORD_MIN, max: FACEBOOK_SPOKEN_WORD_MAX };
}

export function reelCopyPromptRules(format = 'facebook') {
  const spoken = spokenWordBand(format);
  return {
    headline: `${HEADLINE_WORD_MIN}–${HEADLINE_WORD_MAX}`,
    detail: `${DETAIL_WORD_MIN}–${DETAIL_WORD_MAX}`,
    spoken: `${spoken.min}–${spoken.max}`,
    spokenSeconds: format === 'shorts' ? '12–18' : '4–6',
    formatLabel: format === 'shorts' ? 'YouTube Shorts' : 'Instagram та Facebook Reels',
  };
}

export function criticSystemPrompt(format = 'facebook') {
  const rules = reelCopyPromptRules(format);
  return `Ти — редактор українських Reels/Shorts для NiSeNews.
Перевір on-screen copy кожного shot проти coreFact і sourceLead (перше фактичне речення дайджесту).

Заборонено: однослівні заголовки («Класика.»), саркастичні зачини,
незавершені речення, два речення в detail, тире/крапка з комою, що склеюють дві думки.
Заборонено авторські жарти, риторичні питання, обірвані підрядні («Того, хто наливає каву»),
і рядки, які не називають ту саму подію, що coreFact/sourceLead.

Обов'язково:
- headline: РІВНО одне завершене українське речення, ${rules.headline} слів, підмет + присудок + додаток.
- detailText: РІВНО одне завершене українське речення, ${rules.detail} слів, не повторює headline.
- spokenText: одне завершене українське речення з ТИМ САМИМ фактом, що headline (хто що зробив), ${rules.spoken} слів. Не читай detail, жарти, приклади «Говориш у Keep», «Анонс вийшов наступного дня» без суб'єкта новини.
- Бренди латиницею: Meta, Nvidia, Google, AI, GPT, Llama, Claude, OpenAI.
- Текст має читатися з першого погляду і чіпляти конкретним фактом (хто що зробив).

Відповідай JSON:
{"shots":[{"shot":1,"pass":true,"issues":[],"headline":"...","detailText":"...","spokenText":"..."}]}
Якщо pass=true, повтори поточні рядки. Якщо pass=false, перепиши лише headline/detailText/spokenText.`;
}
