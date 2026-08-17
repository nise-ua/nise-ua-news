/**
 * Prepare Ukrainian TTS text so Latin brand names and tech terms sound natural
 * with uk-UA-PolinaNeural / edge-tts. On-screen headlines stay unchanged; only
 * the spoken script is transformed.
 *
 * Strategy:
 * - Known brands → Ukrainian phonetic Cyrillic (Клоудфлейр, not mangled Latin).
 * - English names and acronyms → Ukrainian phonetics that preserve the English
 *   pronunciation (AI → Ей-Ай, Google → Ґуґл).
 * - Remaining Latin tokens → English-style phonetic transliteration.
 */

/** Terms that sound acceptable when read as Latin by Ukrainian neural TTS. */
const KEEP_LATIN = new Set([
  'ar', 'css', 'html', 'http', 'https', 'ios', 'it', 'json', 'ml', 'npm',
  'pdf', 'ram', 'sql', 'ssd', 'ui', 'url', 'usb', 'ux', 'vr', 'wifi',
  'wi-fi', '5g', '4k', '3d', '2d', 'ceo', 'cto',
]);

/**
 * Longer brand/product names where Latin script produces bad Ukrainian TTS.
 * Keys are lowercase; values are phonetic Ukrainian Cyrillic.
 */
const PRONUNCIATION_MAP = new Map([
  ['ai', 'Ей-Ай'],
  ['api', 'Ей-Пі-Ай'],
  ['cpu', 'Сі-Пі-Ю'],
  ['gpu', 'Джі-Пі-Ю'],
  ['gpt', 'Джі-Пі-Ті'],
  ['llm', 'Ел-Ел-Ем'],
  ['openai', 'Оупен Ей-Ай'],
  ['cloudflare', 'Клоудфлейр'],
  ['bytedance', 'Байтденс'],
  ['chatgpt', 'Чат Джі-Пі-Ті'],
  ['hugging face', 'Хагінг Фейс'],
  ['huggingface', 'Хагінг Фейс'],
  ['google', 'Ґуґл'],
  ['gemini', 'Джеміні'],
  ['claude', 'Клод'],
  ['microsoft', 'Майкрософт'],
  ['apple', 'Епл'],
  ['meta', 'Мета'],
  ['facebook', 'Фейсбук'],
  ['instagram', 'Інстаграм'],
  ['tiktok', 'ТікТок'],
  ['youtube', 'Ютуб'],
  ['netflix', 'Нетфлікс'],
  ['amazon', 'Амазон'],
  ['twitter', 'Твіттер'],
  ['github', 'Гітхаб'],
  ['kitesurf', 'Кайтсерф'],
  ['falcon', 'Фалкон'],
  ['esp32', 'І-Ес-Пі 32'],
  ['spacex', 'Спейс Ікс'],
  ['starlink', 'Старлінк'],
  ['nvidia', 'Енвідія'],
  ['intel', 'Інтел'],
  ['amd', 'Ей-Ем-Ді'],
  ['tesla', 'Тесла'],
  ['anthropic', 'Антропік'],
  ['perplexity', 'Перплексіті'],
  ['deepseek', 'Діпсік'],
  ['mistral', 'Містрал'],
  ['copilot', 'Копайлот'],
  ['android', 'Андроїд'],
  ['iphone', 'Айфон'],
  ['ipad', 'Айпад'],
  ['macbook', 'Макбук'],
  ['windows', 'Віндовс'],
  ['linux', 'Лінукс'],
  ['ubuntu', 'Убунту'],
  ['docker', 'Докер'],
  ['kubernetes', 'Кубернетес'],
  ['cloud', 'клоуд'],
  ['flare', 'флейр'],
]);

/** English digraphs → Ukrainian phonetics (order matters). */
const ENGLISH_PHONETIC_RULES = [
  ['tion', 'шн'],
  ['sion', 'жн'],
  ['ough', 'о'],
  ['ight', 'айт'],
  ['igh', 'ай'],
  ['ph', 'ф'],
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['th', 'т'],
  ['wh', 'в'],
  ['ck', 'к'],
  ['qu', 'кв'],
  ['ee', 'і'],
  ['ea', 'і'],
  ['oo', 'у'],
  ['ou', 'ау'],
  ['ow', 'ау'],
  ['oy', 'ой'],
  ['ay', 'ей'],
  ['ey', 'ей'],
  ['ai', 'ей'],
  ['au', 'о'],
  ['oi', 'ой'],
  ['ue', 'ю'],
  ['ie', 'і'],
];

const CHAR_MAP = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
  i: 'і', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс',
  y: 'і', z: 'з',
};

const UKRAINIAN_ONES = [
  'нуль', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять",
];

const UKRAINIAN_TEENS = [
  'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', 'пятнадцять',
  'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять",
];

const UKRAINIAN_TENS = [
  '', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят',
  'вісімдесят', "дев'яносто",
];

/** Speak a non-negative integer in Ukrainian (0–99). */
function numberToUkrainian(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0 || num > 99) return String(n);
  if (num < 10) return UKRAINIAN_ONES[num];
  if (num < 20) return UKRAINIAN_TEENS[num - 10];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return ones === 0 ? UKRAINIAN_TENS[tens] : `${UKRAINIAN_TENS[tens]} ${UKRAINIAN_ONES[ones]}`;
}

/**
 * Turn decimal version numbers into spoken Ukrainian so TTS says
 * "п'ять крапка шість" instead of "п'ятдесят шість" (GPT-5.6 → GPT 56 bug).
 */
function replaceDecimalVersions(text) {
  let result = text;

  // Brand/model tokens with version: GPT-5.6, Claude-3.5, Wi-Fi 6.2
  result = result.replace(
    /\b([A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z][A-Za-z0-9]*)*)-(\d+)\.(\d+)\b/g,
    (_match, prefix, major, minor) =>
      `${prefix} ${numberToUkrainian(major)} крапка ${numberToUkrainian(minor)}`,
  );

  // Standalone decimals: 5.6, 3.14 (minor part capped at 2 digits for version-like numbers)
  result = result.replace(
    /\b(\d{1,2})\.(\d{1,2})\b/g,
    (_match, major, minor) => `${numberToUkrainian(major)} крапка ${numberToUkrainian(minor)}`,
  );

  return result;
}

function splitCamelCase(word) {
  return word
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function capitalizeUkrainian(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function transliterateEnglishWord(word) {
  let lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!lower) return word;

  for (const [pattern, replacement] of ENGLISH_PHONETIC_RULES) {
    lower = lower.replaceAll(pattern, replacement);
  }

  let result = '';
  for (const ch of lower) {
    if (CHAR_MAP[ch]) result += CHAR_MAP[ch];
    else if (/\d/.test(ch)) result += ch;
  }

  return capitalizeUkrainian(result || word);
}

function lookupPronunciation(token) {
  const key = token.toLowerCase().replace(/\s+/g, ' ').trim();
  if (PRONUNCIATION_MAP.has(key)) return PRONUNCIATION_MAP.get(key);

  // Do not split version tokens like GPT-5.6 on hyphens — that turns 5.6 into "56".
  if (/\d+\.\d+/.test(token)) return null;

  const parts = splitCamelCase(token);
  if (parts.length > 1) {
    const mapped = parts.map(part => {
      const partKey = part.toLowerCase();
      if (PRONUNCIATION_MAP.has(partKey)) return PRONUNCIATION_MAP.get(partKey);
      if (KEEP_LATIN.has(partKey)) return part;
      return transliterateEnglishWord(part);
    });
    if (mapped.some((value, i) => value !== parts[i])) {
      return mapped.join(' ');
    }
  }

  return null;
}

function replaceMappedPhrases(text) {
  let result = text;
  const phrases = [...PRONUNCIATION_MAP.keys()]
    .filter(key => key.includes(' '))
    .sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    result = result.replace(re, match => {
      const mapped = PRONUNCIATION_MAP.get(match.toLowerCase());
      return mapped || match;
    });
  }
  return result;
}

function replaceLatinToken(token) {
  const lower = token.toLowerCase();

  if (KEEP_LATIN.has(lower)) return token;

  const mapped = lookupPronunciation(token);
  if (mapped) return mapped;

  if (/^[A-Za-z][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(token) && token.length >= 3) {
    return transliterateEnglishWord(token);
  }

  return token;
}

/**
 * Transform text for Ukrainian TTS while leaving display copy untouched.
 * @param {string} text
 * @returns {string}
 */
export function prepareTtsText(text) {
  const source = String(text || '').trim();
  if (!source) return source;

  let result = replaceMappedPhrases(source);
  result = replaceDecimalVersions(result);

  // GPT-5.6, Wi-Fi, Falcon-9, etc. (version decimals already normalized above)
  result = result.replace(/\b[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*\b/g, replaceLatinToken);

  return result.replace(/\s+/g, ' ').trim();
}
