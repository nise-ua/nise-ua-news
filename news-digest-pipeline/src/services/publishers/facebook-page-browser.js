/**
 * Publish digest text to a Facebook Page via Patchright composer.
 * Graph /feed text posts from the Meta app are silently hidden; composer posts are not.
 */

import { chromium } from 'patchright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_DIR = join(__dirname, '..', '..', '..', '.fb-page-profile');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[fb-page ${ts}] ${msg}`);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isVisible(locator, timeout = 800) {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function clickFirstVisible(page, selectors, { timeout = 2500, force = false } = {}) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (!(await isVisible(loc, timeout))) continue;
    await loc.click({ force, timeout: 5000 });
    return selector;
  }
  return null;
}

async function looksLoggedIn(page) {
  return Boolean(await clickableLoggedInMarker(page));
}

async function clickableLoggedInMarker(page) {
  const markers = [
    '[aria-label="Create a post"]',
    '[aria-label="Створити публікацію"]',
    '[aria-label="Your profile"]',
    '[aria-label="Account"]',
    '[aria-label="Меню облікового запису"]',
    'span:has-text("What\'s on your mind")',
    'span:has-text("Про що ви думаєте")',
  ];
  for (const selector of markers) {
    if (await isVisible(page.locator(selector).first(), 1500)) return selector;
  }
  return null;
}

async function switchToPage(page, { pageId, pageName }) {
  log(`Opening Page ${pageId}...`);
  await page.goto(`https://www.facebook.com/${pageId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await sleep(rand(2500, 4000));

  const switched = await clickFirstVisible(page, [
    '[aria-label="Switch now"]',
    '[aria-label="Switch Now"]',
    'div[role="button"]:has-text("Switch now")',
    'div[role="button"]:has-text("Switch Now")',
    'span:has-text("Switch now")',
    'span:has-text("Switch Now")',
    'div[role="button"]:has-text("Перемкнутися зараз")',
    'span:has-text("Перемкнутися зараз")',
    'div[role="button"]:has-text("Перемкнутися")',
  ], { timeout: 2000 });

  if (switched) {
    log(`Clicked Page switch: ${switched}`);
    await sleep(rand(2500, 4000));
    return;
  }

  if (!pageName) {
    log('No Switch banner and no page name — continuing on this view.');
    return;
  }

  log(`Trying account menu → ${pageName}...`);
  const menu = await clickFirstVisible(page, [
    '[aria-label="Your profile"]',
    '[aria-label="Account"]',
    '[aria-label="Меню облікового запису"]',
    '[aria-label="Account controls and settings"]',
  ], { timeout: 2000 });

  if (!menu) {
    log('Account menu not found — posting from current Page view.');
    return;
  }

  await sleep(rand(800, 1500));
  const profile = await clickFirstVisible(page, [
    `[role="listitem"]:has-text("${pageName}")`,
    `div[role="button"]:has-text("${pageName}")`,
    `span:has-text("${pageName}")`,
    `[aria-label="${pageName}"]`,
  ], { timeout: 2500 });

  if (profile) {
    log(`Switched profile via ${profile}`);
    await sleep(rand(2500, 4000));
  } else {
    log(`Could not click "${pageName}" in the menu — posting from current view.`);
    await page.keyboard.press('Escape').catch(() => {});
  }
}

async function openComposer(page) {
  log('Opening composer...');
  const opened = await clickFirstVisible(page, [
    'span:has-text("What\'s on your mind")',
    'span:has-text("Про що ви думаєте")',
    '[aria-label="Create a post"]',
    '[aria-label="Створити публікацію"]',
    '[aria-label="Create post"]',
    'div[role="button"]:has-text("Create a post")',
    'div[role="button"]:has-text("Створити публікацію")',
    'div[role="button"]:has-text("Write something")',
    'div[role="button"]:has-text("Напишіть щось")',
  ], { timeout: 3000 });

  if (!opened) throw new Error('Could not open the Page composer. Switch to Nise-ua first, then retry.');
  log(`Composer trigger: ${opened}`);
  await sleep(rand(2500, 4000));
}

async function insertDigest(page, text) {
  log('Focusing editor...');
  const textbox = page.locator('[role="textbox"][contenteditable="true"]').first();
  await textbox.waitFor({ state: 'visible', timeout: 12000 });
  await textbox.click();
  await sleep(rand(400, 900));

  log(`Inserting text (${text.length} chars)...`);
  await page.keyboard.insertText(text);
  await sleep(rand(2500, 4500));

  const inserted = await textbox.innerText().catch(() => '');
  if (String(inserted).trim().length < 10) {
    throw new Error('Text insertion failed — composer stayed empty');
  }
}

async function removeLinkPreviews(page) {
  log('Removing link previews...');
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(1800);
    const clicked = await clickFirstVisible(page, [
      '[aria-label="Remove link preview from your post"]',
      '[aria-label="Видалити превью посилання з публікації"]',
      '[aria-label="Remove preview"]',
    ], { timeout: 800 });
    if (!clicked) {
      log('No more link previews.');
      return;
    }
    log(`Removed preview via ${clicked}`);
  }
}

async function submitPost(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(rand(400, 800));

  const nextBtn = page.locator('[aria-label="Next"], [aria-label="Далі"]').first();
  if (await isVisible(nextBtn, 2500)) {
    if ((await nextBtn.getAttribute('aria-disabled')) === 'true') {
      throw new Error('Next is disabled — Facebook did not accept the text');
    }
    log('Clicking Next...');
    await nextBtn.click({ force: true });
    await sleep(rand(1800, 2800));
  }

  const postBtn = page.locator('[aria-label="Post"], [aria-label="Опублікувати"]').first();
  await postBtn.waitFor({ state: 'visible', timeout: 8000 });
  if ((await postBtn.getAttribute('aria-disabled')) === 'true') {
    throw new Error('Post is disabled');
  }
  log('Clicking Post...');
  await postBtn.click({ force: true });
  await sleep(rand(3500, 5500));
}

/**
 * @param {{
 *   pageId: string,
 *   pageName?: string,
 *   content?: string,
 *   profileDir?: string,
 *   loginOnly?: boolean,
 *   timezoneId?: string,
 * }} opts
 */
export async function publishToFacebookPageViaBrowser({
  pageId,
  pageName = '',
  content = '',
  profileDir = DEFAULT_PROFILE_DIR,
  loginOnly = false,
  timezoneId = process.env.FACEBOOK_BROWSER_TIMEZONE || 'America/New_York',
} = {}) {
  if (!pageId) {
    return { error: '[facebook-page-browser] Missing pageId' };
  }
  if (!loginOnly && (!content || String(content).trim().length < 10)) {
    return { error: '[facebook-page-browser] Content is empty or too short' };
  }

  mkdirSync(profileDir, { recursive: true });
  log(`Launching Patchright (${profileDir})...`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 860 },
    locale: 'uk-UA',
    timezoneId,
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    log('Opening Facebook...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(2500, 4000));

    if (!(await looksLoggedIn(page))) {
      if (loginOnly) {
        log('Log in as the Page admin, then switch to the Page. Close the window when done.');
        await page.waitForSelector(
          '[aria-label="Create a post"], [aria-label="Створити публікацію"], [aria-label="Your profile"]',
          { timeout: 300000 },
        ).catch(() => {});
        await switchToPage(page, { pageId, pageName });
        log('Login session saved.');
        return { ok: true, loginOnly: true };
      }
      return {
        error: '[facebook-page-browser] Not logged in. Run: node scripts/fb-page-publish.js --login',
      };
    }

    if (loginOnly) {
      await switchToPage(page, { pageId, pageName });
      log('Already logged in. Session is on the Page if the switch succeeded.');
      await sleep(2000);
      return { ok: true, loginOnly: true };
    }

    await switchToPage(page, { pageId, pageName });
    await page.goto(`https://www.facebook.com/${pageId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(rand(2000, 3500));

    for (let i = 0; i < rand(1, 2); i++) {
      await page.mouse.wheel(0, rand(180, 320));
      await sleep(rand(600, 1200));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(rand(800, 1400));

    await openComposer(page);
    await insertDigest(page, content);
    await removeLinkPreviews(page);
    await sleep(rand(2000, 4000));
    await page.screenshot({ path: '/tmp/fb-page-before-post.png' }).catch(() => {});
    await submitPost(page);
    log('Composer publish clicked.');
    return { ok: true, via: 'browser' };
  } catch (err) {
    await page.screenshot({ path: '/tmp/fb-page-publish-error.png' }).catch(() => {});
    log(`Error: ${err.message}`);
    log('Screenshot: /tmp/fb-page-publish-error.png');
    return { error: `[facebook-page-browser] ${err.message}` };
  } finally {
    await context.close().catch(() => {});
  }
}

export { DEFAULT_PROFILE_DIR };
