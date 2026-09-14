import { describe, expect, it } from 'vitest';
import {
  promptHasBannedMetaphor,
  BANNED_VISUAL_TERMS,
  sanitizeTextForImagePrompt,
  buildGroundedPrompt,
  buildSafeVisualSubject,
  containsCyrillic,
  groundVisualVariant,
  groundVisualList,
  inferNewsToneFromFact,
  isGenericItCliche,
  isSafeCustomVisualSubject,
  pickCoverPhotographyStyle,
  pickVisualPalette,
} from '../visual-grounding.js';

describe('promptHasBannedMetaphor', () => {
  it.each([
    'crowd waving revolution flags',
    'revolutionary uprising in the streets',
    'ancient history book opening',
    'museum of history with marble columns',
    'fairy tale storybook illustration',
    'hilarious joke sarcasm meme',
    'perfect cyborg army marching',
  ])('flags banned metaphor: %s', (prompt) => {
    expect(promptHasBannedMetaphor(prompt)).toBe(true);
  });

  it('does not flag a concrete hardware scene', () => {
    expect(promptHasBannedMetaphor(
      'Engineers walking past unmarked GPU server racks in a bright data center',
    )).toBe(false);
  });

  it('covers every listed banned term', () => {
    for (const term of BANNED_VISUAL_TERMS) {
      expect(promptHasBannedMetaphor(`a scene with ${term} in the background`), term).toBe(true);
    }
  });
});

describe('sanitizeTextForImagePrompt', () => {
  it('strips brand names and version numbers', () => {
    const cleaned = sanitizeTextForImagePrompt(
      'OpenAI ChatGPT GPT-5.6 Sol interface next to Google Earth',
    );
    expect(cleaned).not.toMatch(/openai|chatgpt|gpt|google|5\.6/i);
  });
});

describe('groundVisualVariant — banned metaphor rebuild', () => {
  it('rebuilds GPT news away from revolution flags toward a text-free hardware visual', () => {
    const original = {
      headline: 'OpenAI оновив ChatGPT',
      url: 'https://openai.com/blog/gpt-5-6-sol',
      spokenText: 'OpenAI оновив ChatGPT до GPT-5.6 Sol.',
      detailText: 'Зʼявилася адаптивна глибина відповіді.',
      visualSubject: 'crowd waving revolution flags',
      coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
      entities: ['OpenAI', 'ChatGPT', 'GPT-5.6 Sol'],
      newsTone: 'positive',
      prompt: 'crowd waving revolution flags in a city square',
    };

    const grounded = groundVisualVariant(original);

    expect(grounded.headline).toBe(original.headline);
    expect(grounded.url).toBe(original.url);
    expect(grounded.spokenText).toBe(original.spokenText);
    expect(grounded.detailText).toBe(original.detailText);
    expect(grounded.prompt).not.toMatch(/\brevolution\b/i);
    expect(grounded.prompt).toMatch(/fiber optic|light trails|bokeh|server/i);
    expect(grounded.prompt).toMatch(/zero text|never paint any writing|watermark/i);
  });

  it('rebuilds Google Earth news away from history-book metaphor', () => {
    const grounded = groundVisualVariant({
      visualSubject: 'ancient history museum / history book opening',
      coreFact: 'Google discontinued AI feature for Earth that allowed modifications on satellite',
      entities: ['Google', 'Google Earth'],
      newsTone: 'negative',
      prompt: 'history book opening with ancient maps',
      headline: 'Google вимкнув AI в Earth',
    });

    expect(grounded.headline).toBe('Google вимкнув AI в Earth');
    expect(grounded.prompt).toMatch(/push pins|desk sphere|blank blue/i);
    expect(grounded.prompt.split('CRITICAL')[0]).not.toMatch(/history book|ancient history|museum of history/i);
  });

  it('rebuilds an empty prompt from coreFact/entities', () => {
    const grounded = groundVisualVariant({
      visualSubject: '',
      coreFact: 'ByteDance is developing a large language model with 10 trillion parameters.',
      entities: ['ByteDance'],
      prompt: '',
    });

    expect(grounded.prompt.length).toBeGreaterThan(40);
    expect(grounded.prompt).toMatch(/server racks|GPU|data center/i);
  });

  it('rebuilds abstract vortex prompts into a concrete chip-hardware scene', () => {
    const originalPrompt = 'abstract digital vortex background with a cosmic eye';
    const grounded = groundVisualVariant({
      visualSubject: 'abstract AI vortex swirling in cosmic eye',
      coreFact: 'A research lab published a new paper on chip cooling methods.',
      entities: ['research lab', 'chip cooling'],
      prompt: originalPrompt,
    });

    expect(grounded.prompt).not.toBe(originalPrompt);
    expect(grounded.prompt).toMatch(/zero readable characters|ZERO TEXT/i);
    expect(grounded.visualSubject).toMatch(/wafer|circuit board|heat sink|silicon/i);
    expect(grounded.visualSubject).not.toMatch(/vortex/i);
  });
});

describe('groundVisualVariant — entity mention checks', () => {
  it('rebuilds when none of the entities appear in prompt, subject, or fact', () => {
    const originalPrompt = 'unmarked server hardware in a quiet lab, photorealistic documentary photography';
    const grounded = groundVisualVariant({
      visualSubject: 'unmarked server hardware in a quiet lab',
      coreFact: 'A university published a new paper on chip cooling.',
      entities: ['NVIDIA', 'H100'],
      headline: 'Нове дослідження про чипи',
      url: 'https://example.com/chips',
      prompt: originalPrompt,
    });

    expect(grounded.headline).toBe('Нове дослідження про чипи');
    expect(grounded.url).toBe('https://example.com/chips');
    expect(grounded.entities).toEqual(['NVIDIA', 'H100']);
    expect(grounded.prompt).not.toBe(originalPrompt);
    expect(grounded.prompt).toMatch(/zero text|never paint any writing|watermark/i);
  });

  it('keeps extra fields when an entity is already present in the fact', () => {
    const grounded = groundVisualVariant({
      visualSubject: 'unmarked server hardware in a quiet lab',
      coreFact: 'A research lab published a new paper on chip cooling.',
      entities: ['research lab', 'chip cooling'],
      headline: 'Лабораторія про охолодження чипів',
      url: 'https://example.com/cooling',
      spokenText: 'Лабораторія опублікувала дослідження про охолодження чипів.',
      prompt: 'unmarked server hardware in a quiet lab. Professional documentary photography.',
    });

    expect(grounded.headline).toBe('Лабораторія про охолодження чипів');
    expect(grounded.url).toBe('https://example.com/cooling');
    expect(grounded.spokenText).toBe('Лабораторія опублікувала дослідження про охолодження чипів.');
    expect(grounded.visualSubject).toMatch(/wafer|circuit board|heat sink|silicon|server hardware/i);
    expect(grounded.prompt).toMatch(/wafer|circuit board|heat sink|silicon|server hardware/i);
    expect(grounded.prompt).toMatch(/ZERO TEXT|zero readable characters/i);
  });
});

describe('groundVisualVariant — passthrough', () => {
  it('returns non-objects unchanged', () => {
    expect(groundVisualVariant(null)).toBeNull();
    expect(groundVisualVariant(undefined)).toBeUndefined();
    expect(groundVisualVariant('shot')).toBe('shot');
  });
});

describe('groundVisualList', () => {
  it('grounds every item and leaves non-arrays alone', () => {
    const list = groundVisualList([
      {
        visualSubject: 'crowd waving revolution flags',
        coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
        entities: ['OpenAI'],
        prompt: 'revolution flags',
      },
      {
        visualSubject: 'history book opening',
        coreFact: 'Google discontinued AI feature for Earth that allowed modifications on satellite',
        entities: ['Google Earth'],
        prompt: 'history book opening',
      },
    ]);

    expect(list).toHaveLength(2);
    expect(list[0].prompt).not.toMatch(/\brevolution\b/i);
    expect(list[1].prompt).toMatch(/push pins|desk sphere|blank blue/i);
    expect(groundVisualList(null)).toBeNull();
    expect(groundVisualList({ shots: [] })).toEqual({ shots: [] });
  });
});

describe('cover visual variety', () => {
  it('rotates cover fallback scenes by index without datacenter clichés', () => {
    const base = {
      visualSubject: 'ChatGPT UI with readable labels',
      coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
      entities: ['OpenAI', 'ChatGPT'],
      look: 'cover',
    };
    const first = buildSafeVisualSubject({ ...base, index: 0 });
    const second = buildSafeVisualSubject({ ...base, index: 1 });
    expect(first).not.toBe(second);
    expect(first).toMatch(/presenter|prism|coffee|conference|prototype/i);
    expect(first).not.toMatch(/fiber optic|server rack|data center/i);
    expect(second).toMatch(/presenter|prism|coffee|conference|prototype/i);
    expect(second).not.toMatch(/fiber optic|server rack|data center/i);
  });

  it('rejects datacenter clichés as custom cover subjects', () => {
    expect(isGenericItCliche('Glowing fiber optic cables in a server room')).toBe(true);
    expect(isSafeCustomVisualSubject(
      'Glowing fiber optic cables in a bright server hall with amber bokeh',
      { look: 'cover' },
    )).toBe(false);
  });

  it('keeps a safe LLM-provided scene when no strong category template applies', () => {
    const custom = 'Hands holding a vivid biodegradable material swatch against a bright studio backdrop';
    expect(isSafeCustomVisualSubject(custom)).toBe(true);
    const subject = buildSafeVisualSubject({
      visualSubject: custom,
      coreFact: 'A startup unveiled a new biodegradable material for phone cases.',
      entities: ['startup'],
    });
    expect(subject).toMatch(/biodegradable material swatch|studio backdrop/i);
    expect(subject).not.toMatch(/server racks|fiber optic/i);
  });

  it('maps chip stories to semiconductor visuals', () => {
    const subject = buildSafeVisualSubject({
      visualSubject: 'NVIDIA H100 die photo with readable markings',
      coreFact: 'TSMC began mass production of a new 2nm chip for AI accelerators.',
      entities: ['TSMC', 'NVIDIA'],
      index: 0,
    });
    expect(subject).toMatch(/wafer|circuit board|heat sink|silicon/i);
    expect(subject).not.toMatch(/server racks walking/i);
  });

  it('rotates cover photography style by index', () => {
    expect(pickCoverPhotographyStyle(0)).not.toBe(pickCoverPhotographyStyle(1));
    expect(pickCoverPhotographyStyle(0)).toMatch(/editorial cover photo/i);
    expect(pickCoverPhotographyStyle(1)).not.toMatch(/\bportrait\b/i);
  });
});

describe('safe visual subjects', () => {
  it('replaces a text-prone dial with a fiber-optic scene for GPT updates', () => {
    const subject = buildSafeVisualSubject({
      visualSubject: 'brass physical reasoning-depth dial on a desk',
      coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
      entities: ['OpenAI', 'ChatGPT', 'GPT-5.6 Sol'],
    });
    expect(subject).toMatch(/fiber optic|light trails|bokeh/i);
    expect(subject).not.toMatch(/\bdial\b|\breasoning\b|\bgauge\b|\bbrass\b/i);
  });

  it('buildGroundedPrompt does not leak brand names or overlay boilerplate', () => {
    const prompt = buildGroundedPrompt({
      visualSubject: 'brass physical reasoning-depth dial on a desk',
      coreFact: 'OpenAI updates ChatGPT to GPT-5.6 Sol with features for better responses.',
      entities: ['OpenAI', 'ChatGPT', 'GPT-5.6 Sol'],
      newsTone: 'positive',
    });
    expect(prompt).not.toMatch(/\bopenai\b|\bchatgpt\b|\bgpt\b|5\.6|reasoning-depth|\bdial on\b/i);
    expect(prompt).not.toMatch(/for white text overlay/i);
  });
});

describe('tone inference (characterization)', () => {
  it('maps shutdown/launch/in-progress facts to negative/positive/neutral', () => {
    expect(inferNewsToneFromFact('Google discontinued an AI feature on satellite photos.')).toBe('negative');
    expect(inferNewsToneFromFact('Cloudflare launches Kitesurf, a browser for AI agents.')).toBe('positive');
    expect(inferNewsToneFromFact('ByteDance is developing a large language model with 10 trillion parameters.')).toBe('neutral');
  });
});

describe('colorful image palettes', () => {
  it('does not ask the image model for gray or desaturated light', () => {
    expect(pickVisualPalette({ newsTone: 'neutral' })).not.toMatch(/desaturated|charcoal|muted earth|grave mood/i);
    const prompt = buildGroundedPrompt({
      visualSubject: 'Engineers walking past unmarked GPU server racks',
      coreFact: 'ByteDance is developing a large language model with 10 trillion parameters.',
      entities: ['ByteDance'],
      newsTone: 'neutral',
    });
    expect(prompt).toMatch(/color|daylight|vivid|warm|rich/i);
    expect(prompt).not.toMatch(/photorealistic documentary photography|dark server aisle/i);
  });

  it('keeps negative news dramatic and colorful instead of gray', () => {
    expect(pickVisualPalette({ newsTone: 'negative' })).not.toMatch(/desaturated|charcoal|grave mood|muted blue-grey/i);
    const prompt = buildGroundedPrompt({
      visualSubject: 'Hand removing colored push pins from a blank desk globe',
      coreFact: 'Google discontinued an AI feature on satellite photos.',
      newsTone: 'negative',
    });
    expect(prompt).toMatch(/teal|amber|storm|contrast|vivid|color/i);
    expect(prompt).not.toMatch(/photorealistic documentary photography|dark server aisle/i);
  });

  it('cover look forbids gloomy documentary language', () => {
    const prompt = buildGroundedPrompt({
      visualSubject: 'Sunlit fiber optic light trails',
      coreFact: 'OpenAI updates ChatGPT with a new response mode.',
      entities: ['OpenAI'],
      newsTone: 'positive',
      look: 'cover',
    });
    expect(prompt).not.toMatch(/dark server aisle|photorealistic documentary photography|upper third of the frame empty and darker/i);
    expect(prompt).toMatch(/vivid|saturated|punchy|scroll/i);
  });

  it('rebuilds Ukrainian cover subjects into English hardware scenes', () => {
    const grounded = groundVisualVariant({
      articleIndex: 1,
      coreFact: 'Meta розробила віртуального AI-агента Muse',
      entities: ['Meta', 'Muse', 'AI-агент'],
      newsTone: 'positive',
      visualSubject: 'віртуальна машина, де живе AI-агент Muse, з підсвічуванням підсистем',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(containsCyrillic(grounded.prompt)).toBe(false);
    expect(grounded.prompt).toMatch(/workstation|computer case|robot assistant|cable harness/i);
    expect(grounded.prompt).not.toMatch(/\bportrait\b|native portrait/i);
    expect(isSafeCustomVisualSubject(
      'віртуальна машина, де живе AI-агент Muse, з підсвічуванням підсистем',
      { look: 'cover' },
    )).toBe(false);
  });
});
