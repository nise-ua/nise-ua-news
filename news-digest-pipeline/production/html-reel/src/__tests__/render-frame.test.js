import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  TEMPLATES_DIR,
  escapeHtml,
  fillTemplate,
  renderFrameToPng,
} from '../render-frame.js';
import { TEMPLATE_IDS } from '../template-select.js';

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<b>"A&B"</b> 'x'`)).toBe(
      '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt; &#39;x&#39;',
    );
  });

  it('renders nullish input as an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('fillTemplate', () => {
  const template = '<p>{{headline}}|{{detail}}|{{shotNumber}}|{{brandNiSe}}{{brandNews}}</p>';

  it('substitutes all placeholders with escaped values', () => {
    expect(fillTemplate(template, {
      headline: 'ШІ & <люди>',
      detail: 'Деталі.',
      shotNumber: 4,
    })).toBe('<p>ШІ &amp; &lt;люди&gt;|Деталі.|4|NiSeNews</p>');
  });

  it('uses the NiSeNews brand defaults and blanks missing copy', () => {
    expect(fillTemplate(template, {})).toBe('<p>|||NiSeNews</p>');
  });

  it('allows overriding the brand parts', () => {
    expect(fillTemplate('{{brandNiSe}}-{{brandNews}}', { brandNiSe: 'A', brandNews: 'B' }))
      .toBe('A-B');
  });
});

describe('templates', () => {
  it('are 1080x1920, placeholder-complete and free of the CTA', () => {
    for (const id of TEMPLATE_IDS) {
      const html = readFileSync(join(TEMPLATES_DIR, `${id}.html`), 'utf8');
      expect(html, id).toContain('<meta charset="utf-8">');
      expect(html, id).toContain('width: 1080px');
      expect(html, id).toContain('height: 1920px');
      expect(html, id).toContain('{{headline}}');
      expect(html, id).toContain('{{detail}}');
      expect(html, id).toContain('{{backgroundImage}}');
      expect(html, id).toContain('brand-row');
      expect(html, id).toContain('align-items: flex-end');
      expect(html, id).toMatch(/\.dots i\s*\{[^}]*background:\s*#ffffff/s);
      expect(html, id).not.toContain('accent-bar');
      expect(html, id).not.toMatch(/class="accent"/);
      expect(html, id).not.toContain('Більше новин тут');
      expect(fillTemplate(html, {
        headline: 'Тест',
        detail: 'Деталь',
        shotNumber: 1,
        backgroundImage: '',
      })).not.toMatch(/\{\{\w+\}\}/);
    }
  });
});

describe('fillTemplate backgroundImage', () => {
  it('injects a data URI into the img src placeholder', () => {
    const html = fillTemplate('<img src="{{backgroundImage}}" />', {
      backgroundImage: 'data:image/png;base64,abc',
    });
    expect(html).toBe('<img src="data:image/png;base64,abc" />');
  });
});

describe('toBackgroundDataUri', () => {
  it('passes through existing data URIs', async () => {
    const { toBackgroundDataUri } = await import('../render-frame.js');
    const uri = 'data:image/png;base64,AAAA';
    expect(await toBackgroundDataUri(uri)).toBe(uri);
  });

  it('returns empty for missing input', async () => {
    const { toBackgroundDataUri } = await import('../render-frame.js');
    expect(await toBackgroundDataUri('')).toBe('');
    expect(await toBackgroundDataUri(null)).toBe('');
  });
});

// Chromium rendering is opt-in: it needs a browser download and a few seconds.
const browserTest = process.env.HTML_REEL_BROWSER_TEST === '1' ? it : it.skip;

describe('renderFrameToPng (browser smoke test)', () => {
  browserTest('writes a 1080x1920 PNG (set HTML_REEL_BROWSER_TEST=1 to run)', async () => {
    const { default: sharp } = await import('sharp');
    const dir = mkdtempSync(join(tmpdir(), 'html-reel-'));
    const outputPath = join(dir, 'frame.png');
    try {
      const templateHtml = readFileSync(join(TEMPLATES_DIR, 'editorial-dark.html'), 'utf8');
      await renderFrameToPng({
        templateHtml,
        data: { headline: 'Тестовий заголовок', detail: 'Деталь новини.', shotNumber: 1 },
        outputPath,
      });
      expect(existsSync(outputPath)).toBe(true);
      const meta = await sharp(outputPath).metadata();
      expect(meta.width).toBe(FRAME_WIDTH);
      expect(meta.height).toBe(FRAME_HEIGHT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
