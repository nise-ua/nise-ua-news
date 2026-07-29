#!/usr/bin/env node

/**
 * Headline Generation Pipeline
 *
 * Digest → rate each news (0-10) → select hottest →
 * transform to clickbait headline → summarize others →
 * compile final text construction
 *
 * Usage:
 *   node production/image/src/headlines.js latest
 *   node production/image/src/headlines.js <digest-id>
 */

import Anthropic from '@anthropic-ai/sdk';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const SERVER = 'https://YOUR_DOMAIN';
const MODEL = 'claude-opus-4-20250514';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// --- API ---

async function getDigestContent(digestId) {
  const url = digestId === 'latest'
    ? `${SERVER}/api/digests/latest/text`
    : `${SERVER}/api/digests/${digestId}/text`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to get digest: ${res.status}`);
  return await res.text();
}

/**
 * Parse digest into individual news items.
 * Each item is numbered: "1. text\nhttps://..."
 */
function parseNewsItems(digestText) {
  // Cut off everything after the footer/disclaimer
  // Footer starts with emoji 🤖 or "причини підписатися" or hashtags block
  let cleanText = digestText;
  const footerPatterns = [
    /\n🤖[\s\S]*$/,
  ];
  for (const pattern of footerPatterns) {
    cleanText = cleanText.replace(pattern, '');
  }

  const items = [];

  // Match numbered items: "N. text" possibly followed by URL on next line
  // Each item ends when the next numbered item begins or text ends
  const regex = /(\d+)\.\s+([\s\S]*?)(?=\n\d+\.\s|\n🤖|$)/g;
  let match;

  while ((match = regex.exec(cleanText)) !== null) {
    const num = parseInt(match[1]);
    let text = match[2].trim();

    // Remove URLs from text (they go in separate field)
    const urlMatch = text.match(/(https?:\/\/\S+)/);
    text = text.replace(/https?:\/\/\S+/g, '').trim();

    // Skip short items, footers, and non-news content
    if (text.length > 50 &&
        !text.includes('підписатися') &&
        !text.includes('коментувати') &&
        !text.includes('Розмістіть мій блог') &&
        !text.includes('Відпишіться')) {
      items.push({
        num,
        text,
        url: urlMatch ? urlMatch[1] : null,
      });
    }
  }

  return items;
}

// --- Step 1: Rate each news by clickbait potential (0-10) ---

async function rateNews(client, items) {
  log(`Step 1: Rating ${items.length} news items...`);

  const itemsList = items.map((item, i) =>
    `[${i}] ${item.text.substring(0, 300)}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Ти — редактор клікбейтного новинного каналу. Оціни кожну новину за шкалою клікбейтності від 0 до 10.

Критерії:
- 10: шокуючий факт, цифри, які викликають WOW, драма, конфлікт, неочікуваний поворот
- 7-9: сильна новина з тою деталлю, що чіпляє
- 4-6: цікаво, але не чіпляє за живе
- 0-3: нудно, абстрактно, без конкретики

Поверни ТІЛЬКИ JSON масив у форматі: [{"index": 0, "score": 8, "reason": "чому"}, ...]

Новини:
${itemsList}`
    }],
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Failed to parse ratings JSON');

  const ratings = JSON.parse(jsonMatch[0]);
  return ratings;
}

// --- Step 2: Select the hottest news ---

function selectHottest(items, ratings) {
  log('Step 2: Selecting hottest news...');

  // Sort by score descending
  const sorted = [...ratings].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  log(`  Winner: [${best.index}] score=${best.score} — ${best.reason}`);
  log(`  Text: ${items[best.index].text.substring(0, 100)}...`);

  return {
    hottest: items[best.index],
    hottestIndex: best.index,
    others: items.filter((_, i) => i !== best.index),
    ratings: sorted,
  };
}

// --- Step 3: Transform hottest into clickbait headline ---

async function createHeadline(client, newsItem) {
  log('Step 3: Creating clickbait headline...');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Перетворю цю новину в клікбейтний заголовок для Instagram.

ПРАВИЛА:
- Максимум 8-10 слів
- Українською мовою
- Має бути ЗРОЗУМІЛИЙ без контексту — будь-яка людина має зрозуміти, про що йдеться
- Обов'язково вказати ХТО (суб'єкт) і ЩО сталося (предикат)
- Конкретика: цифри, імена, факти — не абстракції
- Провокація, але НЕ брехня
- Формат: твердження, не питання
- НЕ використовувати три крапки

ПРИКЛАДИ ХОРОШИХ:
"Stack Overflow мертвий. ШІ забрав усе"
"Голова IgniteTech звільнив 80%. Не шкодує"
"23 роки, без диплома, $175К на рік"
"Anthropic: програмісти не потрібні через рік"

ПРИКЛАДИ ПОГАНИХ (не роби так):
"Ринок обвалився. Що далі?" — немає конкретики, хто обвалився?
"Звільнена заробила мільйони" — хто? звідки?
"ШІ змінює все" — порожня фраза

Новина:
${newsItem.text}

Поверни ТІЛЬКИ заголовок, без лапок, без пояснень.`
    }],
  });

  const headline = response.content[0]?.text?.trim() || '';
  log(`  Headline: "${headline}"`);
  return headline;
}

// --- Step 4: Each other news → one phrase "Сталося це" ---

async function summarizeOthers(client, otherItems) {
  log(`Step 4: Summarizing ${otherItems.length} other news...`);

  const itemsList = otherItems.map((item, i) =>
    `[${i}] ${item.text.substring(0, 300)}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Стисни кожну новину в ОДНУ коротку фразу (5-8 слів).
Формат: "Хто/що зробив що" — без вступів, без контексту, просто факт.

ПРИКЛАДИ:
"OpenAI випустила підписку за $100"
"Електрики заробляють $175К без диплома"
"Роботів поставили 53 тисячі за рік"

Поверни JSON масив рядків: ["фраза1", "фраза2", ...]

Новини:
${itemsList}`
    }],
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Failed to parse summaries JSON');

  const summaries = JSON.parse(jsonMatch[0]);
  summaries.forEach((s, i) => log(`  ${i + 1}. ${s}`));
  return summaries;
}

// --- Step 5: Compile final text construction ---

function compileHeadlineText(headline, summaries) {
  log('Step 5: Compiling final text...');

  // Main headline is the key phrase
  // "а також" + first 3-4 other summaries
  const otherPhrases = summaries.slice(0, 4).join(', ');
  const compiled = `${headline}\n\nА також: ${otherPhrases}`;

  log(`\n=== FINAL RESULT ===`);
  log(`HEADLINE: ${headline}`);
  log(`SUBTEXT: А також: ${otherPhrases}`);
  log(`FULL: ${compiled}`);
  log(`====================\n`);

  return {
    headline,        // Main clickbait headline (for large text on image)
    subtext: `А також: ${otherPhrases}`,  // Secondary text (smaller, below)
    full: compiled,  // Full combined text
    summaries,       // All summaries array
  };
}

// --- Main ---

export async function generateHeadlines(digestText) {
  const client = new Anthropic();

  // Parse news items
  const items = parseNewsItems(digestText);
  log(`Parsed ${items.length} news items from digest`);

  if (items.length === 0) {
    throw new Error('No news items found in digest');
  }

  // Step 1: Rate
  const ratings = await rateNews(client, items);

  // Step 2: Select hottest
  const { hottest, hottestIndex, others } = selectHottest(items, ratings);

  // Step 3: Headline for hottest
  const headline = await createHeadline(client, hottest);

  // Step 4: Summarize others
  const summaries = await summarizeOthers(client, others);

  // Step 5: Compile
  const result = compileHeadlineText(headline, summaries);

  return result;
}

// --- CLI entry point ---

async function main() {
  const args = process.argv.slice(2);

  if (!args[0]) {
    console.error('Usage: node production/image/src/headlines.js <digest-id|latest>');
    process.exit(1);
  }

  log(`Fetching digest: ${args[0]}`);
  const digestText = await getDigestContent(args[0]);
  log(`Digest: ${digestText.length} chars`);

  const result = await generateHeadlines(digestText);

  // Output as JSON for piping
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
