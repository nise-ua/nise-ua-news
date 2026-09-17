import { describe, expect, it } from 'vitest';
import {
  promptHasBannedMetaphor,
  BANNED_VISUAL_TERMS,
  sanitizeTextForImagePrompt,
  buildGroundedPrompt,
  buildSafeVisualSubject,
  containsCyrillic,
  groundCoverVariant,
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
  it('rotates cover atmosphere by index when the LLM subject is kept', () => {
    const base = {
      coreFact: 'OpenAI updates ChatGPT with a reasoning-depth slider',
      entities: ['OpenAI', 'ChatGPT'],
      newsTone: 'positive',
      visualSubject: 'Hands adjusting unmarked analog sliders on a colorful hardware control panel with LED indicators only',
      prompt: 'Bright studio photo of unmarked analog sliders with vivid LED accents, no screens or typography.',
      look: 'cover',
    };
    const first = groundCoverVariant({ ...base }, 0);
    const second = groundCoverVariant({ ...base }, 1);
    expect(first.prompt).not.toBe(second.prompt);
    expect(first.visualSubject).toBe(second.visualSubject);
    expect(first.prompt).toMatch(/vivid|saturated|punchy|scroll/i);
    expect(first.prompt).not.toMatch(/fiber optic|server rack|data center/i);
  });

  it('rejects datacenter clichés as custom cover subjects', () => {
    expect(isGenericItCliche('Glowing fiber optic cables in a server room')).toBe(true);
    expect(isSafeCustomVisualSubject(
      'Glowing fiber optic cables in a bright server hall with amber bokeh',
      { look: 'cover' },
    )).toBe(false);
  });

  it('falls back to an English object scene when the LLM subject is unsafe', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Meta released Muse, a personal AI agent that books travel and completes purchases.',
      entities: ['Meta', 'Muse'],
      newsTone: 'positive',
      visualSubject: 'ChatGPT UI screen with readable labels on a laptop',
      prompt: 'UI dashboard with readable text',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/\bchatgpt\b|\bui\b|readable labels/);
    expect(grounded.prompt).toMatch(/ZERO TEXT|no text/i);
    expect(containsCyrillic(grounded.prompt)).toBe(false);
  });

  it('does not send Ukrainian contractor copy to the image model as a random portrait', () => {
    const grounded = groundCoverVariant({
      coreFact: 'сотні підрядників читають живі чати користувачів і оцінюють, наскільки ChatGPT «людяний»',
      entities: ['ChatGPT', 'OpenAI'],
      newsTone: 'negative',
      visualSubject: 'сотні підрядників читають живі чати користувачів',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(containsCyrillic(grounded.visualSubject)).toBe(false);
    expect(containsCyrillic(grounded.prompt)).toBe(false);
    expect(grounded.prompt.toLowerCase()).not.toMatch(/portrait|red hat|headshot|підрядник/);
    expect(grounded.visualSubject).toMatch(/vault|padlock|network appliances/i);
  });

  it('grounds a Doom OS story as a game/hardware scene, not a person', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Claude Code wrote an operating system from scratch that launches Doom',
      entities: ['Claude Code', 'Doom'],
      newsTone: 'positive',
      visualSubject: 'Portrait of a man in a red hat',
      prompt: 'headshot of an unidentified man wearing a red baseball cap',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/crt|controller|arcade|circuit board|floppy/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/pc tower|gaming pc|rgb/);
    expect(grounded.prompt.toLowerCase()).not.toMatch(/portrait|red hat|headshot/);
  });

  it('uses a DIY motherboard scene for OS-from-scratch gaming covers', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Claude Code wrote an operating system from scratch that launches Doom',
      entities: ['Claude Code', 'Doom'],
      newsTone: 'positive',
      visualSubject: 'Modern RGB gaming PC tower on a desk',
      prompt: 'custom gaming pc with colorful LEDs',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/circuit board|floppy|solder/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/pc tower|gaming pc|rgb/);
  });

  it('keeps a safe LLM-provided scene without keyword templates', () => {
    const custom = 'Hands holding a vivid biodegradable material swatch against a bright studio backdrop';
    expect(isSafeCustomVisualSubject(custom, { look: 'cover' })).toBe(true);
    const grounded = groundCoverVariant({
      visualSubject: custom,
      coreFact: 'A startup unveiled a new biodegradable material for phone cases.',
      entities: ['startup'],
      prompt: `${custom}. Editorial magazine still with saturated daylight.`,
      look: 'cover',
    }, 0);
    expect(grounded.visualSubject).toMatch(/biodegradable material swatch|studio backdrop/i);
    expect(grounded.prompt).not.toMatch(/server racks|fiber optic/i);
  });

  it('maps chip stories to semiconductor visuals for reels only', () => {
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
      visualSubject: 'Sunlit travel desk with passport and colorful luggage tags without readable text',
      coreFact: 'Meta released Muse, a personal AI agent that books travel.',
      entities: ['Meta', 'Muse'],
      newsTone: 'positive',
      look: 'cover',
    });
    expect(prompt).not.toMatch(/dark server aisle|photorealistic documentary photography|upper third of the frame empty and darker/i);
    expect(prompt).toMatch(/vivid|saturated|punchy|scroll/i);
  });

  it('rebuilds unsafe cover LLM output from coreFact instead of keyword templates', () => {
    const grounded = groundVisualVariant({
      articleIndex: 1,
      sourceText: 'Meta викотила Muse — перший особистий AI-агент. Бот живе у віртуальній машині, сам бронює подорожі і закриває покупки.',
      url: '',
      coreFact: 'Meta released Muse, a personal AI agent that books travel and completes purchases.',
      entities: ['Meta', 'Muse', 'AI agent'],
      newsTone: 'positive',
      visualSubject: 'Compact modular computing workstation with colorful LED indicators on a bright studio desk',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(containsCyrillic(grounded.prompt)).toBe(false);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/compact modular computing|colorful LED indicators/i);
    expect(grounded.prompt).toMatch(/ZERO TEXT|no text/i);
  });
});
