#!/usr/bin/env node

/**
 * Video Pipeline — Storyboard Generator
 *
 * Takes digest text → generates a structured JSON video storyboard (shots, prompts, durations) via configured LLM vendor.
 */

import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { VISUAL_GROUNDING_RULES, groundVisualVariant } from '../../lib/visual-grounding.js';
import { parseDigestItems } from '../../lib/digest.js';
import { log, projectRoot } from '../../lib/logging.js';
import { ensureUkrainianOnScreenCopy, normalizeHeadline } from '../../lib/reel-ukrainian-copy.js';
import { callLlmJson } from '../../lib/llm-backends.js';

const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const HEADLINE_MAX_CHARS = 44;

/**
 * Ask the configured language model to compress every headline after the
 * storyboard is built. This also repairs fallback storyboards without
 * embedding story-specific phrases in code.
 */
export async function refineStoryboardHeadlines(storyboard, format = 'facebook', { fetchFn } = {}) {
  const shots = Array.isArray(storyboard?.shots) ? storyboard.shots : [];
  if (!shots.length) return storyboard;

  const systemPrompt = `Ти — редактор коротких заголовків для ${format === 'shorts' ? 'YouTube Shorts' : 'Facebook Reels'}.
Створи рівно один headline для кожного shot у тому самому порядку.
Кожен headline:
- ТІЛЬКИ УКРАЇНСЬКОЮ, але бренди й абревіатури залишай латиницею.
- РІВНО 3-6 слів і максимум ${HEADLINE_MAX_CHARS} символів.
- Є ПОВНІСТЮ ЗАВЕРШЕНОЮ самостійною фактичною фразою з підметом і присудком або цілісним словосполученням.
- Повністю поміщається максимум у ДВА рядки великого тексту.
- КАТЕГОРИЧНО ЗАБОРОНЕНО закінчувати заголовок займенником («своєї», «її», «його»), прийменником («для», «про», «в»), сполучником («що», «і») або незавершеним дієсловом.
- Не містить авторського сарказму, цитат, вступів «Ось», «О,», «Отже», «Ну от» чи оцінок.
НІКОЛИ не обрізай речення на півслові. Якщо не поміщається, ПЕРЕФРАЗУЙ коротко сам факт (наприклад: «Google оновила модель Gemini»).
Відповідай лише JSON: {"headlines":["..."]}`;

  const userPrompt = JSON.stringify(shots.map((shot, index) => ({
    shot: index + 1,
    coreFact: shot.coreFact || '',
    entities: shot.entities || [],
    sourceText: shot.sourceText || '',
    spokenText: shot.spokenText || '',
    currentHeadline: shot.headline || '',
  })));

  const parsed = await callLlmJson({
    system: systemPrompt,
    user: userPrompt,
    title: 'NiSeNews headline refinement',
    maxTokens: 4096,
    fetchFn,
  }, 'headline refinement');

  const refined = parsed?.headlines;
  if (!Array.isArray(refined) || refined.length !== shots.length) {
    throw new Error(`Headline refinement returned ${refined?.length || 0}/${shots.length} headlines`);
  }

  const headlines = refined.map((headline, index) => {
    const value = normalizeHeadline(headline);
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    if (!value || value.length > HEADLINE_MAX_CHARS || wordCount < 3 || wordCount > 6) {
      throw new Error(`Headline ${index + 1} violates the two-row limit: "${value}"`);
    }
    return value;
  });

  return {
    ...storyboard,
    shots: shots.map((shot, index) => ({ ...shot, headline: headlines[index] })),
  };
}

export async function generateStoryboard(digestText, format = 'facebook', { fetchFn } = {}) {
  log('Generating video storyboard from digest text...');

  const articles = parseDigestItems(digestText);
  log(`Parsed ${articles.length} digest blocks for storyboard.`);

  const systemPrompt = `Ти — режисер ${format === 'shorts' ? 'YouTube Shorts' : 'Instagram та Facebook Reels'} для новинного дайджесту.
На вхід — ОКРЕМІ блоки новин. Створи РІВНО ОДИН shot для КОЖНОГО блоку.
Кількість shot визначається тільки кількістю блоків у цьому дайджесті; не
додавай, не об'єднуй і не вигадуй блоки.

Для кожного кадру (shot) вказати:
1. shot — номер (1, 2, 3...)
2. coreFact — нейтральний факт англійською (хто/що/що сталося), БЕЗ сарказму автора
3. entities — масив конкретних назв (компанії, продукти, технології, місця)
4. newsTone — "positive" | "neutral" | "negative" (лише з coreFact, не з сарказму автора)
5. visualSubject — 1 конкретна сцена англійською з цих сутностей і дії
6. headline — змістовний headline ТІЛЬКИ УКРАЇНСЬКОЮ (3-6 коротких слів, максимум 44 символи), ПОВНІСТЮ ЗАВЕРШЕНА самостійна фактична фраза максимум у два рядки. КАТЕГОРИЧНО ЗАБОРОНЕНО обривати фразу на півслові або закінчувати заголовок займенником («своєї», «її», «його»), прийменником, сполучником чи комою. Не продовжуй думку в detailText. Не копіюй саркастичні зачини («Знову революція?», «Оце так історія», «О, Google»). Не використовуй розмиті фрази на кшталт «ШІ змінює все». Якщо не поміщається, перефразуй факт стисло (наприклад: «Google оновила модель Gemini»).
7. spokenText — ${format === 'shorts' ? `ТІЛЬКИ УКРАЇНСЬКОЮ (18-30 слів), одне плавне повне речення для природної дикторської подачі, 12-18 секунд. Починай одразу з факту, без «це новина» та повтору headline. Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.` : `ТІЛЬКИ УКРАЇНСЬКОЮ, одне плавне завершене речення для природної дикторської подачі (10-16 слів, приблизно 5-7 секунд). Починай одразу з факту, без «це новина» та повтору headline. Використовуй простий порядок слів і одну головну деталь, щоб фраза легко слухалася. Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.`}
8. detailText — РІВНО 1 КОРОТКЕ ПОВНЕ РЕЧЕННЯ ТІЛЬКИ УКРАЇНСЬКОЮ (8-12 слів). Головна конкретна деталь новини. Обов'язково закінчуй крапкою. КРИТИЧНО: РІВНО ОДНЕ РЕЧЕННЯ; НІКОЛИ англійською; НІКОЛИ не копіюй coreFact / visualSubject / prompt у detailText. Англійські назви й абревіатури всередині речення не перекладай і не транслітеруй: пиши Nvidia, Google, AI, GPT саме латиницею.
9. textPosition — завжди "upper": текст розміщується у верхніх 25% кадру, нижче брендингу.
10. prompt — англійський промпт фону, ОБОВ'ЯЗКОВО з visualSubject. Додавай: "professional news photography, cinematic lighting, 9:16 vertical composition"

МОВИ (жорстко):
- Українською: headline, spokenText, detailText (але назви брендів, продуктів і абревіатури завжди залишай латиницею: Nvidia, Google, AI, GPT).
- Англійською: coreFact, visualSubject, prompt, entities.
- Якщо detailText англійською — це ПОМИЛКА. Перепиши detailText українською перед відповіддю.

${VISUAL_GROUNDING_RULES}

Відповідай в JSON форматі:

{
  "shots": [
    {
      "shot": 1,
      "coreFact": "...",
      "entities": ["...", "..."],
      "newsTone": "positive|neutral|negative",
      "visualSubject": "...",
      "headline": "...",
      "spokenText": "...",
      "detailText": "...",
      "textPosition": "upper",
      "prompt": "..."
    }
  ]
}`;

  const articleBlocks = articles.length > 0
    ? articles.map((a, i) => `--- ARTICLE ${i + 1} ---\n${a.text}${a.url ? `\nURL: ${a.url}` : ''}`).join('\n\n')
    : digestText.slice(0, 3000);
  const userPrompt = `Опрацюй КОЖЕН блок окремо. Ігноруй авторський сарказм; візуал і spokenText = факт новини.\n\n${articleBlocks}`;

  const storyboard = await callLlmJson({
    system: systemPrompt,
    user: userPrompt,
    title: 'NiSeNews reel storyboard',
    maxTokens: 16384,
    fetchFn,
  }, 'storyboard');

  storyboard.shots = (storyboard.shots || []).map((shot, i) => {
    const grounded = groundVisualVariant(shot, i);
    if (grounded.prompt !== shot.prompt) {
      log(`  Shot ${i + 1}: rebuilt prompt from coreFact/entities (sarcasm/abstract rejected)`);
    }
    const localized = ensureUkrainianOnScreenCopy(grounded);
    if (localized.detailText !== String(shot.detailText || '').trim()) {
      log(`  Shot ${i + 1}: detailText localized to Ukrainian (was non-UA or empty)`);
    }
    log(`  Shot ${i + 1} fact: ${(localized.coreFact || '').slice(0, 80)}`);
    log(`  Shot ${i + 1} tone: ${localized.newsTone || 'neutral'}`);
    log(`  Shot ${i + 1} detail: ${(localized.detailText || '').slice(0, 80)}`);
    log(`  Shot ${i + 1} prompt: ${(localized.prompt || '').slice(0, 100)}`);
    return localized;
  });
  log(`Generated ${storyboard.shots.length} shots storyboard.`);
  return storyboard;
}

// Direct execution
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const digestArg = process.argv[2] || 'latest';
  const formatArg = process.argv[3] || 'facebook';

  const { getDigestContent } = await import('../../lib/digest.js');
  const digestText = await getDigestContent(digestArg);
  generateStoryboard(digestText, formatArg)
    .then(async (sb) => {
      const refined = await refineStoryboardHeadlines(sb, formatArg);
      console.log(JSON.stringify(refined, null, 2));
    })
    .catch((err) => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
}
