#!/usr/bin/env node

/**
 * Video Pipeline — Storyboard Generator
 *
 * Takes digest text → generates a structured JSON video storyboard (shots, prompts, durations) via [PERSON_NAME]/OpenAI.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init' });

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function generateStoryboard(digestText) {
  log('Generating video storyboard from digest text...');

  const systemPrompt = `Ти — режисер Instagram та Facebook Reels для новинного дайджесту.
На основі дайджесту створи розкадровку (storyboard) для КОЖНОЇ ГОЛОВНОЇ НОВИНИ (блоків дайджесту).
Всього має бути 5 шотів (по одному на кожну головну новину).

Для кожного кадру (shot) вказати:
1. shot — номер (1, 2, 3, 4, 5)
2. headline — змістовний headline (українською, 6-10 слів), який самостійно пояснює головний факт новини. Не копіюй перші слова абзацу і не використовуй розмиті фрази на кшталт «ШІ змінює все».
3. spokenText — коротке ЗАВЕРШЕНЕ речення для диктора (українською, 8-12 слів, приблизно 4-6 секунд). Обов'язково закінчуй крапкою/знаком оклику.
4. detailText — РІВНО 1 КОРОТКЕ ПОВНЕ РЕЧЕННЯ (8-12 слів). Головна конкретна деталь новини. Обов'язково закінчуй крапкою. КРИТИЧНО: РІВНО ОДНЕ РЕЧЕННЯ, ніколи не більше, і ніколи не незавершене!
5. textPosition — "upper" або "lower": де розмістити текст, щоб не перекрити головний об'єкт фону.
6. prompt — промпт для генерації фону (АНГЛІЙСЬКОЮ). КРИТИЧНО: промпт ОБОВ'ЯЗКОВО має включати конкретні сутності з новини (компанії, людей, технології, події, об'єкти). НЕ використовуй абстрактні фрази типу "AI background" або "news background" — описуй КОНКРЕТНИЙ візуальний контент новини.

КРИТИЧНО для prompt — ПЕРЕД тим як писати prompt, з'ясуй СЕНС блоку новини:
- Що САМЕ сталося? Хто? Що? Де? Коли? (конкретна подія / факт, а не загальність)
- НЕ вибирай одне символічне/метафоричне слово з новини (напр. "revolution", "crisis", "change", "future", "war", "peace") і не будуй зображення навколо нього — це створює невірне зображення
- Замість цього: покажи РЕАЛЬНИХ людей, компанії, продукти, місця, технології, документи або події, про які йде мова у цьому саме блоці новин. Зображення повинно відтворювати СЕНС блоку, а не одне слово з нього
- Додай контекст: що саме роблять ці люди/об'єкти — конкретна дія, стан чи подія
- Описуй КОНКРЕТНУ сцену/об'єкт з новини (напр. "SpaceX Falcon 9 rocket launching", "OpenAI office with AI researchers working at computers", "Ukrainian developer holding ESP32 microcontroller on desk")
- Покажи головний об'єкт у верхній або нижній частині кадру, залишивши чисту negative space для тексту
- Додавай: "professional news photography, cinematic lighting, 9:16 vertical composition"
- ЗАБОРОНЕНО: будь-який текст, логотипи, слова, букви, цифри на зображенні

Відповідай в JSON форматі:

{
  "shots": [
    { "shot": 1, "headline": "...", "spokenText": "...", "detailText": "...", "textPosition": "upper", "prompt": "..." },
     { "shot": 2, "headline": "...", "spokenText": "...", "detailText": "...", "textPosition": "lower", "prompt": "..." },
     { "shot": 3, "headline": "...", "spokenText": "...", "detailText": "...", "textPosition": "upper", "prompt": "..." },
     { "shot": 4, "headline": "...", "spokenText": "...", "detailText": "...", "textPosition": "lower", "prompt": "..." },
     { "shot": 5, "headline": "...", "spokenText": "...", "detailText": "...", "textPosition": "upper", "prompt": "..." }
  ]
}`;

  let text;
  if (process.env.OPENAI_API_KEY) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Дайджест:\n${digestText.slice(0, 3000)}` }
      ],
      response_format: { type: 'json_object' }
    });
    text = res.choices[0].message.content;
  } else if (process.env.ANTHROPIC_API_KEY) {
    const res = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `${systemPrompt}\n\nДайджест:\n${digestText.slice(0, 3000)}` }]
    });
    text = res.content[0].text;
  } else {
    throw new Error('No API key found for storyboard generation (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse storyboard JSON');

  const storyboard = JSON.parse(jsonMatch[0]);
  log(`Generated ${storyboard.shots.length} shots storyboard.`);
  return storyboard;
}