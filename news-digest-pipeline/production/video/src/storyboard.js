#!/usr/bin/env node

/**
 * Video Pipeline — Storyboard Generator
 *
 * Takes digest text → generates a structured JSON video storyboard (shots, prompts, durations) via Claude/OpenAI.
 */

import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { VISUAL_GROUNDING_RULES, groundVisualVariant } from '../../lib/visual-grounding.js';
import { parseDigestItems } from '../../lib/digest.js';
import { log, projectRoot } from '../../lib/logging.js';
import { ensureUkrainianOnScreenCopy } from '../../lib/reel-ukrainian-copy.js';
import { reviewReelStoryboard } from '../../lib/reel-copy-review.js';
import { reelCopyPromptRules } from '../../lib/reel-copy-contract.js';
import { completeJsonText } from '../../lib/llm-client.js';

const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

export async function generateStoryboard(digestText, format = 'facebook') {
  log('Generating video storyboard from digest text...');

  const articles = parseDigestItems(digestText);
  log(`Parsed ${articles.length} digest blocks for storyboard.`);

  const copyRules = reelCopyPromptRules(format);
  const systemPrompt = `Ти — режисер ${copyRules.formatLabel} для новинного дайджесту.
На вхід — ОКРЕМІ блоки новин. Створи РІВНО ОДИН shot для КОЖНОГО блоку.
Кількість shot визначається тільки кількістю блоків у цьому дайджесті; не
додавай, не об'єднуй і не вигадуй блоки.

Для кожного кадру (shot) вказати:
1. shot — номер (1, 2, 3...)
2. coreFact — нейтральний факт англійською (хто/що/що сталося), БЕЗ сарказму автора
3. entities — масив конкретних назв (компанії, продукти, технології, місця)
4. newsTone — "positive" | "neutral" | "negative" (лише з coreFact, не з сарказму автора)
5. visualSubject — 1 конкретна сцена англійською з цих сутностей і дії
6. headline — змістовний ПОВНИЙ headline ТІЛЬКИ УКРАЇНСЬКОЮ (${copyRules.headline} слів), який самостійно пояснює головний факт новини. ЖОРСТКИЙ КОНТРОЛЬ: повна думка з підметом, присудком і потрібним додатком. Обов'язково закінчуй крапкою або «?». НІКОЛИ не обривай на комі, тире, сполучнику чи голому дієслові без об'єкта («а тепер ріже.» — ЗАБОРОНЕНО; пиши «а тепер ріже рідкісні книжки.»). Не копіюй саркастичні зачини («Знову революція?», «Оце так історія»). Не використовуй розмиті фрази на кшталт «ШІ змінює все».
7. spokenText — ${format === 'shorts' ? `ТІЛЬКИ УКРАЇНСЬКОЮ (${copyRules.spoken} слів), повне речення, ${copyRules.spokenSeconds} секунд. Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.` : `коротке ЗАВЕРШЕНЕ речення ТІЛЬКИ УКРАЇНСЬКОЮ для диктора (${copyRules.spoken} слів, приблизно ${copyRules.spokenSeconds} секунд). Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.`}
8. detailText — РІВНО 1 КОРОТКЕ ПОВНЕ РЕЧЕННЯ ТІЛЬКИ УКРАЇНСЬКОЮ, ЖОРСТКО 8-12 слів. Головна конкретна деталь новини, не повторюй headline. Закінчуй крапкою. НІКОЛИ не пиши два речення і не роздувай до абзацу. НІКОЛИ не обривай на «і ледь не дав ще один шанс» без того, на що шанс. НІКОЛИ англійською; НІКОЛИ не копіюй coreFact / visualSubject / prompt у detailText. Англійські назви й абревіатури всередині речення не перекладай і не транслітеруй: пиши Nvidia, Google, AI, GPT саме латиницею.
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

  const text = await completeJsonText(systemPrompt, userPrompt, {
    maxTokens: 4096,
    title: 'NiSeNews reel storyboard',
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse storyboard JSON');

  const storyboard = JSON.parse(jsonMatch[0]);
  storyboard.shots = (storyboard.shots || []).map((shot, i) => {
    const grounded = groundVisualVariant(shot, i);
    if (grounded.prompt !== shot.prompt) {
      log(`  Shot ${i + 1}: rebuilt prompt from coreFact/entities (sarcasm/abstract rejected)`);
    }
    const localized = ensureUkrainianOnScreenCopy({
      ...grounded,
      sourceText: shot.sourceText || articles[i]?.text || '',
    });
    if (localized.detailText !== String(shot.detailText || '').trim()) {
      log(`  Shot ${i + 1}: detailText localized to Ukrainian (was non-UA or empty)`);
    }
    log(`  Shot ${i + 1} fact: ${(localized.coreFact || '').slice(0, 80)}`);
    log(`  Shot ${i + 1} tone: ${localized.newsTone || 'neutral'}`);
    log(`  Shot ${i + 1} detail: ${(localized.detailText || '').slice(0, 80)}`);
    log(`  Shot ${i + 1} prompt: ${(localized.prompt || '').slice(0, 100)}`);
    return localized;
  });
  const reviewed = await reviewReelStoryboard(storyboard, { log, format });
  log(`Generated ${reviewed.shots.length} shots storyboard.`);
  return reviewed;
}
