#!/usr/bin/env node

/**
 * Video Pipeline — Storyboard Generator
 *
 * Takes digest text → generates a structured JSON video storyboard (shots, prompts, durations) via Claude/OpenAI.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { VISUAL_GROUNDING_RULES, groundVisualVariant } from '../../lib/visual-grounding.js';
import { parseDigestItems } from '../../lib/digest.js';
import { log, projectRoot } from '../../lib/logging.js';
import { ensureUkrainianOnScreenCopy } from '../../lib/reel-ukrainian-copy.js';

const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init' });

export async function generateStoryboard(digestText, format = 'facebook') {
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
6. headline — змістовний headline ТІЛЬКИ УКРАЇНСЬКОЮ (6-10 слів), який самостійно пояснює головний факт новини. Не копіюй саркастичні зачини («Знову революція?», «Оце так історія»). Не використовуй розмиті фрази на кшталт «ШІ змінює все».
7. spokenText — ${format === 'shorts' ? `ТІЛЬКИ УКРАЇНСЬКОЮ (18-30 слів), повне речення, 12-18 секунд. Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.` : `коротке ЗАВЕРШЕНЕ речення ТІЛЬКИ УКРАЇНСЬКОЮ для диктора (8-12 слів, приблизно 4-6 секунд). Обов\'язково закінчуй крапкою/знаком оклику. Це має бути ФАКТ, не сарказм. Назви брендів, продуктів і абревіатури ЗАВЖДИ залишай англійськими: Nvidia, Google, AI, GPT, не перекладай і не транслітеруй їх кирилицею.`}
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

  let text;
  const llmVendor = String(process.env.LLM_VENDOR || '').trim().toLowerCase();
  if (llmVendor === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY missing in .env');
    }
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
        'X-Title': 'NiSeNews reel storyboard',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || `OpenRouter storyboard request failed (${res.status})`);
    }
    text = payload?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenRouter storyboard response did not contain text content');
  } else if (process.env.OPENAI_API_KEY) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });
    text = res.choices[0].message.content;
  } else if (process.env.ANTHROPIC_API_KEY) {
    const res = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }]
    });
    text = res.content[0].text;
  } else {
    throw new Error('No API key found for storyboard generation (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse storyboard JSON');

  const storyboard = JSON.parse(jsonMatch[0]);
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
