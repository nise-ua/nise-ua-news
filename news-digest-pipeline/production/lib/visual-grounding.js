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

const UI_VISUAL_RE = /\b(ui|interface|screen|dashboard|app mockup|chatgpt|openai|gpt[\s-]?[\d.]+|software panel|blog page|website screenshot|app screenshot|screenshot|chat interface|readable text|readable labels?|ui label|caption|headline on screen|browser interface|browser window|browser tab|app screen|control panel|engraved|embossed|inscription|typography|lettering|diagram|infographic|flowchart|schematic|data chart|neural network diagram|digital interface|cloud computing network symbols|map labels?|globe labels?|country names?|continent labels?|neural network|node cluster|network visualization|synaptic|data nodes|matrix code|binary digits|source code|code snippet|vertical text|string of characters)\b/i;

function matchesVisualSafetyPattern(re, text) {
  return new RegExp(re.source, re.flags.includes('i') ? re.flags : `${re.flags}i`).test(String(text || ''));
}

/** Visual subjects that tempt image models to paint text, numbers, dials, or logos. */
const TEXT_PRONE_VISUAL_RE =
  /\b(reasoning[\s-]?depth|dial|slider|gauge|knob|potentiometer|meter|numbered|markings?|brass dial|adjustment control|depth control|labeled|inscription|coin|medal|seal|emblem|engraved|embossed|symbols on|logo|brand name|version number|product name|neural network|node cluster|network graph|data visualization|globe with labels|country names|map text|code text|binary code)\b/i;

const CYRILLIC_RE = /[\u0400-\u04FF]/;

export function containsCyrillic(text) {
  return CYRILLIC_RE.test(String(text || ''));
}

const BRAND_TOKEN_RE =
  /\b(openai|chatgpt|gpt[\s-]?[\d.]+[a-z]*|google earth|google|cloudflare|bytedance|gemini|claude|kitesurf|anthropic|meta|microsoft|apple|nvidia)\b/gi;

const VERSION_NUMBER_RE = /\b\d+(?:\.\d+)+\b/g;

/** Datacenter / cable clichés — fine for reel hardware shots, banned on Facebook covers. */
export const GENERIC_IT_CLICHE_RE =
  /\b(fiber optic|server rack|server racks|data center|compute rack|server hall|server room|server blade|server cabinet|network room|telecom closet|patch panel|cable tray|cable bundle|GPU server|blinking LED|network cable|server aisle|cooling manifold|compute module)\b/i;

const SAFE_VISUAL_VARIANTS = {
  aiAssistantUpdate: [
    'Sunlit close-up of glowing amber, gold, and cyan fiber optic light trails in a bright glass-walled server hall, warm window light and vivid color bokeh only, no hardware faceplates no ports no stickers no letters no numbers no watermarks',
    'Macro shot of warm golden light refracting through stacked crystal prisms on a bright white lab bench, saturated rainbow caustics, no labels no engravings no watermarks',
    'Hands adjusting unmarked analog sliders on a colorful hardware control panel with LED indicators only, bright studio light, no screen no typography no brand marks',
    'Close-up of copper heat pipes and vivid coolant tubes on open unmarked server blades, shallow depth of field, punchy warm daylight, no stickers no serial numbers no watermarks',
  ],
  aiModelDevelopment: [
    'Engineers walking past rows of unmarked GPU server racks in a sunlit data center, warm window light and vivid cable color, physical cables and blinking LEDs only, no monitors no diagrams no labels no watermarks',
    'Wide shot of colorful liquid cooling manifolds feeding unmarked compute racks, saturated coolant hues, bright industrial daylight, no gauges with numbers no monitors no watermarks',
    'Robotic transport cart carrying blank metal compute modules through a vivid clean-room corridor, saturated teal and amber accent lighting, no labels no screens no watermarks',
    'Aerial-style view of symmetrical rows of unmarked server cabinets with vivid cable trays overhead, golden-hour light through high windows, no signage no typography no watermarks',
  ],
  mapFeatureRemoval: [
    'Hand removing vivid colored push pins from a smooth blank blue desk sphere on a bright white desk, strong daylight, no geography labels no continent outlines no readable markings on the sphere',
    'Blank smooth blue desk globe with colorful pins scattered beside it on a sunlit white desk, pins recently removed, no map text no country names no watermarks',
    'Overhead shot of a featureless blue sphere and a handful of bright push pins on crisp white paper, hard daylight shadows, no labels no typography no watermarks',
  ],
  aiBrowserLaunch: [
    'Glowing amber and cyan fiber optic cables plugged into server blades in a bright sunlit network room, unmarked metal hardware, no screens no browser windows no tabs no icons no watermarks',
    'Fast-motion blur of colorful network cables converging on a patch panel in a bright telecom closet, saturated connectors, no readable port labels no screens no watermarks',
    'Low-angle shot of vivid cable bundles routing through a sunlit ceiling tray above blank metal racks, warm tungsten accents, no monitors no UI no watermarks',
  ],
  chipHardware: [
    'Macro photograph of unmarked silicon wafers catching rainbow reflections under bright clean-room light, saturated color, no etched numbers no logos no watermarks',
    'Robotic pick-and-place arm hovering over green circuit boards with unmarked components, vivid factory lighting, no readable silkscreen no part numbers no watermarks',
    'Close-up of a heat sink and copper vapor chamber on a blank motherboard, shallow depth of field, warm daylight, no chip markings no serial text no watermarks',
  ],
  robotics: [
    'Industrial robot arm welding sparks in a bright factory bay, saturated orange sparks against teal shadows, no control screens no labels no watermarks',
    'Autonomous warehouse robot carrying a blank crate through vivid aisle lighting, motion blur on wheels, no barcode labels no signage no watermarks',
    'Humanoid robot torso and arms on a test stand in a sunlit robotics lab, colorful cable harnesses, no face screen no typography no watermarks',
  ],
  security: [
    'Heavy vault door slightly ajar with warm light spilling out, dramatic teal and amber contrast, no combination dial numbers no engraved text no watermarks',
    'Stack of blank metal security keys and a padlock on a bright desk, saturated reflections, no key markings no serial numbers no watermarks',
    'Firewall-style rack of blinking unmarked network appliances in a vivid server closet, colorful LED activity, no port labels no screens no watermarks',
  ],
  space: [
    'Rocket on a launch pad at golden hour with vivid exhaust steam, saturated sky, no mission logos no countdown numbers no watermarks',
    'Satellite dish array against a bright blue sky, warm sunlight on white radomes, no facility signage no typography no watermarks',
    'Earth curvature seen from orbit with cloud patterns only, vivid blue atmosphere band, no map overlays no country borders no labels no watermarks',
  ],
  automotive: [
    'Electric vehicle charging cable plugged into a sleek car silhouette at sunset, saturated amber light on wet pavement, no badge text no license plate no watermarks',
    'Assembly line robotic arms installing a blank car door panel, bright factory color, no brand logos no VIN text no watermarks',
    'Close-up of an EV battery pack module with colorful coolant channels, macro industrial light, no capacity labels no serial numbers no watermarks',
  ],
  regulation: [
    'Wooden gavel resting on a bright mahogany bench with warm window light, shallow depth of field, no engraved text no document titles no watermarks',
    'Row of blank binders and a sealed envelope on a sunlit conference table, vivid paper whites, no readable titles no logos no watermarks',
    'Scales of justice silhouette against a colorful sunset sky, dramatic contrast, no engraved letters no courthouse signage no watermarks',
  ],
  energy: [
    'Field of wind turbines at golden hour with saturated green grass, vivid sky, no company logos on towers no readable signage no watermarks',
    'Rows of vivid blue solar panels reflecting clouds, wide landscape composition, no inverter labels no meter numbers no watermarks',
    'Battery storage containers in a bright industrial yard, colorful safety stripes without text, warm daylight, no capacity markings no watermarks',
  ],
  default: [
    'Sunlit technology scene with unmarked hardware, warm daylight and vivid color, no screens dials labels symbols typography or watermarks',
    'Bright makerspace workbench with colorful tools and blank metal prototypes, saturated daylight, no printed labels no screens no watermarks',
    'Vivid urban rooftop with antennas and blank equipment boxes against a saturated sunset sky, no billboard text no logos no watermarks',
    'Macro of colorful fiber and copper cables organized in a bright cable tray, punchy contrast, no port labels no tags no watermarks',
  ],
};

/** Facebook cover fallbacks — editorial scenes, never datacenter cable shots. */
const COVER_SAFE_VISUAL_VARIANTS = {
  coverAiAgent: [
    'Compact modular computing workstation with colorful LED indicators on a bright studio desk, shallow depth of field, no readable screens no logos no watermarks',
    'Transparent computer case showing organized colorful hardware modules and coolant tubes, vivid studio lighting, no stickers no serial numbers no watermarks',
    'Small autonomous robot assistant on a sunlit desk beside blank hardware modules, saturated accent lighting, no face screen text no watermarks',
    'Hands connecting colorful cable harnesses inside an open compact computer chassis, macro editorial photo, no readable labels no watermarks',
  ],
  coverAiLaunch: [
    'Silhouette of a tech presenter on a bright stage with vivid gradient backdrop and bokeh audience lights, no readable screens no logos no watermarks',
    'Macro of stacked crystal prisms scattering saturated rainbow caustics on a white lab bench, warm daylight, no engravings no watermarks',
    'Morning coffee beside a blank unmarked laptop on a sunlit wooden desk, shallow depth of field, no readable screen content no watermarks',
    'Crowd seen from behind watching colorful abstract light projection on a conference wall, no text no logos no watermarks',
    'Hands assembling a colorful hardware prototype on a bright workbench, vivid studio light, no screen typography no brand marks',
  ],
  coverAiDevelopment: [
    'Researchers in white coats discussing beside blank glass boards in a bright modern lab, vivid accents, no readable writing no watermarks',
    'Robotic transport cart carrying sealed metal cases through a colorful clean-room corridor, teal and amber light, no labels no screens',
    'Close-up of polished silicon wafer catching rainbow reflections under bright clean-room lamps, no etched numbers no logos',
    'Young engineer adjusting colorful analog knobs on a hardware prototype bench, studio lighting, no screen typography no watermarks',
  ],
  coverWebLaunch: [
    'Colorful kite catching wind on a bright ocean beach at golden hour, action editorial photo, no logos no text no watermarks',
    'Magnifying glass over a vivid paper map spread on a sunlit desk, no place names readable no watermarks',
    'Vintage compass and blank travel notebook on a bright journal table, warm light, no readable handwriting no watermarks',
  ],
  mapFeatureRemoval: SAFE_VISUAL_VARIANTS.mapFeatureRemoval,
  chipHardware: [
    'Macro photograph of unmarked silicon wafers catching rainbow reflections under bright clean-room light, saturated color, no etched numbers no logos no watermarks',
    'Robotic pick-and-place arm hovering over green circuit boards with unmarked components, vivid factory lighting, no readable silkscreen no part numbers no watermarks',
    'Close-up of a heat sink and copper vapor chamber on a blank motherboard, shallow depth of field, warm daylight, no chip markings no serial text no watermarks',
  ],
  robotics: [
    'Industrial robot arm welding sparks in a bright factory bay, saturated orange sparks against teal shadows, no control screens no labels no watermarks',
    'Autonomous warehouse robot carrying a blank crate through vivid aisle lighting, motion blur on wheels, no barcode labels no signage no watermarks',
    'Humanoid robot torso and arms on a test stand in a sunlit robotics lab, colorful accent lighting, no face screen no typography no watermarks',
  ],
  security: [
    'Heavy vault door slightly ajar with warm light spilling out, dramatic teal and amber contrast, no combination dial numbers no engraved text no watermarks',
    'Stack of blank metal security keys and a padlock on a bright desk, saturated reflections, no key markings no serial numbers no watermarks',
    'Laser security grid crossing a vivid corridor with a silhouette figure, dramatic color contrast, no readable panels no watermarks',
  ],
  space: SAFE_VISUAL_VARIANTS.space,
  automotive: SAFE_VISUAL_VARIANTS.automotive,
  regulation: SAFE_VISUAL_VARIANTS.regulation,
  energy: SAFE_VISUAL_VARIANTS.energy,
  coverDefault: [
    'Bright street scene with colorful umbrellas and motion blur, editorial magazine photo, no readable signs no watermarks',
    'Hands planting a small green seedling in vivid soil against golden-hour light, shallow depth of field, no labels no watermarks',
    'Modern glass atrium staircase with people silhouettes and saturated sunset through windows, no logos no watermarks',
    'Close-up of vivid paint tubes and brushes on an artist table, macro editorial style, no text on tubes no watermarks',
    'Fresh fruit and flowers on a sunlit market stall, saturated color, no price tags no readable signage no watermarks',
  ],
};

/** @deprecated Use pickSafeVisualVariant — kept for tests that reference exact strings. */
export const SAFE_VISUALS = Object.fromEntries(
  Object.entries(SAFE_VISUAL_VARIANTS).map(([key, variants]) => [key, variants[0]]),
);

const COVER_SAFE_VISUAL_VALUES = new Set(
  Object.values(COVER_SAFE_VISUAL_VARIANTS).flatMap((variants) => variants),
);

function pickSafeVisualVariant(category, index = 0) {
  const variants = SAFE_VISUAL_VARIANTS[category] || SAFE_VISUAL_VARIANTS.default;
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return variants[i % variants.length];
}

function pickCoverSafeVisualVariant(category, index = 0) {
  const variants = COVER_SAFE_VISUAL_VARIANTS[category] || COVER_SAFE_VISUAL_VARIANTS.coverDefault;
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return variants[i % variants.length];
}

export function hashVisualSeed(value) {
  let hash = 0;
  for (const ch of String(value || '')) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

export function coverRotationIndex({
  articleIndex = 1,
  coreFact = '',
  rotationSeed = 0,
} = {}) {
  const base = Math.max(0, Number(articleIndex ?? 1) - 1);
  const seed = Number(rotationSeed) || hashVisualSeed(coreFact);
  return base + (seed % 5);
}

export function isGenericItCliche(text) {
  return GENERIC_IT_CLICHE_RE.test(String(text || ''));
}

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
  if (/\b(browser|surf the web|web agent|browser agent|kitesurf)\b/i.test(fact)) {
    return ' News context: a new AI web browsing tool launch.';
  }
  if (
    /\b(ai agent|virtual assistant|personal assistant|autonomous agent|virtual machine|digital assistant|muse)\b/i.test(fact)
    || containsCyrillic(fact)
  ) {
    if (/\b(агент|віртуальн|асистент|штучн)\b/i.test(fact)
      || /\b(ai agent|virtual assistant|muse)\b/i.test(fact)) {
      return ' News context: a new autonomous AI assistant technology.';
    }
  }
  if (containsCyrillic(fact)) {
    return ' News context: a technology industry news story.';
  }
  return ` News context: ${sanitizeTextForImagePrompt(fact)}.`;
}

const SAFE_VISUAL_VALUES = new Set(
  Object.values(SAFE_VISUAL_VARIANTS).flatMap((variants) => variants),
);

function isKnownSafeVisual(subject) {
  const value = String(subject || '').trim();
  return SAFE_VISUAL_VALUES.has(value);
}

export function isSafeCustomVisualSubject(subject, { look = 'reel' } = {}) {
  const raw = String(subject || '').trim();
  if (!raw || raw.length < 20) return false;
  if (containsCyrillic(raw)) return false;
  if (normalizeVisualLook(look) === 'cover' && isGenericItCliche(raw)) return false;
  if (isKnownSafeVisual(raw) || COVER_SAFE_VISUAL_VALUES.has(raw)) return true;
  if (BANNED_RE.test(raw)) return false;
  if (matchesVisualSafetyPattern(UI_VISUAL_RE, raw)) return false;
  if (matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, raw)) return false;
  if (/abstract (ai |digital )?(vortex|background|swirl|eye)/i.test(raw)) return false;
  const sanitized = sanitizeTextForImagePrompt(raw);
  return sanitized.length >= 20;
}

function buildCoverSafeVisualSubject({ visualSubject, coreFact, entities = [], index = 0 } = {}) {
  const fact = String(coreFact || '').trim();
  const rawSubject = String(visualSubject || '').trim();
  if (COVER_SAFE_VISUAL_VALUES.has(rawSubject)) return rawSubject;

  if (isSafeCustomVisualSubject(rawSubject, { look: 'cover' })) {
    return sanitizeTextForImagePrompt(rawSubject);
  }

  const subject = sanitizeTextForImagePrompt(rawSubject);
  const entityText = (Array.isArray(entities) ? entities : []).join(' ').toLowerCase();

  if (
    factMatches(/\b(earth|satellite|map overlay|cartograph|geospatial|google earth)\b/i, fact)
    || (factMatches(/\b(discontinu|removed|shut\s?down|deprecated|killed)\b/i, fact)
      && factMatches(/\b(earth|satellite|maps?)\b/i, fact))
    || factMatches(/\b(earth|maps?)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('mapFeatureRemoval', index);
  }

  if (
    factMatches(/\b(chip|semiconductor|wafer|gpu|cpu|processor|foundry|tsmc|nvidia|intel|amd)\b/i, fact)
    || factMatches(/\b(chip|semiconductor|wafer|gpu|cpu|processor)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('chipHardware', index);
  }

  if (
    factMatches(/\b(robot|robotics|humanoid|drone|autonomous vehicle|self-driving|warehouse bot)\b/i, fact)
    || factMatches(/\b(robot|robotics|humanoid|drone)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('robotics', index);
  }

  if (
    factMatches(/\b(breach|hack|ransomware|cyber|security|vulnerability|exploit|malware)\b/i, fact)
    || factMatches(/\b(security|cyber|breach|hack)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('security', index);
  }

  if (
    factMatches(/\b(rocket|launch pad|orbit|spacecraft|satellite constellation|nasa|spacex)\b/i, fact)
    || factMatches(/\b(rocket|orbit|spacecraft|satellite)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('space', index);
  }

  if (
    factMatches(/\b(electric vehicle|ev\b|charging station|automotive|car maker|tesla|byd)\b/i, fact)
    || factMatches(/\b(ev|electric vehicle|automotive|charging)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('automotive', index);
  }

  if (
    factMatches(/\b(lawsuit|regulator|regulation|court|antitrust|fine\b|ban\b|legislation|congress|parliament|eu commission|tariff)\b/i, fact)
    || factMatches(/\b(regulation|lawsuit|court|antitrust)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('regulation', index);
  }

  if (
    factMatches(/\b(solar|wind turbine|battery storage|renewable|nuclear plant|power grid|energy)\b/i, fact)
    || factMatches(/\b(solar|wind|battery|renewable|energy)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('energy', index);
  }

  if (
    factMatches(/\b(language model|llm|parameters|training model|developing a .* model|bytedance|trillion)\b/i, fact)
    || factMatches(/\b(llm|language model|bytedance)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('coverAiDevelopment', index);
  }

  if (
    factMatches(/\b(browser|surf the internet|kitesurf|web agent|cloudflare)\b/i, fact)
    || factMatches(/\b(browser|kitesurf|cloudflare)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('coverWebLaunch', index);
  }

  if (
    factMatches(/\b(ai agent|virtual assistant|personal assistant|autonomous agent|virtual machine|digital assistant|muse)\b/i, fact)
    || factMatches(/\b(агент|віртуальн|асистент|штучн)\b/i, fact)
    || factMatches(/\b(ai agent|virtual assistant|muse)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('coverAiAgent', index);
  }

  if (
    factMatches(/\b(chatgpt|gpt|openai|reasoning|adaptiv|direct response|subscription|pricing|tariff)\b/i, fact)
    || factMatches(/\b(chatgpt|gpt|openai|reasoning)\b/i, entityText)
  ) {
    return pickCoverSafeVisualVariant('coverAiLaunch', index);
  }

  if (!subject || isGenericItCliche(subject)
    || matchesVisualSafetyPattern(UI_VISUAL_RE, subject)
    || matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, subject)) {
    return pickCoverSafeVisualVariant('coverDefault', index);
  }

  return subject;
}

/** Pick a text-free visual subject from the factual news content. */
export function buildSafeVisualSubject({
  visualSubject,
  coreFact,
  entities = [],
  index = 0,
  look = 'reel',
} = {}) {
  if (normalizeVisualLook(look) === 'cover') {
    return buildCoverSafeVisualSubject({ visualSubject, coreFact, entities, index });
  }

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
    return pickSafeVisualVariant('mapFeatureRemoval', index);
  }

  if (
    factMatches(/\b(chip|semiconductor|wafer|gpu|cpu|processor|foundry|tsmc|nvidia|intel|amd)\b/i, fact)
    || factMatches(/\b(chip|semiconductor|wafer|gpu|cpu|processor)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('chipHardware', index);
  }

  if (
    factMatches(/\b(robot|robotics|humanoid|drone|autonomous vehicle|self-driving|warehouse bot)\b/i, fact)
    || factMatches(/\b(robot|robotics|humanoid|drone)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('robotics', index);
  }

  if (
    factMatches(/\b(breach|hack|ransomware|cyber|security|vulnerability|exploit|malware|firewall)\b/i, fact)
    || factMatches(/\b(security|cyber|breach|hack)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('security', index);
  }

  if (
    factMatches(/\b(rocket|launch pad|orbit|spacecraft|satellite constellation|nasa|spacex)\b/i, fact)
    || factMatches(/\b(rocket|orbit|spacecraft|satellite)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('space', index);
  }

  if (
    factMatches(/\b(electric vehicle|ev\b|charging station|automotive|car maker|tesla|byd)\b/i, fact)
    || factMatches(/\b(ev|electric vehicle|automotive|charging)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('automotive', index);
  }

  if (
    factMatches(/\b(lawsuit|regulator|regulation|court|antitrust|fine\b|ban\b|legislation|congress|parliament|eu commission)\b/i, fact)
    || factMatches(/\b(regulation|lawsuit|court|antitrust)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('regulation', index);
  }

  if (
    factMatches(/\b(solar|wind turbine|battery storage|renewable|nuclear plant|power grid|energy)\b/i, fact)
    || factMatches(/\b(solar|wind|battery|renewable|energy)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('energy', index);
  }

  if (
    factMatches(/\b(language model|llm|parameters|training model|developing a .* model|bytedance|trillion)\b/i, fact)
    || factMatches(/\b(llm|language model|bytedance)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('aiModelDevelopment', index);
  }

  if (
    factMatches(/\b(chatgpt|gpt|openai|reasoning|assistant|adaptiv|direct response)\b/i, fact)
    || factMatches(/\b(chatgpt|gpt|openai|reasoning|assistant)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('aiAssistantUpdate', index);
  }

  if (
    factMatches(/\b(browser|surf the internet|kitesurf|web agent|cloudflare)\b/i, fact)
    || factMatches(/\b(browser|kitesurf|cloudflare)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('aiBrowserLaunch', index);
  }

  if (isSafeCustomVisualSubject(rawSubject)) {
    return subject;
  }

  if (!subject || UI_VISUAL_RE.test(subject) || TEXT_PRONE_VISUAL_RE.test(subject)) {
    return pickSafeVisualVariant('default', index);
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

const COVER_PHOTOGRAPHY_STYLES = [
  'Shot as a bold editorial cover photo with a single dominant subject filling the frame.',
  'Shot as a vivid environmental scene with strong foreground subject and colorful background depth.',
  'Shot as a punchy low-angle hero frame with dramatic perspective and saturated color.',
  'Shot as a crisp macro detail with shallow depth of field and luminous highlights.',
  'Shot as a wide cinematic frame with layered depth and one clear focal subject.',
];

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

export function pickCoverPhotographyStyle(index = 0) {
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return COVER_PHOTOGRAPHY_STYLES[i % COVER_PHOTOGRAPHY_STYLES.length];
}

export function buildAtmosphereClause({ newsTone, coreFact, index = 0, look = 'reel' } = {}) {
  const tone = resolveNewsTone({ newsTone, coreFact });
  const visualLook = normalizeVisualLook(look);
  const palette = pickVisualPalette({ newsTone: tone, coreFact, index });
  const spaceHint = visualLook === 'cover'
    ? 'Fill the frame with a bold concrete subject. No empty gray void, no washed-out sky as the only content.'
    : 'Keep the upper third of the frame uncluttered — negative space only, never paint any writing there.';
  const style = visualLook === 'cover'
    ? `${COVER_COLOR_RULES} ${pickCoverPhotographyStyle(index)}`
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
  const safeSubject = buildSafeVisualSubject({ visualSubject, coreFact: fact, entities, index, look });
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
  const safeSubject = buildSafeVisualSubject({ visualSubject, coreFact, entities, index, look });
  const sanitizedSubject = sanitizeTextForImagePrompt(visualSubject);
  const coverCliche = look === 'cover' && (
    isGenericItCliche(prompt)
    || isGenericItCliche(visualSubject)
    || isGenericItCliche(safeSubject)
  );
  const nonEnglishCover = look === 'cover' && (containsCyrillic(prompt) || containsCyrillic(visualSubject));
  const needsRebuild = !prompt
    || promptHasBannedMetaphor(prompt)
    || promptHasBannedMetaphor(visualSubject)
    || nonEnglishCover
    || coverCliche
    || (!isSemanticallyGrounded && !isSafeCustomVisualSubject(visualSubject, { look }))
    || matchesVisualSafetyPattern(UI_TEXT_RE, prompt)
    || matchesVisualSafetyPattern(UI_TEXT_RE, visualSubject)
    || matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, prompt)
    || matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, visualSubject)
    || (safeSubject !== sanitizedSubject && !isSafeCustomVisualSubject(visualSubject, { look }))
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
