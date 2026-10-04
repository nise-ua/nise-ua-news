import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'patchright';

const publicDir = fileURLToPath(new URL('.', import.meta.url));
const shotDir = fileURLToPath(new URL('../../output/qa/dashboard-reality-check/', import.meta.url));
const liveBase = (process.env.DASHBOARD_BASE_URL || '').replace(/\/$/, '');

const viewports = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

const pages = [
  {
    name: 'digests',
    path: '/index.html',
    control: { role: 'link', name: 'Статті' },
    landsOn: /\/articles\.html$/,
  },
  {
    name: 'articles',
    path: '/articles.html',
    control: { role: 'button', name: 'Створити дайджест' },
  },
  {
    name: 'settings',
    path: '/settings.html',
    control: { role: 'link', name: /До панелі керування/ },
    landsOn: /\/index\.html$/,
  },
];

const stubs = {
  '/health': { status: 'ok', version: 'test', buildDate: '2026-10-03' },
  '/api/digests': [],
  '/api/articles': [],
  '/api/articles/stats': { total: 0, new: 0, processing: 0, used: 0 },
  '/api/settings': {
    general: {
      llmVendor: { value: 'anthropic' },
      model: { value: 'claude-test' },
      nodeEnv: { value: 'test' },
      baseUrl: { value: 'http://127.0.0.1' },
      dbPath: { value: ':memory:' },
    },
  },
};

function contentType(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  return types[extname(filePath)] || 'application/octet-stream';
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/Executable doesn't exist/i.test(msg)) throw err;
    return chromium.launch({ headless: true, channel: 'chrome' });
  }
}

async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (Object.hasOwn(stubs, url.pathname)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stubs[url.pathname]));
      return;
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = join(publicDir, rel === '/' ? 'index.html' : rel);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const port = await listen(server);
  return { server, base: `http://127.0.0.1:${port}` };
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      url: location.href,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

describe('dashboard reality check', () => {
  let browser;
  let server;
  let base;

  beforeAll(async () => {
    await mkdir(shotDir, { recursive: true });
    browser = await launchBrowser();
    if (liveBase) {
      base = liveBase;
      return;
    }
    const fixture = await startFixtureServer();
    server = fixture.server;
    base = fixture.base;
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('health returns status ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
  });

  for (const view of viewports) {
    for (const entry of pages) {
      it(`${entry.name} fits ${view.name} (${view.width}x${view.height})`, async () => {
        const context = await browser.newContext({
          viewport: { width: view.width, height: view.height },
          isMobile: view.mobile,
          hasTouch: view.mobile,
        });
        const page = await context.newPage();
        try {
          await page.goto(`${base}${entry.path}`, { waitUntil: 'domcontentloaded' });
          const control = page.getByRole(entry.control.role, { name: entry.control.name });
          await control.waitFor({ state: 'visible' });
          expect(await control.isVisible()).toBe(true);
          if (!entry.landsOn) expect(await control.isEnabled()).toBe(true);
          const box = await measureOverflow(page);
          await page.screenshot({ path: join(shotDir, `${entry.name}-${view.name}.png`) });
          expect(box.overflowX, `${box.url} scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}`).toBe(false);
        } finally {
          await context.close();
        }
      }, 20000);
    }
  }

  it('digest list link opens articles', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Статті' }).click();
      await page.waitForURL(/\/articles\.html$/);
      const create = page.getByRole('button', { name: 'Створити дайджест' });
      await create.waitFor({ state: 'visible' });
      expect(await create.isEnabled()).toBe(true);
    } finally {
      await context.close();
    }
  }, 20000);

  it('settings link returns to the digest list', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: /До панелі керування/ }).click();
      await page.waitForURL(/\/index\.html$/);
      const articles = page.getByRole('link', { name: 'Статті' });
      await articles.waitFor({ state: 'visible' });
      expect(await articles.isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  }, 20000);

  it('writes a short report next to the screenshots', async () => {
    const report = [
      '# Dashboard reality check',
      '',
      `- Base: ${base}`,
      `- Live NAS: ${liveBase ? 'yes' : 'no (local fixture; set DASHBOARD_BASE_URL to check the NAS)'}`,
      '- Overall: see this Vitest run',
      '',
    ].join('\n');
    await writeFile(join(shotDir, 'report.md'), report);
    const saved = await readFile(join(shotDir, 'report.md'), 'utf8');
    expect(saved).toContain(base);
  });
});
