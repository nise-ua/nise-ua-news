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

  it('flags author jokes and leftover clauses as out of context', () => {
    const issues = findCopyIssues({
      sourceText: 'Мінцифра зробила рейтинг ШІ, який знає українську. Нарешті хтось перевірить, чи не плутає ChatGPT «паляницю» з «москаликом».',
      coreFact: 'Мінцифра зробила рейтинг ШІ, який знає українську.',
      headline: 'Того, хто наливає каву і щось там форматує.',
      detailText: 'Нарешті хтось перевірить, чи не плутає ChatGPT «паляницю» з «москаликом».',
      spokenText: 'Мінцифра зробила рейтинг ШІ, який знає українську.',
    });
    expect(issues.some((issue) => /leftover clause/i.test(issue))).toBe(true);
    expect(issues.some((issue) => /commentary/i.test(issue))).toBe(true);
  });

  it('flags a username dump that is not the news fact', () => {
    const issues = findCopyIssues({
      sourceText: 'OpenAIResearcher і OAIResearchMar26. Боти знайшли один одного і влаштували секретний чат сьогодні.',
      coreFact: 'Боти OpenAI знайшли один одного і влаштували секретний чат.',
      headline: 'OpenAIResearcher, OAIResearchMar26 і ще п\'ятнадцять тисяч правок.',
      detailText: 'Боти знайшли один одного і влаштували секретний чат сьогодні.',
      spokenText: 'Боти знайшли один одного і влаштували секретний чат сьогодні.',
    });
    expect(issues.some((issue) => /name list/i.test(issue))).toBe(true);
  });

  it('flags a detail that only restates the headline', () => {
    const issues = findCopyIssues({
      sourceText: 'Claude тепер може сам писати листи і шарити файли в Gmail. Claude Cowork стежить за роботою бота з телефону.',
      coreFact: 'Claude тепер може сам писати листи і шарити файли.',
      headline: 'Claude пише листи і шарить файли самостійно.',
      detailText: 'Claude тепер може сам писати листи і шарити файли.',
      spokenText: 'Claude пише листи і шарить файли самостійно сьогодні.',
    });
    expect(issues.some((issue) => /repeats the headline/i.test(issue))).toBe(true);
  });

  it('flags spoken copy that narrates a side comment instead of the headline', () => {
    const issues = findCopyIssues({
      sourceText: 'OpenAI зробила стажера. Анонс вийшов буквально наступного дня після чергового скандалу.',
      coreFact: 'OpenAI зробила стажера, який виконує завдання подібно до кваліфікованого науковця.',
      headline: 'OpenAI зробила стажера, який виконує завдання подібно до кваліфікованого науковця.',
      detailText: 'Анонс вийшов буквально наступного дня після чергового скандалу.',
      spokenText: 'Анонс вийшов буквально наступного дня після чергового скандалу.',
    });
    expect(issues.some((issue) => /side comment/i.test(issue))).toBe(true);
  });

  it('flags an otherwise in-band sentence that splices two thoughts', () => {
    const issues = findCopyIssues({
      ...goodShot,
      headline: 'OpenAI зробила стажера — модель пише код сьогодні.',
      detailText: 'Компанія запустила агента — він сам робить робочі завдання.',
    });
    expect(issues).toContain('headline splices two thoughts with a dash or semicolon');
    expect(issues).toContain('detailText splices two thoughts with a dash or semicolon');
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

  it('repairs in-band dash-spliced headline and detail without keeping the splice', () => {
    const repaired = repairShotCopy({
      shot: 1,
      prompt: 'keep-this-prompt',
      headline: 'OpenAI зробила стажера — модель пише код сьогодні.',
      detailText: 'Компанія запустила агента — він сам робить робочі завдання.',
      spokenText: 'OpenAI випустила внутрішнього агента для написання робочого коду.',
      sourceText: 'OpenAI випустила внутрішнього агента для написання коду. Агент виконує робочі завдання в чаті без нагляду сьогодні.',
    });
    expect(repaired.prompt).toBe('keep-this-prompt');
    expect(findCopyIssues(repaired)).toEqual([]);
    expect(repaired.headline).not.toMatch(/\s[—–-]\s/);
    expect(repaired.detailText).not.toMatch(/\s[—–-]\s/);
  });

  it('repairs overlay from the digest fact instead of the author joke', () => {
    const repaired = repairShotCopy({
      shot: 1,
      prompt: 'keep-this-prompt',
      headline: 'Того, хто наливає каву і щось там форматує.',
      detailText: 'Нарешті хтось перевірить, чи не плутає ChatGPT «паляницю» з «москаликом».',
      spokenText: 'Того, хто наливає каву і щось там форматує.',
      sourceText: 'Мінцифра зробила рейтинг ШІ, який знає українську. Нарешті хтось перевірить, чи не плутає ChatGPT «паляницю» з «москаликом». Тепер будуть вірити табличкам. Мінцифра запускає перший національний рейтинг LLM українською сьогодні.',
    });
    expect(repaired.prompt).toBe('keep-this-prompt');
    expect(repaired.headline).toMatch(/Мінцифра/i);
    expect(repaired.detailText).not.toMatch(/паляниц/i);
    expect(repaired.headline).not.toMatch(/наливає каву/i);
    expect(findCopyIssues(repaired)).toEqual([]);
  });

  it('puts the headline fact in spokenText instead of a side comment', () => {
    const repaired = repairShotCopy({
      shot: 1,
      prompt: 'keep-this-prompt',
      headline: 'OpenAI зробила стажера, який виконує завдання подібно до кваліфікованого науковця.',
      detailText: 'Анонс вийшов буквально наступного дня після чергового скандалу.',
      spokenText: 'Анонс вийшов буквально наступного дня після чергового скандалу.',
      sourceText: 'OpenAI зробила стажера, який виконує завдання подібно до кваліфікованого науковця. Анонс вийшов буквально наступного дня після чергового скандалу.',
    });
    expect(repaired.spokenText).toMatch(/OpenAI зробила стажера/i);
    expect(repaired.spokenText).not.toMatch(/^Анонс вийшов/i);
    expect(findCopyIssues(repaired)).toEqual([]);
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
