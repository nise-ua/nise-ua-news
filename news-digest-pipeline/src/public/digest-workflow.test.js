import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  digestWorkflow, formatDateTime, pluralizeArticles, renderDigestCard, workflowFilters,
} from './digest-workflow.js';

const draft = { id: 'digest-1', content: 'Новини України.', date: '2026-09-04' };

describe('digest next step', () => {
  it('requires explicit review, even when a cover already exists', () => {
    expect(digestWorkflow({ ...draft, image_url: '/images/cover.png' }).action).toBe('review');
  });
  it('does not infer publication from the manually editable legacy status', () => {
    expect(digestWorkflow({ ...draft, status: 'published' }).stage).toBe('review');
  });
  it('recommends a cover after review and publication after a cover', () => {
    expect(digestWorkflow(draft, { reviewed: true }).action).toBe('cover');
    expect(digestWorkflow({ ...draft, image_url: '/cover.png' }, { reviewed: true }).action).toBe('facebook');
  });
  it('prioritizes active work over publication and distinguishes failures', () => {
    const published = { ...draft, facebook_post_id: '123' };
    expect(digestWorkflow(published, { videoJob: { status: 'running' } }).stage).toBe('progress');
    expect(digestWorkflow(draft, { imageJob: { status: 'failed' } }).stage).toBe('review');
  });
  it('offers ready media for remaining channels, not already published channels', () => {
    const digest = { ...draft, facebook_post_id: '123', video_url: '/reel.mp4' };
    expect(digestWorkflow(digest).action).toBe('reel');
    expect(digestWorkflow({ ...digest, facebook_reel_id: '456' }).stage).toBe('published');
    expect(digestWorkflow({ ...digest, facebook_reel_id: '456', youtube_shorts_url: '/short.mp4' }).action).toBe('youtube');
  });
  it('never suggests publishing an empty digest', () => {
    expect(digestWorkflow({ id: 'empty', content: ' ' }).action).toBe('articles');
  });
  it('has all five filters including the unfiltered list', () => {
    expect(workflowFilters.map(([key]) => key)).toEqual(['all', 'review', 'progress', 'ready', 'published']);
  });
});

describe('card metadata helpers', () => {
  it('formats SQLite UTC timestamps and ISO strings in local time', () => {
    const fromSqlite = formatDateTime('2026-04-12 23:20:03');
    const fromIso = formatDateTime('2026-04-12T23:20:03.649Z');
    expect(fromSqlite).toMatch(/^\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(fromSqlite).toBe(fromIso);
    expect(formatDateTime('2026-04-12T23:20:03Z', { time: false })).toMatch(/^\d{2}\.\d{2}\.2026$/);
    expect(formatDateTime('2026-09-04', { time: false })).toBe('04.09.2026');
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('not a date')).toBe('');
  });
  it('pluralizes article counts in Ukrainian', () => {
    expect(pluralizeArticles(1)).toBe('1 стаття');
    expect(pluralizeArticles(3)).toBe('3 статті');
    expect(pluralizeArticles(5)).toBe('5 статей');
    expect(pluralizeArticles(11)).toBe('11 статей');
    expect(pluralizeArticles(21)).toBe('21 стаття');
    expect(pluralizeArticles(undefined)).toBe('0 статей');
  });
});

describe('digest cards', () => {
  it('keeps the dashboard inline module syntactically valid', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    const withoutImport = script.replace(/^\s*import .* from .*;$/gm, '');
    expect(withoutImport).not.toMatch(/^\s*import /m);
    expect(() => new Function(withoutImport)).not.toThrow();
  });
  it('renders one primary action and secondary actions in a disclosure', () => {
    const html = renderDigestCard(draft);
    expect(html.match(/class="next-action"/g)).toHaveLength(1);
    expect(html).toContain('<details');
    expect(html).not.toContain('<select');
    expect(html).toContain('Переглянути текст');
    expect(html).toContain('aria-label="Інші дії:');
    expect(html).toContain('<span>Текст</span>');
    expect(html).toContain('class="menu-icon"');
    expect(html).not.toContain('class="next-hint"');
  });
  it('shows status hint only for progress or failed jobs', () => {
    const progress = renderDigestCard(draft, { videoJob: { status: 'running', progress: 40, message: 'Рендер' } });
    expect(progress).toContain('class="next-hint"');
    expect(progress).toContain('Можна продовжити роботу з іншими дайджестами.');
    const failed = renderDigestCard(draft, { imageJob: { status: 'failed', progress: 0, message: 'Помилка' } });
    expect(failed).toContain('class="next-hint"');
    expect(failed).toContain('Генерація не вдалася');
  });
  it('escapes untrusted fields and rejects unsafe media links', () => {
    const html = renderDigestCard({ ...draft, date: '<img onerror=alert(1)>', image_url: 'javascript:alert(1)' });
    expect(html).not.toContain('<img onerror');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img');
  });
  it('shows article count, cost, and created/published dates in the card meta', () => {
    const html = renderDigestCard({
      ...draft, articles_count: 4, cost_usd: 0.0629,
      created_at: '2026-08-18 10:00:00', published_at: '2026-08-19T12:00:00Z',
    });
    const meta = html.match(/<p class="card-meta">([^<]*)<\/p>/)[1];
    expect(meta).toMatch(/^4 статті · \$0\.0629 · створено \d{2}\.\d{2}\.2026 \d{2}:\d{2} · опубліковано \d{2}\.\d{2}\.2026$/);
    expect(renderDigestCard(draft)).toContain('<p class="card-meta">0 статей</p>');
  });
  it('labels only recorded publications as published and names media actions explicitly', () => {
    const html = renderDigestCard({ ...draft, facebook_post_id: '123', video_url: '/reel.mp4' });
    expect(html).toContain('>Facebook</a>');
    expect(html).toContain('Відкрити відео');
    expect(html).toContain('Опублікувати Reel');
    expect(html).not.toContain('>Reel</a>');
  });
});