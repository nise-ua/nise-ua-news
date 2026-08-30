import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ReelCopyReviewError,
  findCopyIssues,
  findLatestStoryboardFile,
  formatCopyReviewTable,
  readStoryboardFile,
  repairShotCopy,
  reviewReelStoryboard,
  writeStoryboardFile,
} from '../reel-copy-review.js';

const goodShot = {
  shot: 1,
  coreFact: 'Meta gives Llama developers free API tokens',
  headline: 'Meta дає безплатні токени розробникам Llama.',
  detailText: 'Кредити виглядають як інвестиція у власну екосистему сьогодні.',
  spokenText: 'Meta дає безплатні токени розробникам Llama цього тижня.',
  prompt: 'keep-this-prompt',
  visualSubject: 'keep-this-visual',
};

describe('findCopyIssues', () => {
  it('flags one-word stubs like «Класика.»', () => {
    const issues = findCopyIssues({
      ...goodShot,
      headline: 'Класика.',
      detailText: 'Meta щедро підкидає токенів — благодійність, яка виглядає як інвестиція.',
    });
    expect(issues.some((issue) => /stub/i.test(issue))).toBe(true);
    expect(issues.some((issue) => /dash or semicolon/i.test(issue))).toBe(true);
  });

  it('passes in-band finished Ukrainian copy', () => {
    expect(findCopyIssues(goodShot)).toEqual([]);
  });
});

describe('formatCopyReviewTable', () => {
  it('prints word counts and issues', () => {
    const table = formatCopyReviewTable({
      shots: [{ ...goodShot, headline: 'Класика.' }],
    });
    expect(table).toMatch(/Final copy for review:/);
    expect(table).toMatch(/Shot 1/);
    expect(table).toMatch(/headline \(1w\): Класика\./);
    expect(table).toMatch(/issues:/);
  });
});

describe('storyboard file helpers', () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('writes and reloads the latest matching digest file', () => {
    dir = mkdtempSync(join(tmpdir(), 'reel-copy-'));
    const older = writeStoryboardFile(dir, 'd1', { shots: [{ ...goodShot, headline: 'Старий заголовок новини про Meta.' }] }, {
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    const newer = writeStoryboardFile(dir, 'd1', { shots: [goodShot] }, {
      now: () => new Date('2026-01-02T00:00:00.000Z'),
    });
    writeFileSync(join(dir, 'storyboard_other_2026-01-03-00-00-00.json'), JSON.stringify({ shots: [] }));
    expect(findLatestStoryboardFile(dir, 'd1')).toBe(newer);
    expect(findLatestStoryboardFile(dir, 'd1')).not.toBe(older);
    expect(readStoryboardFile(newer).shots[0].headline).toBe(goodShot.headline);
  });
});

describe('reviewReelStoryboard', () => {
  it('rewrites stub copy from the mocked critic and keeps visual fields', async () => {
    const completeJson = vi.fn(async () => ({
      shots: [{
        shot: 1,
        pass: false,
        issues: ['stub headline'],
        headline: goodShot.headline,
        detailText: goodShot.detailText,
        spokenText: goodShot.spokenText,
      }],
    }));

    const reviewed = await reviewReelStoryboard({
      shots: [{
        ...goodShot,
        headline: 'Класика.',
        detailText: 'Meta щедро підкидає токенів — благодійність виглядає дивно.',
      }],
    }, { completeJson, log: () => {} });

    expect(completeJson).toHaveBeenCalled();
    expect(reviewed.shots[0].headline).toBe('Meta дає безплатні токени розробникам Llama.');
    expect(reviewed.shots[0].prompt).toBe('keep-this-prompt');
    expect(reviewed.shots[0].visualSubject).toBe('keep-this-visual');
    expect(findCopyIssues(reviewed.shots[0])).toEqual([]);
  });

  it('keeps copy when the critic passes on round one', async () => {
    const completeJson = vi.fn(async () => ({
      shots: [{ shot: 1, pass: true, issues: [], ...goodShot }],
    }));
    const reviewed = await reviewReelStoryboard({ shots: [goodShot] }, { completeJson, log: () => {} });
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(reviewed.shots[0].headline).toBe(goodShot.headline);
    expect(findCopyIssues(reviewed.shots[0])).toEqual([]);
  });

  it('keeps heuristic-passing copy if the critic is unavailable', async () => {
    const reviewed = await reviewReelStoryboard({ shots: [goodShot] }, {
      completeJson: async () => {
        throw new Error('no credits');
      },
      log: () => {},
    });
    expect(reviewed.shots[0].headline).toBe(goodShot.headline);
  });

  it('repairs «Класика.» dash-spliced copy into in-band Ukrainian sentences', () => {
    const repaired = repairShotCopy({
      shot: 1,
      prompt: 'keep-this-prompt',
      headline: 'Класика.',
      detailText: 'Meta щедро підкидає токенів — благодійність, яка виглядає як інвестиція у власну екосистему.',
      spokenText: 'Класика.',
      sourceText: 'Класика. Meta щедро підкидає токенів розробникам Llama сьогодні. Благодійність виглядає як інвестиція у власну екосистему сьогодні.',
    });
    expect(repaired.prompt).toBe('keep-this-prompt');
    expect(findCopyIssues(repaired)).toEqual([]);
    expect(repaired.headline).not.toMatch(/^Класика/i);
  });

  it('repairs stub copy when the critic is unavailable', async () => {
    const reviewed = await reviewReelStoryboard({
      shots: [{
        ...goodShot,
        headline: 'Класика.',
        detailText: 'Meta щедро підкидає токенів — благодійність, яка виглядає як інвестиція у власну екосистему.',
        spokenText: 'Класика.',
        sourceText: 'Meta щедро підкидає токенів розробникам Llama сьогодні. Благодійність виглядає як інвестиція у власну екосистему сьогодні.',
      }],
    }, {
      completeJson: async () => {
        throw new Error('no credits');
      },
      log: () => {},
    });
    expect(findCopyIssues(reviewed.shots[0])).toEqual([]);
    expect(reviewed.shots[0].headline).not.toMatch(/^Класика/i);
    expect(reviewed.shots[0].prompt).toBe('keep-this-prompt');
  });

  it('repairs copy after the critic stays stubbed', async () => {
    const completeJson = vi.fn(async () => ({
      shots: [{
        shot: 1,
        pass: false,
        issues: ['still a stub'],
        headline: 'Класика.',
        detailText: 'Meta щедро підкидає токенів — благодійність як інвестиція.',
        spokenText: 'Класика.',
      }],
    }));

    const reviewed = await reviewReelStoryboard({
      shots: [{
        ...goodShot,
        headline: 'Класика.',
        sourceText: `${goodShot.headline} ${goodShot.detailText}`,
      }],
    }, { completeJson, log: () => {}, maxRounds: 2 });

    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(findCopyIssues(reviewed.shots[0])).toEqual([]);
  });
});
