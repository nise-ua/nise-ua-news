/**
 * Sample digest fixtures covering formats used by image, reel, and audio pipelines.
 *
 * Image parser: line-based parseDigestArticles (handles "#news 1.", URLs on next line).
 * Reel/storyboard parser: regex parseDigestItems (numbered blocks, inline URLs).
 * Both strip the 🤖 disclaimer / hashtag footer and drop items shorter than 40 chars.
 */

export const SAMPLE_DIGEST = `#news
1. OpenAI оновив ChatGPT до GPT-5.6 Sol із адаптивною глибиною відповіді. Тепер можна регулювати, наскільки глибоко модель міркує.
https://openai.com/blog/gpt-5-6-sol

2. Google вимкнув AI-функцію в Google Earth, яка дозволяла змінювати супутникові знімки. Користувачі вже встигли згенерувати фейкові об'єкти.
https://blog.google/products/earth/ai-feature-removed

3. ByteDance розробляє мовну модель на 10 трильйонів параметрів. Це наступний крок після Doubao.
https://bytedance.com/llm

🤖 Згенеровано ШІ
#AI #News #технології`;

export const SAMPLE_DIGEST_HASH_PREFIX = `#news 1. Cloudflare запустив Kitesurf — браузер для ШІ-агентів, які самі ходять сайтами і збирають факти.
https://blog.cloudflare.com/kitesurf

#AI 2. Український розробник запустив повноцінну LLM на мікроконтролері ESP32 за десять доларів.
https://example.com/esp32-llm`;

export const SAMPLE_DIGEST_INLINE_URL = `1. Hugging Face зазнав атаки автономного AI-агента без оператора. https://huggingface.co/blog/incident Докладніше у звіті компанії.
2. Стара ракета Falcon 9 незабаром вріжеться в Місяць після багаторічної орбіти. https://nasa.gov/falcon9`;

export const SAMPLE_DIGEST_SHORT_ITEMS = `1. Коротко.
2. OpenAI оновив ChatGPT до GPT-5.6 Sol із адаптивною глибиною відповіді та новими інструментами для складних задач.
https://openai.com/gpt

🤖 footer
#AI #News`;

export const SAMPLE_DIGEST_SARCASTIC = `1. Ну що, знову «революція»? OpenAI оновив ChatGPT до GPT-5.6 Sol із адаптивною глибиною відповіді.
https://openai.com/blog/gpt-5-6-sol
2. Оце так історія. Google вимкнув AI-функцію в Google Earth після скарг на фейкові об'єкти на супутникових знімках.
https://blog.google/products/earth/ai-feature-removed`;

/** Expected articles from SAMPLE_DIGEST after footer strip + min-length filter. */
export const EXPECTED_SAMPLE_ARTICLES = [
  {
    text: 'OpenAI оновив ChatGPT до GPT-5.6 Sol із адаптивною глибиною відповіді. Тепер можна регулювати, наскільки глибоко модель міркує.',
    url: 'https://openai.com/blog/gpt-5-6-sol',
  },
  {
    text: 'Google вимкнув AI-функцію в Google Earth, яка дозволяла змінювати супутникові знімки. Користувачі вже встигли згенерувати фейкові об\'єкти.',
    url: 'https://blog.google/products/earth/ai-feature-removed',
  },
  {
    text: 'ByteDance розробляє мовну модель на 10 трильйонів параметрів. Це наступний крок після Doubao.',
    url: 'https://bytedance.com/llm',
  },
];

export const EXPECTED_HASH_PREFIX_ARTICLES = [
  {
    text: 'Cloudflare запустив Kitesurf — браузер для ШІ-агентів, які самі ходять сайтами і збирають факти.',
    url: 'https://blog.cloudflare.com/kitesurf',
  },
  {
    text: 'Український розробник запустив повноцінну LLM на мікроконтролері ESP32 за десять доларів.',
    url: 'https://example.com/esp32-llm',
  },
];

export const EXPECTED_INLINE_URL_ARTICLES = [
  {
    text: 'Hugging Face зазнав атаки автономного AI-агента без оператора. Докладніше у звіті компанії.',
    url: 'https://huggingface.co/blog/incident',
  },
  {
    text: 'Стара ракета Falcon 9 незабаром вріжеться в Місяць після багаторічної орбіти.',
    url: 'https://nasa.gov/falcon9',
  },
];

export const EXPECTED_SHORT_ITEM_ARTICLES = [
  {
    text: 'OpenAI оновив ChatGPT до GPT-5.6 Sol із адаптивною глибиною відповіді та новими інструментами для складних задач.',
    url: 'https://openai.com/gpt',
  },
];
