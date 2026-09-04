/**
 * Facebook digest cover: pick the single most scroll-stopping news block
 * and ground a text-free 4:5 image prompt. No overlay, no CTA, no headline
 * on the picture — the digest text is the Facebook caption.
 */

import { parseDigestArticles } from './digest.js';
import {
  VISUAL_GROUNDING_RULES,
  groundVisualVariant,
  inferNewsToneFromFact,
} from './visual-grounding.js';

export const COVER_ASPECT = '4:5';

export const COVER_SELECTION_SYSTEM_PROMPT = `Ти обираєш ОДНУ новину з українського дайджесту для обкладинки Facebook-поста.

Мета: зупинити скрол у стрічці. Картинка БЕЗ будь-якого тексту — підпис поста буде повним дайджестом.

Критерії вибору (за пріоритетом):
1. Найсильніший візуальний факт: несподіванка, масштаб, конфлікт, імена/продукти, конкретна сцена.
2. Сцену можна сфотографувати без UI, логотипів, екранів і написів.
3. Ігноруй авторський сарказм («революція?», «історія», «ага») — обирай факт, не тон.
4. Не обирай абстрактну «новину про ШІ взагалі», якщо є конкретніша дія.
5. visualSubject і prompt мають бути ЯСКРАВИМИ: насичений колір, денне або золоте світло. Заборонено сірі серверні коридори, charcoal, desaturated, gloomy documentary.

Для обраного блоку заповни:
- articleIndex — номер блоку з входу (1, 2, 3...)
- coreFact — нейтральний факт англійською (хто/що/що сталося), БЕЗ сарказму
- entities — масив конкретних назв (компанії, продукти, технології, місця)
- newsTone — "positive" | "neutral" | "negative" лише з coreFact
- visualSubject — 1 конкретна сцена англійською з цих сутностей і дії
- prompt — англійський промпт фону з visualSubject; 4:5 portrait composition
- pickReason — одне коротке речення українською, чому саме цей блок

${VISUAL_GROUNDING_RULES}

ЗАБОРОНЕНО: будь-який текст, літери, цифри, слова, логотипи, UI, headlines на зображенні.
Не пиши headline/detailText — їх не буде на картинці.

Відповідай ТІЛЬКИ JSON:
{
  "articleIndex": 1,
  "coreFact": "...",
  "entities": ["...", "..."],
  "newsTone": "positive|neutral|negative",
  "visualSubject": "...",
  "prompt": "...",
  "pickReason": "..."
}`;

export function coverSelectionUserPrompt(articles) {
  const blocks = articles.map((article, i) => (
    `--- ARTICLE ${i + 1} ---\n${article.text}${article.url ? `\nURL: ${article.url}` : ''}`
  )).join('\n\n');
  return `Обери РІВНО ОДИН блок як обкладинку Facebook. Ігноруй сарказм автора; візуал = факт новини.\n\n${blocks}`;
}

function firstSentence(text) {
  const source = String(text || '').trim();
  const match = source.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : source).trim();
}

export function fallbackCoverFromArticles(articles) {
  const article = articles[0];
  if (!article?.text) {
    throw new Error('Digest has no news blocks to illustrate');
  }
  const coreFact = firstSentence(article.text);
  return {
    articleIndex: 1,
    sourceText: article.text,
    url: article.url || '',
    coreFact,
    entities: [],
    newsTone: inferNewsToneFromFact(coreFact),
    visualSubject: coreFact,
    prompt: '',
    pickReason: 'Провідний блок дайджесту (запасний вибір без LLM).',
    fallback: true,
  };
}

export function parseCoverSelection(raw, articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error('Digest has no news blocks to illustrate');
  }

  const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Cover selection did not return JSON');
  }

  let data;
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Cover selection JSON is invalid');
  }

  const rawIndex = Number(data.articleIndex ?? data.index ?? data.shot);
  const zeroBased = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) - 1 : 0;
  const index = Math.min(Math.max(0, zeroBased), articles.length - 1);
  const article = articles[index];
  const coreFact = String(data.coreFact || '').trim() || firstSentence(article.text);
  const visualSubject = String(data.visualSubject || '').trim() || coreFact;

  return {
    articleIndex: index + 1,
    sourceText: article.text,
    url: article.url || '',
    coreFact,
    entities: Array.isArray(data.entities)
      ? data.entities.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    newsTone: data.newsTone,
    visualSubject,
    prompt: String(data.prompt || '').trim(),
    pickReason: String(data.pickReason || '').trim(),
    fallback: false,
  };
}

export function groundDigestCover(selection) {
  const grounded = groundVisualVariant({ ...selection, look: 'cover' }, 0);
  return {
    ...grounded,
    articleIndex: selection.articleIndex,
    sourceText: selection.sourceText,
    url: selection.url,
    pickReason: selection.pickReason,
    fallback: Boolean(selection.fallback),
    aspect: COVER_ASPECT,
  };
}

/**
 * Pick and ground the Facebook cover subject.
 * `completeJson(systemPrompt, userPrompt)` must return JSON text.
 * If omitted or it throws, falls back to the first digest block.
 */
export async function selectDigestCover(digestText, { completeJson, log = () => {} } = {}) {
  const articles = parseDigestArticles(digestText);
  if (articles.length === 0) {
    throw new Error('Digest has no news blocks to illustrate');
  }

  let selection;
  if (typeof completeJson === 'function') {
    try {
      const raw = await completeJson(
        COVER_SELECTION_SYSTEM_PROMPT,
        coverSelectionUserPrompt(articles),
      );
      selection = parseCoverSelection(raw, articles);
    } catch (err) {
      log(`Cover selection LLM failed, using lead story: ${err.message}`);
      selection = fallbackCoverFromArticles(articles);
    }
  } else {
    selection = fallbackCoverFromArticles(articles);
  }

  const grounded = groundDigestCover(selection);
  log(`Cover pick #${grounded.articleIndex}: ${(grounded.coreFact || '').slice(0, 80)}`);
  log(`Cover reason: ${(grounded.pickReason || '').slice(0, 120)}`);
  return grounded;
}

export function imagePayloadToBuffer(urlOrDataUri) {
  if (!urlOrDataUri) throw new Error('Image URL or data URI is empty');
  const value = String(urlOrDataUri);
  if (value.startsWith('data:')) {
    const encoded = value.split(',')[1] || '';
    return Buffer.from(encoded, 'base64');
  }
  return null;
}

export function digestCoverFilename(timestamp = new Date()) {
  const stamp = timestamp.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `digest-cover_${stamp}.png`;
}
