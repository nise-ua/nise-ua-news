import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferNewsToneFromFact,
  pickVisualPalette,
  resolveNewsTone,
  buildSafeVisualSubject,
  buildGroundedPrompt,
  groundVisualVariant,
} from './visual-grounding.js';

test('infers negative tone from shutdown/discontinued facts', () => {
  assert.equal(
    inferNewsToneFromFact('Google discontinued an AI feature on satellite photos.'),
    'negative',
  );
  assert.equal(
    inferNewsToneFromFact('The service was shut down after a security breach.'),
    'negative',
  );
});

test('infers positive tone from launches and upgrades', () => {
  assert.equal(
    inferNewsToneFromFact('Cloudflare launches Kitesurf, a browser for AI agents.'),
    'positive',
  );
  assert.equal(
    inferNewsToneFromFact('OpenAI released GPT-5.6 Sol with improved reasoning.'),
    'positive',
  );
});

test('defaults to neutral for in-progress development stories', () => {
  assert.equal(
    inferNewsToneFromFact('ByteDance is developing a large language model with 10 trillion parameters.'),
    'neutral',
  );
});

test('palette reflects resolved news tone', () => {
  const bright = pickVisualPalette({
    coreFact: 'Cloudflare launches Kitesurf, a browser for AI agents.',
  });
  const dark = pickVisualPalette({
    coreFact: 'Google discontinued an AI feature on satellite photos.',
  });

  assert.match(bright, /bright|golden|fresh|uplift/i);
  assert.match(dark, /dark|somber|slate|shadow/i);
});

test('explicit newsTone overrides inference', () => {
  assert.equal(
    resolveNewsTone({
      newsTone: 'positive',
      coreFact: 'Google discontinued an AI feature on satellite photos.',
    }),
    'positive',
  );
});

test('GPT update uses text-free server room visual instead of dial', () => {
  const subject = buildSafeVisualSubject({
    visualSubject: 'brass physical reasoning-depth dial on a desk',
    coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
    entities: ['OpenAI', 'ChatGPT', 'GPT-5.6 Sol'],
  });
  assert.match(subject, /fiber optic|light trails|bokeh/i);
  assert.doesNotMatch(subject, /\bdial\b|\breasoning\b|\bgauge\b|\bbrass\b/i);
});

test('grounded GPT prompt strips brand names from image context', () => {
  const prompt = buildGroundedPrompt({
    visualSubject: 'brass physical reasoning-depth dial on a desk',
    coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
    entities: ['OpenAI', 'ChatGPT', 'GPT-5.6 Sol'],
    newsTone: 'positive',
  });
  assert.doesNotMatch(prompt, /\bopenai\b|\bchatgpt\b|\bgpt\b|5\.6|reasoning-depth|\bdial on\b/i);
  assert.match(prompt, /fiber optic|light trails/i);
  assert.match(prompt, /zero text|never paint any writing|watermark/i);
  assert.doesNotMatch(prompt, /for white text overlay/i);
});

test('Google Earth story keeps globe visual through grounding rebuild', () => {
  const grounded = groundVisualVariant({
    visualSubject: 'Satellite imagery on Earth showing AI feature being discontinued',
    coreFact: 'Google discontinued AI feature for Earth that allowed modifications on satellite',
    entities: ['Google', 'Google Earth', 'AI'],
    newsTone: 'negative',
    prompt: 'Google Earth app screenshot with readable labels',
  }, 2);
  assert.match(grounded.prompt, /push pins|desk sphere|blank blue/i);
  assert.doesNotMatch(grounded.prompt.split('CRITICAL')[0], /server racks with fiber optic glow/i);
});

test('ByteDance LLM story avoids neural network diagrams', () => {
  const grounded = groundVisualVariant({
    visualSubject: 'glowing neural network node cluster with code strings and vertical text labels',
    coreFact: 'ByteDance is developing a large language model with 10 trillion parameters.',
    entities: ['ByteDance'],
    newsTone: 'neutral',
    prompt: 'complex neural network diagram with readable code labels',
  }, 1);
  assert.match(grounded.prompt, /server racks|GPU|data center/i);
  assert.doesNotMatch(grounded.visualSubject, /neural network|node cluster|code strings/i);
  assert.doesNotMatch(grounded.prompt.split('CRITICAL')[0], /neural network diagram|node cluster with code|vertical text labels/i);
});
