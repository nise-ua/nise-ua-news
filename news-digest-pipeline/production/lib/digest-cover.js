/**
 * Facebook digest cover: pick the single most scroll-stopping news block
 * and ground a text-free 4:5 image prompt. No overlay, no CTA, no headline
 * on the picture — the digest text is the Facebook caption.
 */

import { parseDigestArticles } from './digest.js';
import {
  VISUAL_GROUNDING_RULES,
  containsCyrillic,
  coverRotationIndex,
  coverSubjectNeedsFallback,
  groundCoverVariant,
  inferNewsToneFromFact,
} from './visual-grounding.js';

export const COVER_ASPECT = '4:5';

export const COVER_SELECTION_SYSTEM_PROMPT = `Ти обираєш ОДНУ новину з українського дайджесту для обкладинки Facebook-поста.

Мета: зупинити скрол у стрічці. Картинка БЕЗ будь-якого тексту — підпис поста буде повним дайджестом.

Критерії вибору (за пріоритетом):
1. Найсильніший візуальний факт: несподіванка, масштаб, конфлікт, імена/продукти, конкретна сцена з предметами (гра, пристрій, лабораторія), не анонімне обличчя.
2. Сцену можна сфотографувати без UI, логотипів, екранів, написів і випадкового портрета.
3. Ігноруй авторський сарказм («революція?», «історія», «ага») — обирай факт, не тон.
4. Не обирай абстрактну «новину про ШІ взагалі», якщо є конкретніша дія.
5. Реліз моделі, відсоток швидкодії або ціна самі по собі НЕ візуальні. Не вигадуй для них комп'ютери, сервери, глобуси, коробки чи інше обладнання. Обери інший блок.

Для обраного блоку заповни:
- articleIndex — номер блоку з входу (1, 2, 3...)
- coreFact — нейтральний факт АНГЛІЙСЬКОЮ (хто/що/що сталося), БЕЗ сарказму. Обов'язково Latin script. ЗАБОРОНЕНО кирилицю в coreFact. Приклад: "Anthropic is testing Claude Money, a chatbot that connects to a bank account to track salary."
- entities — масив конкретних назв (компанії, продукти, технології, місця)
- newsTone — "positive" | "neutral" | "negative" лише з coreFact
- pickReason — одне коротке речення українською, чому саме цей блок

${VISUAL_GROUNDING_RULES}

Відповідай ТІЛЬКИ JSON:
{
  "articleIndex": 1,
  "coreFact": "...",
  "entities": ["...", "..."],
  "newsTone": "positive|neutral|negative",
  "pickReason": "..."
}`;

export const COVER_VISUAL_SYSTEM_PROMPT = `You write one text-free 4:5 Facebook cover image prompt in English from a single news block.

The digest caption is Ukrainian; your output is ONLY for the image model. Read the article text and coreFact, ignore sarcastic author tone, and depict the factual action.

Requirements:
- visualSubject: one concrete photograph of THIS story's objects and action (what is in the frame, where, what is happening). Never a sentence that restates coreFact.
- prompt: full English image prompt derived from visualSubject; vivid color, golden or daylight; editorial magazine still
- English only — no Cyrillic anywhere
- No readable text, letters, numbers, logos, UI, screenshots, watermarks, or captions in the scene
- No generic stock scenes unrelated to the story (urban rooftops, cell towers, random portraits, a man in a hat, unidentified faces, modern RGB gaming PC, generic AI workstation, datacenter racks, crystal prisms, coffee-on-desk unless that is the story)
- Bank / salary / fintech stories: wallet, cash envelopes, vault, payment card — never a rooftop or unmarked hardware
- AI extinction / regulation-debate stories: lecture hall, gavel, conference table — never a rooftop or server room
- For classic game / OS-from-scratch stories: retro CRT, arcade stick, or bare motherboard on a workbench — never a sleek modern PC tower
- No author sarcasm as imagery (revolution, history book, joke framing)
- Show physical objects and actions from the news, not abstract "AI" symbolism
- If this story has no concrete story-specific photographic scene, reply with {"unvisualizable":true}; never invent computers, PCs, server racks, globes, boxes, or hardware
- Never turn a product or model name into a physical object

Reply with JSON only:
{
  "visualSubject": "...",
  "prompt": "..."
}`;

export function coverSelectionUserPrompt(articles, excludedArticleIndexes = []) {
  const blocks = articles.map((article, i) => (
    `--- ARTICLE ${i + 1} ---\n${article.text}${article.url ? `\nURL: ${article.url}` : ''}`
  )).join('\n\n');
  const excluded = excludedArticleIndexes.length
    ? `\nНЕ ОБИРАЙ відхилені блоки: ${excludedArticleIndexes.join(', ')}. Для них не вдалося створити конкретну фотографічну сцену.`
    : '';
  return `Обери РІВНО ОДИН блок як обкладинку Facebook. Ігноруй сарказм автора; візуал = факт новини.${excluded}\n\n${blocks}`;
}

export function coverVisualUserPrompt(selection) {
  const entities = Array.isArray(selection.entities) ? selection.entities.join(', ') : '';
  return [
    `coreFact: ${selection.coreFact || ''}`,
    `entities: ${entities}`,
    `newsTone: ${selection.newsTone || inferNewsToneFromFact(selection.coreFact)}`,
    '',
    'article:',
    selection.sourceText || '',
  ].join('\n');
}

function firstSentence(text) {
  const source = String(text || '').trim();
  const match = source.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : source).trim();
}

const FALLBACK_STORY_HINTS = [
  {
    score: 10,
    re: /вайб.?код|vibe.?cod|залежн\w*\s+від\s+код|coding addiction|не спить через код|exhausted developer/i,
    coreFact: 'A developer described becoming addicted to vibe coding and working to exhaustion.',
    entities: ['developer', 'vibe coding'],
    newsTone: 'negative',
    scene: 'An exhausted developer slumped at a cluttered late-night work desk, face in hands beside crumpled blank notes and an untouched meal, dramatic window light, no screens, no text',
  },
  {
    score: 5,
    re: /літак|судно|корабл|абордаж|fighter jets?|military aircraft|warship|cargo ship/i,
    coreFact: 'Military aircraft were sent toward a ship after a faulty automated intelligence report.',
    entities: ['military aircraft', 'cargo ship'],
    newsTone: 'negative',
  },
  {
    score: 8,
    re: /брелок|тамагочі|tamagotchi|keychain|pendant/i,
    coreFact: 'A company showed a small square pocket pendant that listens through a microphone.',
    entities: ['pocket pendant'],
    newsTone: 'neutral',
    scene: 'A small square metal pocket pendant lying on a sunlit wooden table, microphone grille, no icons, no logos, no text',
  },
  {
    score: 4,
    re: /зламав|злам|парол|креденшал|hacked|breach|credentials/i,
    coreFact: 'An AI model broke into company systems and collected credentials during a safety test.',
    entities: ['credentials'],
    newsTone: 'negative',
    scene: 'A heavy vault door ajar beside a padlock and blank metal keys on a sunlit desk, no icons, no racks, no text',
  },
  {
    score: 3,
    re: /будує сам себе|наступну версію|тисяч\w* агент|swarm of agents|builds the next version/i,
    coreFact: 'An AI lab is using swarms of agents to build the next version of its own model.',
    entities: ['AI agents'],
    newsTone: 'neutral',
  },
];

export function fallbackCoverFromArticles(articles, {
  excludedArticleIndexes = [],
  requireConcrete = false,
} = {}) {
  if (!articles?.[0]?.text) {
    throw new Error('Digest has no news blocks to illustrate');
  }
  const excluded = new Set(excludedArticleIndexes);
  const firstAllowed = articles.findIndex((_, index) => !excluded.has(index + 1));
  let best = { index: firstAllowed >= 0 ? firstAllowed : 0, story: null, score: 0 };
  articles.forEach((article, index) => {
    if (excluded.has(index + 1)) return;
    const text = String(article?.text || '');
    for (const story of FALLBACK_STORY_HINTS) {
      if (story.re.test(text) && story.score > best.score) {
        best = { index, story, score: story.score };
      }
    }
  });
  if (requireConcrete && !best.story?.scene) {
    throw new Error('Digest has no deterministic concrete cover fallback');
  }
  const article = articles[best.index];
  const coreFact = best.story?.coreFact || firstSentence(article.text);
  return {
    articleIndex: best.index + 1,
    sourceText: article.text,
    url: article.url || '',
    coreFact,
    entities: best.story?.entities || [],
    newsTone: best.story?.newsTone || inferNewsToneFromFact(coreFact),
    visualSubject: best.story?.scene || '',
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

  return {
    articleIndex: index + 1,
    sourceText: article.text,
    url: article.url || '',
    coreFact,
    entities: Array.isArray(data.entities)
      ? data.entities.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    newsTone: data.newsTone,
    visualSubject: '',
    prompt: '',
    pickReason: String(data.pickReason || '').trim(),
    fallback: false,
  };
}

export function parseCoverVisualGrounding(raw, selection) {
  const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Cover visual grounding did not return JSON');
  }

  let data;
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Cover visual grounding JSON is invalid');
  }
  if (data.unvisualizable === true) {
    throw new Error('Cover story is not concretely visualizable');
  }

  const visualSubject = String(data.visualSubject || '').trim();
  const prompt = String(data.prompt || '').trim();
  if (!visualSubject && !prompt) {
    throw new Error('Cover visual grounding returned empty visualSubject and prompt');
  }

  return {
    ...selection,
    visualSubject,
    prompt,
  };
}

export async function groundCoverVisual(selection, { completeJson, log = () => {} } = {}) {
  if (typeof completeJson !== 'function') {
    return coverSubjectNeedsFallback(
      selection.visualSubject,
      selection.prompt || selection.visualSubject,
      selection.coreFact,
      { sourceText: selection.sourceText },
    ) ? null : selection;
  }

  try {
    const raw = await completeJson(
      COVER_VISUAL_SYSTEM_PROMPT,
      coverVisualUserPrompt(selection),
    );
    let grounded = parseCoverVisualGrounding(raw, selection);
    if (coverSubjectNeedsFallback(
      grounded.visualSubject,
      grounded.prompt,
      selection.coreFact,
      { sourceText: selection.sourceText },
    )) {
      log('Cover visual restated the headline or a stock scene, retrying...');
      const retryRaw = await completeJson(
        COVER_VISUAL_SYSTEM_PROMPT,
        `${coverVisualUserPrompt(selection)}\n\nREJECTED. visualSubject must be a photograph of the physical objects in this article. Do not repeat coreFact as a sentence. Do not use a datacenter, gaming PC, rooftop, or generic workstation unless that object is the news.`,
      );
      const retried = parseCoverVisualGrounding(retryRaw, selection);
      if (!coverSubjectNeedsFallback(
        retried.visualSubject,
        retried.prompt,
        selection.coreFact,
        { sourceText: selection.sourceText },
      )) {
        grounded = retried;
      } else {
        log(`Cover article #${selection.articleIndex} is not concretely visualizable`);
        return null;
      }
    }
    log(`Cover visual: ${(grounded.visualSubject || '').slice(0, 120)}`);
    return grounded;
  } catch (err) {
    log(`Cover visual grounding rejected article #${selection.articleIndex}: ${err.message}`);
    return null;
  }
}

export function groundDigestCover(selection, { rotationSeed = 0 } = {}) {
  const rotationIndex = coverRotationIndex({
    articleIndex: selection.articleIndex,
    coreFact: selection.coreFact,
    rotationSeed,
  });
  const grounded = groundCoverVariant({ ...selection, look: 'cover' }, rotationIndex);
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
 * `completeJson(systemPrompt, userPrompt)` must return JSON text (called twice:
 * story selection, then visual grounding).
 * If omitted or it throws, falls back to the first digest block.
 */
export async function selectDigestCover(digestText, {
  completeJson,
  log = () => {},
  rotationSeed = Date.now(),
} = {}) {
  const articles = parseDigestArticles(digestText);
  if (articles.length === 0) {
    throw new Error('Digest has no news blocks to illustrate');
  }

  let selection = null;
  const rejectedArticleIndexes = new Set();
  if (typeof completeJson === 'function') {
    while (!selection && rejectedArticleIndexes.size < articles.length) {
      try {
        const userPrompt = coverSelectionUserPrompt(articles, [...rejectedArticleIndexes]);
        let raw = await completeJson(COVER_SELECTION_SYSTEM_PROMPT, userPrompt);
        let candidate = parseCoverSelection(raw, articles);
        if (containsCyrillic(candidate.coreFact)) {
          log('Cover selection coreFact was not English, retrying...');
          raw = await completeJson(
            COVER_SELECTION_SYSTEM_PROMPT,
            `${userPrompt}\n\nCRITICAL: coreFact MUST be English Latin script only. No Cyrillic. Example: "Anthropic is testing Claude Money, a chatbot linked to a bank account."`,
          );
          const retried = parseCoverSelection(raw, articles);
          if (!containsCyrillic(retried.coreFact)) {
            candidate = retried;
          }
        }
        if (rejectedArticleIndexes.has(candidate.articleIndex)) {
          log(`Cover selector repeated rejected article #${candidate.articleIndex}`);
          break;
        }
        const groundedCandidate = await groundCoverVisual(candidate, { completeJson, log });
        if (groundedCandidate) {
          selection = groundedCandidate;
        } else {
          rejectedArticleIndexes.add(candidate.articleIndex);
          log(`Rejecting cover article #${candidate.articleIndex}; selecting another digest story`);
        }
      } catch (err) {
        log(`Cover selection LLM failed: ${err.message}`);
        break;
      }
    }
  }

  if (!selection) {
    selection = fallbackCoverFromArticles(articles, {
      excludedArticleIndexes: [...rejectedArticleIndexes],
      requireConcrete: rejectedArticleIndexes.size > 0,
    });
    const fallbackGrounded = await groundCoverVisual(selection, { log });
    if (!fallbackGrounded) {
      throw new Error('Digest has no concrete, story-specific cover scene');
    }
    selection = fallbackGrounded;
  }

  const grounded = groundDigestCover(selection, { rotationSeed });
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
