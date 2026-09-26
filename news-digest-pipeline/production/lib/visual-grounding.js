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

/** Computer hardware stock. Cover photos of racks and PCs do not depict the news. */
const COVER_COMPUTER_RE =
  /\b(server closet|server rack|server room|server hall|data center|datacenter|network appliance|firewall-style|firewall rack|gaming pc|pc tower|workstation|gpu server)\b/i;

function pickCoverObjectVariant(category, index = 0) {
  const variants = (SAFE_VISUAL_VARIANTS[category] || [])
    .filter((line) => !COVER_COMPUTER_RE.test(line));
  if (!variants.length) return '';
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return variants[i % variants.length];
}

/** Generic stock cover scenes the visual LLM is told to avoid — not topic routing. */
const COVER_STOCK_CLICHE_RE =
  /\b(computing workstation|modular computing|crystal prism|generic ai workstation|presenter on stage|coffee on desk|colorful LED indicators on a bright studio desk|headshot|portrait of|close-up of a (man|woman|person)|man in a (red )?hat|red baseball cap|unidentified (man|person)|random (man|person)|stock photo of a (man|woman)|gaming pc|rgb pc|custom pc|pc tower|beige pc tower|modern gaming rig|urban rooftop|rooftop with antennas|blank equipment boxes)\b/i;

const PRIVACY_FACT_RE =
  /\b(contractor|subcontractor|live chats?|user chats?|confidential|privacy leak|human reviewer|content moderator)\b/i;
const PRIVACY_FACT_UK_RE = /підрядник|конфіденц|живі чати|чати користувач/i;
const AI_SAFETY_INCIDENT_RE =
  /\b(troubling behavior|decept(?:ion|ive)|hid(?:e|den)? errors?|fabricat(?:e|ed|ing) data|access(?:ed|ing)? api keys?|misbehav(?:e|ior)|safety incident)\b/i;
const GAMING_FACT_RE =
  /\b(doom|video game|arcade cabinet|operating system from scratch|wrote an os|wrote an operating system)\b/i;
const GAMING_FACT_UK_RE = /операційн[ау]\s+систем|запускає\s+Doom|\bDoom\b/i;
const FINANCE_FACT_RE =
  /\b(bank(?:ing)?|bank account|checking account|salary|payroll|paycheck|wallet|payment|fintech|money|finance|financial|debit|credit card)\b/i;
const FINANCE_FACT_UK_RE = /зарплат|банківськ|\bбанк\b|рахунок|гаманець|платіж|грош/i;
const AI_POLICY_DEBATE_RE =
  /\b(extinction|existential|doomer|end of (the )?world|ai threat|humanity|overhype|regulation scare)\b/i;
const AI_POLICY_DEBATE_UK_RE = /вимиранн|апокаліпсис|кінець світу|загроз[аи]\s+вим/i;
const MILITARY_NEAR_MISS_RE =
  /літак|судно|корабл|абордаж|fighter jets?|military aircraft|warship|cargo ship|naval vessel/i;
const COMPANY_BREACH_UK_RE = /зламав|злам|парол|креденшал/i;
const AI_SELF_BUILD_RE =
  /будує сам себе|наступну версію|тисяч\w* агент|swarm of agents|builds the next version|agents? (?:to )?build/i;

const SAFE_VISUAL_VARIANTS = {
  aiSafetyIncident: [
    'Red-lit forensic AI safety laboratory examining an unmarked black compute module beside blank metal security keys and a glowing warning beacon, bright editorial lighting, no screens no typography no logos no watermarks',
    'Sealed evidence tray holding an unmarked compute module and blank access tokens beneath a vivid amber warning light in an AI safety lab, no screens no labels no logos no watermarks',
    'Forensic technician placing blank metal security keys into an evidence bag beside an isolated unmarked compute module, dramatic red and cyan lab lighting, no screens no typography no watermarks',
    'AI safety test chamber with an unmarked compute module isolated behind glass, bright red warning beacon and blank access tokens on the inspection bench, no screens no labels no watermarks',
  ],
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
  gaming: [
    '1990s beige desktop with a curved CRT monitor showing a blocky first-person corridor game in green and brown pixels, unlabeled gamepad on the desk, warm room light, no logos no HUD text no watermarks',
    'Unlabeled black game controller in front of a CRT with phosphor-green glow in a teal rec room, saturated retro light, no brand marks no screen text no watermarks',
    'Hands on an unlabeled arcade stick under vivid neon cabinet light, blocky pixel corridor on the screen without readable text, no logos no score digits no watermarks',
    'Bare green circuit board with fresh solder joints beside floppy disks on a bright workbench, DIY operating-system build metaphor, no silkscreen text no labels no watermarks',
  ],
  finance: [
    'Open unmarked leather wallet beside a stack of blank cash envelopes on a sunlit desk, vivid paper whites, closed laptop with a dark blank screen in the background, no bank logos no numerals no watermarks',
    'Hands tucking a blank payment card into a worn wallet next to sealed cash envelopes, warm window light, no card numbers no bank names no screens no watermarks',
    'Heavy bank vault door ajar with warm light on shelves of blank envelopes, teal and amber contrast, no combination numerals no engraved text no watermarks',
    'Overhead shot of blank salary envelopes fanned on a bright oak desk beside a closed notebook, hard daylight, no printed names no currency numerals no watermarks',
  ],
  militaryNearMiss: [
    'Fighter jets flying low over a large cargo ship on a vivid blue sea at sunset, no hull names no tail insignia no flags with emblems no watermarks',
    'Two military aircraft banking above a freighter on a bright ocean, saturated amber light and white wake, no markings no readable numbers no watermarks',
    'Cargo ship on open water with jets visible high in a dramatic teal and gold sky, no national flags no ship lettering no watermarks',
  ],
  aiSelfBuild: [
    'Robotic arms assembling rows of identical unmarked compute modules on a bright factory line, saturated daylight, no screens no labels no logos no watermarks',
    'A line of blank metal modules moving toward a robotic assembler in a sunlit clean room, vivid teal and amber light, no typography no screens no watermarks',
    'Close-up of a robot gripper placing an unmarked compute block onto a growing stack of identical blocks, punchy studio light, no labels no logos no watermarks',
  ],
  aiPolicyDebate: [
    'Empty sunlit lecture hall with a wooden podium and rows of vacant chairs, vivid window light, no slides no screens no typography no watermarks',
    'Wooden gavel and blank folders on a bright mahogany table, shallow depth of field, no engraved text no document titles no watermarks',
    'Researchers around a sunlit conference table with closed unmarked notebooks, colorful sticky flags without writing, no laptops facing camera no screens no watermarks',
    'Scales of justice silhouette against a colorful sunset sky, dramatic contrast, no engraved letters no courthouse signage no watermarks',
  ],
  default: [
    'Sunlit technology scene with unmarked hardware, warm daylight and vivid color, no screens dials labels symbols typography or watermarks',
    'Bright makerspace workbench with colorful tools and blank metal prototypes, saturated daylight, no printed labels no screens no watermarks',
    'Close-up of copper heat pipes and vivid coolant tubes on open unmarked hardware, shallow depth of field, punchy warm daylight, no stickers no serial numbers no watermarks',
    'Macro of colorful fiber and copper cables organized in a bright cable tray, punchy contrast, no port labels no tags no watermarks',
  ],
};

/** @deprecated Use pickSafeVisualVariant — kept for tests that reference exact strings. */
export const SAFE_VISUALS = Object.fromEntries(
  Object.entries(SAFE_VISUAL_VARIANTS).map(([key, variants]) => [key, variants[0]]),
);

function pickSafeVisualVariant(category, index = 0) {
  const variants = SAFE_VISUAL_VARIANTS[category] || SAFE_VISUAL_VARIANTS.default;
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

  if (isMilitaryNearMissStory({ coreFact: fact })) {
    return ' Depict: military aircraft sent toward a ship after a faulty automated report.';
  }
  if (isCompanyBreachStory({ coreFact: fact })) {
    return ' Depict: an AI test broke into company systems and collected credentials.';
  }
  if (isAiSelfBuildStory({ coreFact: fact })) {
    return ' Depict: swarms of AI agents building the next version of a model.';
  }
  if (isFinanceStory({ coreFact: fact }) || FINANCE_FACT_UK_RE.test(fact)) {
    return ' Depict: a chatbot connected to a bank account and salary payments.';
  }
  if (isAiPolicyDebateStory({ coreFact: fact }) || AI_POLICY_DEBATE_UK_RE.test(fact)) {
    return ' Depict: a public debate about AI risk and regulation.';
  }
  if (/\b(discontinu|removed|shut\s?down|deprecated|killed)\b/i.test(fact)) {
    return ' Depict: a major tech feature was removed after launch.';
  }
  if (/\b(launch|release|update|introduc|unveil|debuts?)\b/i.test(fact)) {
    return ' Depict: a major technology product update.';
  }
  if (/\b(develop|building|training|parameters|language model|llm)\b/i.test(fact)) {
    return ' Depict: large-scale AI model development.';
  }
  if (/\b(browser|surf the web|web agent|browser agent|kitesurf)\b/i.test(fact)) {
    return ' Depict: a new AI web browsing tool launch.';
  }
  if (
    /\b(ai agent|virtual assistant|personal assistant|autonomous agent|virtual machine|digital assistant|muse)\b/i.test(fact)
    || containsCyrillic(fact)
  ) {
    if (/\b(агент|віртуальн|асистент|штучн)\b/i.test(fact)
      || /\b(ai agent|virtual assistant|muse)\b/i.test(fact)) {
      return ' Depict: a new autonomous AI assistant technology.';
    }
  }
  if (containsCyrillic(fact)) {
    return ' Depict: a technology industry news story.';
  }
  return ` Depict: ${sanitizeTextForImagePrompt(fact)}.`;
}

const SAFE_VISUAL_VALUES = new Set(
  Object.values(SAFE_VISUAL_VARIANTS).flatMap((variants) => variants),
);

function isKnownSafeVisual(subject) {
  const value = String(subject || '').trim();
  return SAFE_VISUAL_VALUES.has(value);
}

export function isSafeCustomVisualSubject(subject, { look = 'reel', coreFact = '' } = {}) {
  const raw = String(subject || '').trim();
  if (!raw || raw.length < 20) return false;
  if (containsCyrillic(raw)) return false;
  if (normalizeVisualLook(look) === 'cover' && isCoverHeadlineSubject(raw, coreFact)) return false;
  if (normalizeVisualLook(look) === 'cover' && COVER_COMPUTER_RE.test(raw)) return false;
  if (normalizeVisualLook(look) === 'cover' && isGenericItCliche(raw)) return false;
  if (normalizeVisualLook(look) === 'cover' && COVER_STOCK_CLICHE_RE.test(raw)) return false;
  if (isKnownSafeVisual(raw)) return true;
  if (BANNED_RE.test(raw)) return false;
  if (matchesVisualSafetyPattern(UI_VISUAL_RE, raw)) return false;
  if (matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, raw)) return false;
  if (/abstract (ai |digital )?(vortex|background|swirl|eye)/i.test(raw)) return false;
  const sanitized = sanitizeTextForImagePrompt(raw);
  return sanitized.length >= 20;
}

function stripCoverSafetyInstructions(text) {
  return String(text || '')
    .replace(/\b(no|without|never)\s+(readable\s+)?(text|labels?|typography|writing|words|logos?|watermarks?|captions?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrivacyStory({ coreFact = '', entities = [] } = {}) {
  const entityText = (Array.isArray(entities) ? entities : []).join(' ');
  return PRIVACY_FACT_RE.test(coreFact)
    || PRIVACY_FACT_UK_RE.test(coreFact)
    || PRIVACY_FACT_RE.test(entityText)
    || PRIVACY_FACT_UK_RE.test(entityText);
}

function isGamingStory({ coreFact = '', entities = [] } = {}) {
  const entityText = (Array.isArray(entities) ? entities : []).join(' ');
  return GAMING_FACT_RE.test(coreFact)
    || GAMING_FACT_UK_RE.test(coreFact)
    || GAMING_FACT_RE.test(entityText)
    || GAMING_FACT_UK_RE.test(entityText);
}

function isFinanceStory({ coreFact = '', entities = [] } = {}) {
  const entityText = (Array.isArray(entities) ? entities : []).join(' ');
  return FINANCE_FACT_RE.test(coreFact)
    || FINANCE_FACT_UK_RE.test(coreFact)
    || FINANCE_FACT_RE.test(entityText)
    || FINANCE_FACT_UK_RE.test(entityText);
}

function isAiPolicyDebateStory({ coreFact = '', entities = [] } = {}) {
  const entityText = (Array.isArray(entities) ? entities : []).join(' ');
  return AI_POLICY_DEBATE_RE.test(coreFact)
    || AI_POLICY_DEBATE_UK_RE.test(coreFact)
    || AI_POLICY_DEBATE_RE.test(entityText)
    || AI_POLICY_DEBATE_UK_RE.test(entityText);
}

function storyCorpus({ coreFact = '', entities = [], sourceText = '' } = {}) {
  const entityText = (Array.isArray(entities) ? entities : []).join(' ');
  return `${coreFact}\n${sourceText}\n${entityText}`;
}

function isMilitaryNearMissStory(input) {
  return MILITARY_NEAR_MISS_RE.test(storyCorpus(input));
}

function isCompanyBreachStory(input) {
  const corpus = storyCorpus(input);
  return COMPANY_BREACH_UK_RE.test(corpus)
    || /\b(breach|hack(?:ed|ing)?|ransomware|credentials|passwords?)\b/i.test(corpus);
}

function isAiSelfBuildStory(input) {
  return AI_SELF_BUILD_RE.test(storyCorpus(input));
}

function pickGamingCoverVariant({ coreFact = '', index = 0 } = {}) {
  const osBuild = /\b(operating system|wrote an os|from scratch|операційн)/i.test(String(coreFact || ''));
  const variantIndex = osBuild ? 3 : 0;
  return pickSafeVisualVariant('gaming', variantIndex);
}

export function buildSafeCoverVisualSubject({
  visualSubject,
  coreFact,
  entities = [],
  sourceText = '',
  index = 0,
} = {}) {
  const story = { coreFact, entities, sourceText };
  const objectScene = (category) => pickCoverObjectVariant(category, index);
  if (AI_SAFETY_INCIDENT_RE.test(String(coreFact || '')) || AI_SAFETY_INCIDENT_RE.test(String(sourceText || ''))) {
    return objectScene('aiSafetyIncident') || photographOfStory(coreFact);
  }
  if (isPrivacyStory({ coreFact, entities })) {
    return objectScene('security') || photographOfStory(coreFact);
  }
  if (isGamingStory({ coreFact, entities })) {
    return pickGamingCoverVariant({ coreFact, index });
  }
  if (isFinanceStory({ coreFact, entities })) {
    return objectScene('finance') || photographOfStory(coreFact);
  }
  if (isAiPolicyDebateStory({ coreFact, entities })) {
    return objectScene('aiPolicyDebate') || photographOfStory(coreFact);
  }
  if (isMilitaryNearMissStory(story)) {
    return objectScene('militaryNearMiss') || photographOfStory(coreFact);
  }
  if (isCompanyBreachStory(story)) {
    return objectScene('security') || photographOfStory(coreFact);
  }
  if (isAiSelfBuildStory(story)) {
    return objectScene('aiSelfBuild') || photographOfStory(coreFact);
  }

  const subject = String(visualSubject || '').trim();
  if (
    isSafeCustomVisualSubject(subject, { look: 'cover', coreFact })
    && !containsCyrillic(subject)
    && !isGenericItCliche(subject)
    && !COVER_STOCK_CLICHE_RE.test(subject)
  ) {
    return sanitizeTextForImagePrompt(subject);
  }

  // Uncategorized news used to fall through to a headline sentence or a
  // datacenter/cable stock photo. Photograph this story's own objects instead.
  return photographOfStory(coreFact);
}

function normalizeForCompare(text) {
  return sanitizeTextForImagePrompt(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COVER_SCENE_RE =
  /\b(hands?|desk|table|room|hall|workbench|bench|close-up|macro|overhead|sunlit|daylight|window light|studio|laboratory|lab|wallet|envelope|vault|jet|jets|aircraft|ship|freighter|hinge|luggage|passport|podium|gavel|conference|photograph|photo of|holding|placing|tucking|folded|half-open)\b/i;

const COVER_NEWS_VERB_RE =
  /\b(released?|announc\w+|report\w+|outperform\w+|unveiled?|introduced?|launched?|updated?|develop\w+|testing|tested|said|says|removed|discontinued|debut\w+)\b/i;

function contentWordOverlap(left, right) {
  const stop = new Set(['a', 'an', 'the', 'with', 'and', 'that', 'which', 'for', 'from', 'into', 'its', 'their', 'new', 'this', 'was', 'were', 'are', 'has', 'have', 'had', 'after', 'during', 'than', 'can', 'could']);
  const words = (value) => normalizeForCompare(value).split(' ').filter((word) => word.length > 2 && !stop.has(word));
  const leftWords = words(left);
  const rightWords = new Set(words(right));
  if (!leftWords.length || !rightWords.size) return 0;
  const shared = leftWords.filter((word) => rightWords.has(word)).length;
  return shared / leftWords.length;
}

/** A cover subject must be a photograph. A sentence that restates the news is not one. */
export function isCoverHeadlineSubject(subject, coreFact = '') {
  const value = String(subject || '').trim();
  if (!value) return true;
  if (isFactDumpSubject(value, coreFact)) return true;
  const scene = COVER_SCENE_RE.test(value);
  if (scene && contentWordOverlap(value, coreFact) < 0.85) return false;
  if (COVER_NEWS_VERB_RE.test(value) && !scene) return true;
  if (coreFact && contentWordOverlap(value, coreFact) >= 0.6 && !scene) return true;
  return false;
}

function photographOfStory(coreFact) {
  const stop = /\b(a|an|the|with|and|that|which|for|from|into|its|their|new|this|to|of|on|in|by|after|during|than|was|were|are|has|have|had|can|could|will|just|also)\b/gi;
  let text = sanitizeTextForImagePrompt(coreFact);
  text = text.replace(/[\u0400-\u04FF]+/g, ' ');
  text = text.replace(COVER_NEWS_VERB_RE, ' ');
  text = text.replace(/\b(oled\s+)?screens?\b/gi, 'blank glass panels');
  text = text.replace(TEXT_PRONE_VISUAL_RE, ' ');
  text = text.replace(UI_VISUAL_RE, ' ');
  text = text.replace(stop, ' ');
  text = text.replace(/[^a-z0-9\s-]/gi, ' ').replace(/\s+/g, ' ').trim();
  const objects = text.length >= 8 ? text : 'the tangible objects named in this news story';
  const fold = /\bfold/i.test(objects)
    ? ' Show one hinged device half-open on a sunlit table, blank glass, no icons.'
    : '';
  return `Editorial photograph of ${objects}, real physical objects in warm daylight, one clear subject filling the frame, blank surfaces, no readable text, no logos, no interface.${fold}`;
}

function isFactDumpSubject(subject, coreFact) {
  const a = normalizeForCompare(subject);
  const b = normalizeForCompare(coreFact);
  if (!a || !b) return false;
  if (a === b) return true;
  const aWords = a.split(' ').filter(Boolean);
  const bWords = b.split(' ').filter(Boolean);
  if (aWords.length >= 6 && b.includes(a)) return true;
  if (bWords.length >= 6 && a.includes(b)) return true;
  return false;
}

export function coverSubjectNeedsFallback(subject, prompt, coreFact = '') {
  const value = stripCoverSafetyInstructions(String(subject || '').trim());
  const promptValue = stripCoverSafetyInstructions(String(prompt || '').trim());
  if (!value || containsCyrillic(value) || containsCyrillic(promptValue)) return true;
  if (isCoverHeadlineSubject(value, coreFact) || isCoverHeadlineSubject(promptValue, coreFact)) return true;
  if (isFactDumpSubject(value, coreFact) || isFactDumpSubject(promptValue, coreFact)) return true;
  if (promptHasBannedMetaphor(value) || promptHasBannedMetaphor(promptValue)) return true;
  if (isGenericItCliche(value) || isGenericItCliche(promptValue)) return true;
  if (COVER_COMPUTER_RE.test(value) || COVER_COMPUTER_RE.test(promptValue)) return true;
  if (COVER_STOCK_CLICHE_RE.test(value) || COVER_STOCK_CLICHE_RE.test(promptValue)) return true;
  if (matchesVisualSafetyPattern(UI_VISUAL_RE, value) || matchesVisualSafetyPattern(UI_VISUAL_RE, promptValue)) {
    return true;
  }
  if (matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, value)
    || matchesVisualSafetyPattern(TEXT_PRONE_VISUAL_RE, promptValue)) {
    return true;
  }
  return false;
}

/** Facebook cover: trust the visual LLM, only sanitize and append atmosphere. */
export function groundCoverVariant(variant, index = 0) {
  if (!variant || typeof variant !== 'object') return variant;

  const entities = Array.isArray(variant.entities)
    ? variant.entities.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const coreFact = String(variant.coreFact || '').trim();
  const newsTone = resolveNewsTone({ newsTone: variant.newsTone, coreFact });
  let visualSubject = String(variant.visualSubject || '').trim();
  let prompt = String(variant.prompt || '').trim();
  const story = { coreFact, entities, sourceText: variant.sourceText };
  const storySubject = isMilitaryNearMissStory(story)
    ? pickCoverObjectVariant('militaryNearMiss', hashVisualSeed(coreFact))
    : isCompanyBreachStory(story)
      ? pickCoverObjectVariant('security', hashVisualSeed(coreFact))
      : isAiSelfBuildStory(story)
        ? pickCoverObjectVariant('aiSelfBuild', hashVisualSeed(coreFact))
        : '';
  const subjectMissesStory = storySubject && !/jet|aircraft|ship|freighter|vault|padlock|security key|robotic arm|compute module|assembler/i.test(visualSubject);

  if (subjectMissesStory || coverSubjectNeedsFallback(visualSubject, prompt, coreFact)) {
    visualSubject = buildSafeCoverVisualSubject({
      visualSubject,
      coreFact,
      entities,
      sourceText: variant.sourceText,
      index: hashVisualSeed(coreFact),
    });
    prompt = '';
  } else {
    visualSubject = sanitizeTextForImagePrompt(visualSubject);
  }

  if (!prompt) {
    prompt = buildGroundedPrompt({
      visualSubject,
      coreFact,
      entities,
      newsTone,
      index,
      look: 'cover',
    });
  } else {
    prompt = finalizeImagePrompt(prompt, { newsTone, coreFact, index, look: 'cover' });
  }

  return {
    ...variant,
    coreFact,
    entities,
    visualSubject,
    newsTone,
    look: 'cover',
    prompt,
  };
}

/** Pick a text-free visual subject from the factual news content. */
export function buildSafeVisualSubject({
  visualSubject,
  coreFact,
  entities = [],
  index = 0,
  look = 'reel',
} = {}) {
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

  if (isFinanceStory({ coreFact: fact, entities })) {
    return pickSafeVisualVariant('finance', index);
  }
  if (isAiPolicyDebateStory({ coreFact: fact, entities })) {
    return pickSafeVisualVariant('aiPolicyDebate', index);
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
    factMatches(/\b(chatgpt|gpt|openai|claude|anthropic|reasoning|assistant|adaptiv|direct response)\b/i, fact)
    || factMatches(/\b(chatgpt|gpt|openai|claude|anthropic|reasoning|assistant)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('aiAssistantUpdate', index);
  }

  if (
    factMatches(/\b(browser|surf the internet|kitesurf|web agent|cloudflare)\b/i, fact)
    || factMatches(/\b(browser|kitesurf|cloudflare)\b/i, entityText)
  ) {
    return pickSafeVisualVariant('aiBrowserLaunch', index);
  }

  if (isSafeCustomVisualSubject(rawSubject, { look, coreFact: fact })) {
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

export function buildGroundedPrompt({
  visualSubject, coreFact, entities = [], newsTone, index = 0, look = 'reel',
} = {}) {
  const fact = String(coreFact || '').trim();
  const visualLook = normalizeVisualLook(look);
  const incomingSubject = String(visualSubject || '').trim();
  const safeSubject = visualLook === 'cover'
    ? (incomingSubject && !containsCyrillic(incomingSubject) && !COVER_STOCK_CLICHE_RE.test(incomingSubject)
      ? incomingSubject
      : buildSafeCoverVisualSubject({
        visualSubject,
        coreFact: fact,
        entities,
        index: hashVisualSeed(fact),
      }))
    : buildSafeVisualSubject({ visualSubject, coreFact: fact, entities, index, look: visualLook });
  const factClause = visualLook === 'cover' ? '' : buildImageFactClause(fact);
  const tone = resolveNewsTone({ newsTone, coreFact: fact });

  const scene = factClause ? `${safeSubject}.${factClause}` : safeSubject;
  return (
    `${scene} ` +
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
    .replace(BRAND_TOKEN_RE, visualLook === 'cover' ? '' : 'AI technology')
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
  if (normalizeVisualLook(variant.look) === 'cover') {
    return groundCoverVariant(variant, index);
  }

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
  const safeSubject = buildSafeVisualSubject({
    visualSubject, coreFact, entities, index, look,
  });
  const sanitizedSubject = sanitizeTextForImagePrompt(visualSubject);
  const coverCliche = look === 'cover' && (
    isGenericItCliche(prompt)
    || isGenericItCliche(visualSubject)
    || isGenericItCliche(safeSubject)
  );
  const needsRebuild = !prompt
    || promptHasBannedMetaphor(prompt)
    || promptHasBannedMetaphor(visualSubject)
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
    prompt = buildGroundedPrompt({
      visualSubject: safeSubject, coreFact, entities, newsTone, index, look,
    });
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
