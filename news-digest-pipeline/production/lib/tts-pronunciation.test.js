import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTtsText } from './tts-pronunciation.js';

test('Cloudflare is phoneticized for Ukrainian TTS', () => {
  const input = 'Cloudflare випустив браузер Kitesurf для ШІ-агентів.';
  const output = prepareTtsText(input);
  assert.match(output, /Клоудфлейр/u);
  assert.match(output, /Кайтсерф/u);
  assert.match(output, /ШІ/u);
  assert.doesNotMatch(output, /Cloudflare/u);
});

test('uses English pronunciation for short acronyms', () => {
  const input = 'OpenAI оновив GPT і ChatGPT для LLM-задач.';
  const output = prepareTtsText(input);
  assert.match(output, /Джі-Пі-Ті/u);
  assert.match(output, /Ел-Ел-Ем/u);
  assert.match(output, /Чат Джі-Пі-Ті/u);
  assert.match(output, /Оупен Ей-Ай/u);
});

test('pronounces English AI and Google names naturally', () => {
  const output = prepareTtsText('AI від Google допомагає користувачам.');
  assert.equal(output, 'Ей-Ай від Ґуґл допомагає користувачам.');
});

test('handles multi-word brands', () => {
  assert.equal(
    prepareTtsText('Hugging Face зазнав атаки AI-агента.'),
    'Хагінг Фейс зазнав атаки Ей-Ай-агента.'
  );
});

test('GPT-5.6 is spoken as five point six, not fifty-six', () => {
  const output = prepareTtsText('OpenAI представив GPT-5.6 Sol з новим слайдером.');
  assert.match(output, /Джі-Пі-Ті\s+п'ять крапка шість/u);
  assert.doesNotMatch(output, /\b56\b/u);
  assert.doesNotMatch(output, /п'ятдесят шість/u);
});

test('standalone decimal versions use крапка', () => {
  assert.match(
    prepareTtsText('Версія 5.6 вже доступна.'),
    /п'ять крапка шість/u,
  );
  assert.match(
    prepareTtsText('Модель 3.6 працює швидше.'),
    /три крапка шість/u,
  );
});

test('pure Ukrainian text is unchanged', () => {
  const input = 'Google швидко прибрав функцію з карти.';
  assert.equal(prepareTtsText(input), 'Ґуґл швидко прибрав функцію з карти.');
});
