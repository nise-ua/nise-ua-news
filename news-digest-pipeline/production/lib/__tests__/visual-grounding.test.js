import { describe, expect, it } from 'vitest';
import {
  promptHasBannedMetaphor,
  BANNED_VISUAL_TERMS,
  sanitizeTextForImagePrompt,
  buildGroundedPrompt,
  buildSafeVisualSubject,
  containsCyrillic,
  coverSubjectNeedsFallback,
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
  it('rejects literalized Claude Sonnet hardware and word-salad scenes', () => {
    const coreFact = 'Anthropic released Claude Sonnet 5.5, claiming it is about 30% faster while keeping the same pricing.';
    const subject = 'Editorial photograph of Sonnet claiming it is about 30 faster while keeping same pricing';
    const prompt = 'Beige computers, PCs, server racks, boxes and a globe around a Sonnet model.';

    expect(coverSubjectNeedsFallback(subject, prompt, coreFact)).toBe(true);
  });

  it('rotates cover atmosphere by index when the LLM subject is kept', () => {
    const base = {
      coreFact: 'A developer described becoming addicted to coding and working to exhaustion',
      entities: ['developer'],
      newsTone: 'negative',
      visualSubject: 'An exhausted developer slumped at a cluttered late-night work desk, face in hands beside crumpled blank notes',
      prompt: 'An exhausted developer at a late-night work desk, face in hands beside crumpled blank notes.',
      look: 'cover',
    };
    const first = groundCoverVariant({ ...base }, 0);
    const second = groundCoverVariant({ ...base }, 1);
    expect(first.prompt).not.toBe(second.prompt);
    expect(first.visualSubject).toBe(second.visualSubject);
    expect(first.prompt).toMatch(/vivid|saturated|punchy|scroll/i);
    expect(first.prompt).not.toMatch(/fiber optic|server rack|data center|computer/i);
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

  it('grounds reported AI deception as a safety incident, not generic controls', () => {
    const grounded = groundCoverVariant({
      coreFact: "OpenAI reported 27 episodes of troubling behavior in models that hid errors, fabricated data, and accessed API keys",
      entities: ['OpenAI', 'models', 'API keys'],
      newsTone: 'negative',
      visualSubject: 'Hands adjusting unmarked analog sliders on a colorful hardware control panel',
      prompt: 'Bright studio photo of analog sliders with LED indicators.',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/safety lab|forensic|security keys|warning beacon|evidence/i);
    expect(grounded.visualSubject).not.toMatch(/slider|gaming pc|pc tower|generic workstation/i);
    expect(grounded.prompt).toMatch(/ZERO TEXT|no text/i);
  });

  it('grounds a faulty-intel ship story as aircraft over water', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Anthropic нарешті чесно показала, як виглядає «під наглядом людини».',
      sourceText: 'Літаки вже в небі, абордаж готують біля китайського судна.',
      entities: [],
      newsTone: 'negative',
      visualSubject: 'Sunlit technology scene with unmarked hardware, warm daylight and vivid color',
      prompt: '',
      look: 'cover',
    }, 0);
    expect(grounded.visualSubject).toMatch(/jet|aircraft|cargo ship|freighter/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/cable tray|unmarked hardware|server hall/);
    expect(grounded.prompt).toMatch(/aircraft|ship|jet/i);
  });

  it('grounds a Ukrainian Claude Money story as bank objects, not a rooftop', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Anthropic тестує чатбот Claude Money, який може розбиратися, куди зникла зарплата з банківського рахунку',
      entities: ['Anthropic', 'Claude Money'],
      newsTone: 'negative',
      visualSubject: 'Vivid urban rooftop with antennas and blank equipment boxes against a saturated sunset sky, no billboard text no logos no watermarks',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/wallet|envelope|vault|payment card/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/rooftop|antenna|cell tower/);
    expect(grounded.prompt).toMatch(/bank account|salary|wallet|envelope|vault/i);
    expect(grounded.prompt.toLowerCase()).not.toMatch(/rooftop|antenna/);
    expect(containsCyrillic(grounded.prompt)).toBe(false);
  });

  it('keeps a safe English cover scene even when coreFact is Ukrainian', () => {
    const custom = 'Hands tucking a blank payment card into a worn wallet next to sealed cash envelopes, warm window light, no card numbers no bank names no screens no watermarks';
    const grounded = groundCoverVariant({
      coreFact: 'Anthropic тестує Claude Money з доступом до банківського рахунку',
      entities: ['Anthropic', 'Claude Money'],
      newsTone: 'negative',
      visualSubject: custom,
      prompt: `${custom}. Vivid editorial cover photo.`,
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/wallet|payment card|envelopes/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/rooftop|server rack/);
  });

  it('grounds an AI extinction-debate story as a forum, not generic hardware', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Andrew Ng said AI extinction forecasts are science fiction used for PR and regulation',
      entities: ['Andrew Ng'],
      newsTone: 'neutral',
      visualSubject: 'Vivid urban rooftop with antennas and blank equipment boxes',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/lecture hall|gavel|conference table|scales of justice/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/rooftop|antenna/);
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

  it('photographs the story objects when the model returns a headline', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Apple released a new iPhone Duo with a foldable design and dual OLED screens',
      entities: ['Apple', 'iPhone Duo'],
      newsTone: 'neutral',
      visualSubject: 'released a new iPhone Duo with a foldable design and dual OLED screens',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/foldable|hinge|glass/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/released a new|server rack|gaming pc|fiber optic|cable tray/);
    expect(grounded.prompt).toMatch(/foldable|hinge|glass/i);
    expect(grounded.prompt).not.toMatch(/major technology product update|technology industry news/i);
  });

  it('does not illustrate a credential story as a server closet', () => {
    const grounded = groundCoverVariant({
      coreFact: 'An AI model broke into company systems and collected credentials during a safety test.',
      sourceText: 'Один намагався зламувати сайт і стягнув дані з чужими паролями.',
      entities: ['credentials'],
      newsTone: 'negative',
      visualSubject: 'Firewall-style rack of blinking unmarked network appliances in a vivid server closet',
      prompt: '',
      look: 'cover',
    }, 2);

    expect(grounded.visualSubject.toLowerCase()).toMatch(/vault|padlock|key/);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/server closet|network appliance|firewall|rack/);
  });

  it('photographs a personal-agent story instead of a datacenter', () => {
    const grounded = groundCoverVariant({
      coreFact: 'Meta released Muse, a personal AI agent that books travel and completes purchases.',
      entities: ['Meta', 'Muse'],
      newsTone: 'positive',
      visualSubject: 'Meta released Muse, a personal AI agent that books travel and completes purchases.',
      prompt: '',
      look: 'cover',
    }, 0);

    expect(grounded.visualSubject).toMatch(/travel|purchases/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/server rack|fiber optic|gaming pc|workstation|cable tray/);
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
