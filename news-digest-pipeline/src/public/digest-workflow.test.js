import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { digestWorkflow, renderDigestCard, workflowFilters } from './digest-workflow.js';

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

describe('digest cards', () => {
  it('keeps the dashboard inline module syntactically valid', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    const withoutImport = script.replace(/^\s*import .* from .*;$/m, '');
    expect(() => new Function(withoutImport)).not.toThrow();
  });
  it('renders one primary action and secondary actions in a disclosure', () => {
    const html = renderDigestCard(draft);
    expect(html.match(/class="next-action"/g)).toHaveLength(1);
    expect(html).toContain('<details');
    expect(html).not.toContain('<select');
    expect(html).toContain('Переглянути текст');
  });
  it('escapes untrusted fields and rejects unsafe media links', () => {
    const html = renderDigestCard({ ...draft, date: '<img onerror=alert(1)>', image_url: 'javascript:alert(1)' });
    expect(html).not.toContain('<img onerror');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img');
  });
  it('labels only recorded publications as published and names media actions explicitly', () => {
    const html = renderDigestCard({ ...draft, facebook_post_id: '123', video_url: '/reel.mp4' });
    expect(html).toContain('Facebook · опубліковано');
    expect(html).toContain('Переглянути відео');
    expect(html).toContain('Опублікувати Reel');
    expect(html).not.toContain('Reel · опубліковано');
  });
});