/**
 * Shared helpers so image + reel pipelines ground visuals in the factual
 * news subject, not sarcastic author tone ("Знову революція?", "Оце так історія").
 */

export const BANNED_VISUAL_TERMS = [
  'revolution',
  'revolutionary',
  'uprising',
  'rebel',
  'rebellion',
  'history book',
  'ancient history',
  'historical monument',
  'museum of history',
  'storybook',
  'fairy tale',
  'curious',
  'funny',
  'hilarious',
  'joke',
  'sarcasm',
  'perfect cyborg',
  'flawless cyborg',
];

const BANNED_RE = new RegExp(
  `\\b(${BANNED_VISUAL_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

const UI_VISUAL_RE = /\b(ui|interface|screen|dashboard|app mockup|chatgpt|openai|gpt[\s-]?[\d.]+|software panel|blog page|website screenshot|chat interface|readable text|ui label|caption|headline on screen|browser interface|browser window|browser tab|app screen|control panel|engraved|embossed|inscription|typography|lettering|diagram|infographic|flowchart|schematic|data chart|neural network diagram|digital interface|cloud computing network symbols|map labels?|globe labels?|country names?|continent labels?|neural network|node cluster|network visualization|synaptic|data nodes|matrix code|binary digits|source code|code snippet|vertical text|string of characters)\b/i;

/** Visual subjects that tempt image models to paint text, numbers, dials, or logos. */
const TEXT_PRONE_VISUAL_RE =
  /\b(reasoning[\s-]?depth|dial|slider|gauge|knob|potentiometer|meter|numbered|markings?|brass dial|adjustment control|depth control|labeled|inscription|coin|medal|seal|emblem|engraved|embossed|symbols on|logo|brand name|version number|product name|neural network|node cluster|network graph|data visualization|globe with labels|country names|map text|code text|binary code)\b/i;

const BRAND_TOKEN_RE =
  /\b(openai|chatgpt|gpt[\s-]?[\d.]+[a-z]*|google earth|google|cloudflare|bytedance|gemini|claude|kitesurf|anthropic|meta|microsoft|apple|nvidia)\b/gi;

const VERSION_NUMBER_RE = /\b\d+(?:\.\d+)+\b/g;

const SAFE_VISUALS = {
  aiAssistantUpdate:
    'Sunlit close-up of glowing amber, gold, and cyan fiber optic light trails in a bright glass-walled server hall, warm window light and vivid color bokeh only, no hardware faceplates no ports no stickers no letters no numbers no watermarks',
  aiModelDevelopment:
    'Engineers walking past rows of unmarked GPU server racks in a sunlit data center, warm window light and vivid cable color, physical cables and blinking LEDs only, no monitors no diagrams no labels no watermarks',
  mapFeatureRemoval:
    'Hand removing vivid colored push pins from a smooth blank blue desk sphere on a bright white desk, strong daylight, no geography labels no continent outlines no readable markings on the sphere',
  aiBrowserLaunch:
    'Glowing amber and cyan fiber optic cables plugged into server blades in a bright sunlit network room, unmarked metal hardware, no screens no browser windows no tabs no icons no watermarks',
  default:
    'Sunlit technology scene with unmarked hardware, warm daylight and vivid color, no screens dials labels symbols typography or watermarks',
};

function factMatches(re, coreFact) {
  return re.test(String(coreFact || ''));
}

/** Generic fact clause for image prompts — never feed brand names to the image model. */
function buildImageFactClause(coreFact) {
  const fact = String(coreFact || '').trim();
  if (!fact) return '';

  if (/\b(discontinu|removed|shut\s?down|deprecated|killed)\b/i.test(fact)) {
    return ' News context: a major tech feature was removed after launch.';
  }
  if (/\b(launch|release|update|introduc|unveil|debuts?)\b/i.test(fact)) {
    return ' News context: a major technology product update.';
  }
  if (/\b(develop|building|training|parameters|language model|llm)\b/i.test(fact)) {
    return ' News context: large-scale AI model development.';
  }
  if (/\b(browser|surf|agent)\b/i.test(fact)) {
    return ' News context: a new AI web browsing tool launch.';
  }
  return ` News context: ${sanitizeTextForImagePrompt(fact)}.`;
}

const SAFE_VISUAL_VALUES = new Set(Object.values(SAFE_VISUALS));

function isKnownSafeVisual(subject) {
  const value = String(subject || '').trim();
  return SAFE_VISUAL_VALUES.has(value);
}

/** Pick a text-free visual subject from the factual news content. */
export function buildSafeVisualSubject({ visualSubject, coreFact, entities = [] } = {}) {
  const fact = String(coreFact || '').trim();
  const rawSubject = String(visualSubject || '').trim();
  if (isKnownSafeVisual(rawSubject)) return rawSubject;

  const subject = sanitizeTextForImagePrompt(rawSubject);
  const entityText = (Array.isArray(entities) ? entities : []).join(' ').toLowerCase();

  if (
    factMatches(/\b(earth|satellite|map overlay|cartograph|geospatial|google earth)\b/i, fact)
    || (factMatches(/\b(discontinu|removed|shut\s?down|deprecated|killed)\b/i, fact)
      && factMatches(/\b(earth|satellite|maps?)\b/i, fact))
    || factMatches(/\b(earth|maps?)\b/i, entityText)
  ) {
    return SAFE_VISUALS.mapFeatureRemoval;
  }

  if (
    factMatches(/\b(language model|llm|parameters|training model|developing a .* model|bytedance|trillion)\b/i, fact)
    || factMatches(/\b(llm|language model|bytedance)\b/i, entityText)
  ) {
    return SAFE_VISUALS.aiModelDevelopment;
  }

  if (
    factMatches(/\b(chatgpt|gpt|openai|reasoning|assistant|adaptiv|direct response)\b/i, fact)
    || factMatches(/\b(chatgpt|gpt|openai|reasoning|assistant)\b/i, entityText)
  ) {
    return SAFE_VISUALS.aiAssistantUpdate;
  }

  if (
    factMatches(/\b(browser|surf the internet|kitesurf|web agent|cloudflare)\b/i, fact)
    || factMatches(/\b(browser|kitesurf|cloudflare)\b/i, entityText)
  ) {
    return SAFE_VISUALS.aiBrowserLaunch;
  }

  if (!subject || UI_VISUAL_RE.test(subject) || TEXT_PRONE_VISUAL_RE.test(subject)) {
    return SAFE_VISUALS.default;
  }

  return subject;
}

/** Remove brand names and version numbers from text sent to the image model. */
export function sanitizeTextForImagePrompt(text) {
  return String(text || '')
    .replace(BRAND_TOKEN_RE, '')
    .replace(VERSION_NUMBER_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strong no-text clause appended to every image prompt (reel + carousel). */
export const NO_TEXT_IMAGE_RULES =
  'CRITICAL: zero readable characters anywhere in the frame — no text, no letters, no numbers, ' +
  'no words, no logos, no captions, no watermarks, no mastheads, no title cards, no UI labels, ' +
  'no engraved or embossed typography, no brand names or product names written on objects, ' +
  'no version numbers visible, no screen typography, no blog headlines, no chat bubbles, ' +
  'no app mockups, no software UI panels, no holographic glyphs, no neural network diagrams, ' +
  'no node graphs, no code strings, no binary digits, no map labels, no country names on globes, ' +
  'no vertical data strings, no faint ghost text, no "AI News" or similar captions, ' +
  'no printed labels on cables, no barcodes, no serial numbers on hardware. ' +
  'Pure photographic scene only — never a screenshot, dashboard, blog page, labeled interface, ' +
  'poster, magazine cover, or news graphic.';

/** Palettes keyed by factual news tone — not author sarcasm. Never gray sludge. */
export const NEWS_TONE_PALETTES = {
  positive: [
    'bright warm golden-hour light, optimistic mood, vibrant clean photography',
    'fresh morning daylight, clean highlights, energetic professional photography',
    'soft bright overcast with warm amber accents, uplifting colorful reportage',
  ],
  neutral: [
    'crisp daylight, rich natural color, lively professional photography',
    'warm window light with vivid accents, clean colorful scene',
    'bright even light with saturated midtones, energetic photographic feel',
  ],
  negative: [
    'dramatic high-contrast light, deep teal and amber, cinematic but colorful',
    'storm-blue highlights against warm tungsten, intense not gray',
    'bold cool-warm color contrast, serious mood without desaturation',
  ],
};

export const COVER_COLOR_RULES =
  'Vivid saturated color, high contrast, punchy light. Never gray, never desaturated, ' +
  'never muted earth tones, never charcoal, never gloomy documentary. ' +
  'Editorial magazine still that stops a social-feed scroll.';

const POSITIVE_TONE_RE =
  /\b(launch(ed|es|ing)?|release(d|s|ing)?|unveil(ed|s|ing)?|introduc(es|ed|ing)|debuts?|breakthrough|upgrade(d|s|ing)?|improv(es|ed|ing)|record|success|wins?|partnership|funding|raised|expand(s|ed|ing)?|open(s|ed|ing)?\s+source)\b/i;
const NEGATIVE_TONE_RE =
  /\b(discontinu(ed|es|ing)?|shut\s?down|removed|deprecated|killed|ban(ned|s|ning)?|attack(ed|s|ing)?|breach(ed|es)?|hack(ed|s|ing)?|laid\s?off|crisis|fail(ed|ure|s|ing)?|lawsuit|fine(d|s|ing)?|scandal|recall(ed|s|ing)?|warning|died|death|war|sanction(ed|s|ing)?|leak(ed|s|ing)?|sued|bankrupt|collapse(d|s|ing)?|outage|downtime)\b/i;

/** Normalize LLM-provided tone labels to positive | neutral | negative. */
export function normalizeNewsTone(value) {
  const tone = String(value || '').trim().toLowerCase();
  if (['positive', 'good', 'bright', 'celebratory', 'optimistic', 'upbeat', 'hopeful'].includes(tone)) {
    return 'positive';
  }
  if (['negative', 'bad', 'dark', 'somber', 'sad', 'grave', 'warning', 'critical', 'bleak'].includes(tone)) {
    return 'negative';
  }
  return 'neutral';
}

/** Infer palette tone from the neutral coreFact when newsTone is missing. */
export function inferNewsToneFromFact(coreFact) {
  const fact = String(coreFact || '').trim();
  if (!fact) return 'neutral';
  if (NEGATIVE_TONE_RE.test(fact)) return 'negative';
  if (POSITIVE_TONE_RE.test(fact)) return 'positive';
  return 'neutral';
}

export function resolveNewsTone({ newsTone, coreFact } = {}) {
  const normalized = normalizeNewsTone(newsTone);
  if (normalized !== 'neutral' || newsTone) return normalized;
  return inferNewsToneFromFact(coreFact);
}

export function pickVisualPalette({ newsTone, coreFact, index = 0 } = {}) {
  const tone = resolveNewsTone({ newsTone, coreFact });
  const palettes = NEWS_TONE_PALETTES[tone] || NEWS_TONE_PALETTES.neutral;
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return palettes[i % palettes.length];
}

export function normalizeVisualLook(look) {
  return String(look || '').trim().toLowerCase() === 'cover' ? 'cover' : 'reel';
}

export function buildAtmosphereClause({ newsTone, coreFact, index = 0, look = 'reel' } = {}) {
  const tone = resolveNewsTone({ newsTone, coreFact });
  const visualLook = normalizeVisualLook(look);
  const palette = pickVisualPalette({ newsTone: tone, coreFact, index });
  const spaceHint = visualLook === 'cover'
    ? 'Fill the frame with a bold concrete subject. No empty gray void, no washed-out sky as the only content.'
    : 'Keep the upper third of the frame uncluttered — negative space only, never paint any writing there.';
  const style = visualLook === 'cover'
    ? COVER_COLOR_RULES
    : 'Photorealistic cinematic photography with rich color. Avoid gray, beige, and desaturated palettes.';

  return (
    `${NO_TEXT_IMAGE_RULES} ` +
    `${palette}. ` +
    `${spaceHint} ` +
    `${style} ` +
    'Do not render any title, caption, watermark, or logo.'
  );
}

export const VISUAL_GROUNDING_RULES = `КРИТИЧНО — СПОЧАТКУ ФАКТ, ПОТІМ КАРТИНКА:
1. Спочатку витягни coreFact: нейтральний факт (хто / що зробив / що сталося) БЕЗ авторського тону.
2. Витягни entities: конкретні назви (компанії, продукти, технології, місця).
3. Визнач newsTone ТІЛЬКИ з coreFact (не з сарказму автора): "positive" | "neutral" | "negative".
   - positive: запуск, реліз, оновлення, прорив, успіх, покращення
   - negative: закриття, відключення, атака, скандал, провал, санкції, злам
   - neutral: розробка, тестування, звіт, факт без явно позитивного/негативного заряду
4. Витягни visualSubject: 1 конкретна сцена з цих сутностей і дії (НЕ символ тону автора).
5. Лише після цього пиши prompt англійською на основі visualSubject + entities.

Сарказм автора — НЕ сюжет зображення:
- "Знову революція?", "Оце так історія", "Інтересненько", "Ага", "Ну що" — це тон, не факт.
- НІКОЛИ не візуалізуй revolution / history / curiosity / joke / cyborg army з таких фраз.
- Якщо в тексті "революція" в лапках або як риторичне питання — ігноруй це слово для картинки.

КРИТИЧНО — БЕЗ ТЕКСТУ НА ФОНІ (reel накладає білий текст зверху):
- НІКОЛИ не генеруй UI-екрани, блоги, чати, дашборди з читабельним текстом чи підписами.
- НІКОЛИ не показуй app mockup, software panel, website screenshot, chat interface.
- Для новин про ПЗ/ШІ використовуй фізичні метафори (реальний регулятор, світло, обладнання), а не екран з написами.

Погано → добре (з цього дайджесту):
- BAD: "ChatGPT app screen with reasoning-depth label and UI text" для новини про GPT-5.6 Sol
  GOOD: "bright AI data center server racks with fiber optic glow and blinking LEDs, blank unmarked metal surfaces, no screens no dials no gauges no symbols"
- BAD: "ancient history museum / history book opening" для новини про Google Earth AI
  GOOD: "satellite globe with fake map overlays being erased, aerial cartography metaphor, no logos, no map labels"
- BAD: "complex neural network diagram on monitors" для новини про LLM
  GOOD: "engineers in a server room beside racks of GPU hardware, warm window light, physical cables and blinking LEDs, no monitors with graphics"

Промпт ОБОВ'ЯЗКОВО описує visualSubject.
ЗАБОРОНЕНО: будь-який текст, літери, цифри, слова, логотипи, UI labels на зображенні.
Колір/освітлення має відповідати newsTone фактичної новини, АЛЕ ніколи не сірий:
- positive → яскраве тепле світло, насичений колір
- negative → драматичний кольоровий контраст (teal/amber, storm-blue + tungsten), НЕ desaturated, НЕ charcoal
- neutral → насичений денний колір, НЕ muted earth tones
ЗАБОРОНЕНО: сіра, вугільна, вицвіла, gloomy documentary палітра.`;

export function promptHasBannedMetaphor(prompt) {
  return BANNED_RE.test(String(prompt || ''));
}

export function buildGroundedPrompt({ visualSubject, coreFact, entities = [], newsTone, index = 0, look = 'reel' } = {}) {
  const fact = String(coreFact || '').trim();
  const safeSubject = buildSafeVisualSubject({ visualSubject, coreFact: fact, entities });
  const factClause = buildImageFactClause(fact);
  const tone = resolveNewsTone({ newsTone, coreFact: fact });
  const visualLook = normalizeVisualLook(look);

  return (
    `${safeSubject}.${factClause} ` +
    'Concrete physical depiction (not abstract symbols of tone, not UI screenshots, not labeled objects, not dials or gauges). ' +
    buildAtmosphereClause({ newsTone: tone, coreFact: fact, index, look: visualLook })
  ).replace(/\s+/g, ' ').trim();
}

/** Apply news-tone palette and ensure the no-text clause is present before image API calls. */
export function finalizeImagePrompt(prompt, { newsTone, coreFact, index = 0, look = 'reel' } = {}) {
  const visualLook = normalizeVisualLook(look);
  let result = String(prompt || '').trim();
  if (!result) return buildGroundedPrompt({ newsTone, coreFact, index, look: visualLook });

  // Strip legacy dark-moody / gray-documentary boilerplate and entity-name clauses.
  result = result
    .replace(/\bDark moody atmosphere\b[^.]*\./gi, '')
    .replace(/\bdark moody\b,?\s*/gi, '')
    .replace(/\bdesaturated\b[^.]*\./gi, '')
    .replace(/\b(charcoal palette|grave mood|muted earth tones|muted blue-grey)\b[^.]*\./gi, '')
    .replace(/\bPhotorealistic documentary photography\b[^.]*\./gi, '')
    .replace(/\bProfessional documentary photography\b[^.]*\./gi, '')
    .replace(/\bNo text, no letters, no numbers, no words, no logos\b[^.]*\./gi, '')
    .replace(/\bClearly depict cues for:[^.]*\./gi, '')
    .replace(BRAND_TOKEN_RE, 'AI technology')
    .replace(VERSION_NUMBER_RE, '')
    .replace(/\b(reasoning[\s-]?depth|brass physical reasoning-depth dial|brass dial|physical reasoning-depth dial)\b/gi, 'unmarked server hardware')
    .replace(/\b(neural network|node cluster|network visualization|data visualization|globe with labels|country names on globe)\b/gi, 'unmarked physical hardware')
    .replace(/\s+/g, ' ')
    .trim();

  const tone = resolveNewsTone({ newsTone, coreFact });
  return (
    `IMAGE MUST CONTAIN ZERO TEXT, LETTERS, NUMBERS, LOGOS, WATERMARKS, OR CAPTIONS ANYWHERE. ${result} ${buildAtmosphereClause({ newsTone: tone, coreFact, index, look: visualLook })}`
  ).replace(/\s+/g, ' ').trim();
}

/**
 * Ensure a variant/shot has a prompt grounded in coreFact/entities/visualSubject.
 * Rebuilds the prompt when banned metaphors appear or entities are missing from it.
 */
const UI_TEXT_RE = UI_VISUAL_RE;

export function groundVisualVariant(variant, index = 0) {
  if (!variant || typeof variant !== 'object') return variant;

  const entities = Array.isArray(variant.entities)
    ? variant.entities.map(e => String(e || '').trim()).filter(Boolean)
    : [];
  const visualSubject = String(variant.visualSubject || '').trim();
  const coreFact = String(variant.coreFact || '').trim();
  const newsTone = resolveNewsTone({ newsTone: variant.newsTone, coreFact });
  const look = normalizeVisualLook(variant.look);
  let prompt = String(variant.prompt || '').trim();

  const promptLower = prompt.toLowerCase();
  const subjectLower = visualSubject.toLowerCase();
  const factLower = coreFact.toLowerCase();
  const isSemanticallyGrounded = entities.length === 0
    || entities.some((e) => {
      const key = String(e).toLowerCase();
      return promptLower.includes(key)
        || subjectLower.includes(key)
        || factLower.includes(key);
    });
  const safeSubject = buildSafeVisualSubject({ visualSubject, coreFact, entities });
  const needsRebuild = !prompt
    || promptHasBannedMetaphor(prompt)
    || promptHasBannedMetaphor(visualSubject)
    || !isSemanticallyGrounded
    || UI_TEXT_RE.test(prompt)
    || UI_TEXT_RE.test(visualSubject)
    || TEXT_PRONE_VISUAL_RE.test(prompt)
    || TEXT_PRONE_VISUAL_RE.test(visualSubject)
    || safeSubject !== sanitizeTextForImagePrompt(visualSubject)
    || /\bclearly depict cues for:/i.test(prompt)
    || /abstract (ai |digital )?(vortex|background|swirl|eye)/i.test(prompt);

  if (needsRebuild) {
    prompt = buildGroundedPrompt({ visualSubject: safeSubject, coreFact, entities, newsTone, index, look });
  } else {
    prompt = finalizeImagePrompt(prompt, { newsTone, coreFact, index, look });
  }

  return {
    ...variant,
    coreFact,
    entities,
    visualSubject: safeSubject,
    newsTone,
    look,
    prompt,
  };
}

export function groundVisualList(items, key = null) {
  if (!Array.isArray(items)) return items;
  return items.map(item => groundVisualVariant(item));
}
