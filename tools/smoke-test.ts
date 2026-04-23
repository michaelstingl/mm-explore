#!/usr/bin/env bun
/**
 * Frontend smoke test. Spawns the dev server, drives a headless Chromium
 * through the main flows (initial load, day picker, mode toggle, settings),
 * captures screenshots + DOM forensics, and writes a report.
 *
 * Usage:
 *   bun run smoke           # launches dev server on port 8000
 *   bun run smoke --keep    # keeps the dev server running after the test
 *
 * Output: tools/smoke-out/{01..04}-*.png + report.json
 */
import { chromium, type ConsoleMessage } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PORT = 8000;
const HOST = `http://localhost:${PORT}`;
const GIST_RAW =
  'https://gist.githubusercontent.com/michaelstingl/852bd9ae11057925034a94eeed6d168f/raw/travel-bundle-v1.json';
const URL = `${HOST}/?gist=${encodeURIComponent(GIST_RAW)}`;
const OUT = 'tools/smoke-out';

const keep = process.argv.includes('--keep');

async function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return;
    } catch {}
    await Bun.sleep(200);
  }
  throw new Error(`server did not come up on :${port}`);
}

async function main() {
  if (existsSync(OUT)) await rm(OUT, { recursive: true });
  await mkdir(OUT, { recursive: true });

  // Launch dev server
  const server: ChildProcess = spawn('bun', ['--hot', 'dev.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  const cleanup = () => {
    if (!server.killed) server.kill('SIGTERM');
  };
  process.on('SIGINT', () => (cleanup(), process.exit(130)));

  try {
    await waitForPort(PORT);
    console.log(`[smoke] server ready on :${PORT}`);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      locale: 'de-DE',
    });
    const page = await ctx.newPage();

    const consoleLogs: { type: string; text: string }[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m: ConsoleMessage) =>
      consoleLogs.push({ type: m.type(), text: m.text() })
    );
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    // 1. Initial
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/01-initial.png` });

    const facts = await page.evaluate(() => {
      const root = document.querySelector('[x-data="app"]') as HTMLElement | null;
      // @ts-expect-error — Alpine is a CDN global
      const data = root && window.Alpine ? window.Alpine.$data(root) : null;
      return {
        title: document.title,
        view: data?.view,
        mode: data?.mode,
        bundleLoaded: !!data?.bundle,
        daysCount: data?.bundle?.days?.length ?? null,
        placesCount: data?.bundle?.places?.length ?? null,
        locale: data?.locale,
        showIOSInstallHint: data?.showIOSInstallHint,
      };
    });

    // 2. Day picker — open via Alpine state (avoids layout/overlay flakiness)
    let dpOk = false;
    let firstMonthOverflow: Record<string, unknown> | null = null;
    const dpState = await page.evaluate(() => {
      const root = document.querySelector('[x-data="app"]') as HTMLElement | null;
      // @ts-expect-error Alpine global
      const d = root && window.Alpine ? window.Alpine.$data(root) : null;
      if (d) d.showDayPicker = true;
      return { hasAlpine: !!window.Alpine, hasData: !!d, value: d?.showDayPicker };
    });
    console.log('[smoke] dp state after set:', JSON.stringify(dpState));
    await page.waitForSelector('.cal-cell', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(800);
    const backdropVisible = await page.evaluate(() => {
      const el = document.querySelector('.sheet-backdrop') as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { display: getComputedStyle(el).display, width: r.width, height: r.height };
    });
    console.log('[smoke] backdrop:', JSON.stringify(backdropVisible));
    await page.screenshot({ path: `${OUT}/02-daypicker.png` });
    dpOk = true;

    {
      firstMonthOverflow = await page.evaluate(() => {
        const m = document.querySelector('.cal-month');
        if (!m) return null;
        const cells = [...m.querySelectorAll<HTMLElement>('.cal-cell')];
        const boxes = cells.map((c) => {
          const r = c.getBoundingClientRect();
          return { t: c.textContent?.trim().slice(0, 10), x: Math.round(r.x), w: Math.round(r.width), cls: c.className, gridCol: getComputedStyle(c).gridColumnStart };
        });
        const xs = cells.map((c) => c.getBoundingClientRect().right);
        const gridRect = m.querySelector('.cal-grid')?.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          gridWidth: gridRect ? Math.round(gridRect.width) : null,
          gridRight: gridRect ? Math.round(gridRect.right) : null,
          maxRight: Math.round(Math.max(...xs)),
          overflowsViewport: Math.max(...xs) > window.innerWidth,
          cellCount: cells.length,
          allCells: boxes,
          overflowing: boxes.filter((b) => b.x + b.w > 390),
        };
      });

      // Close sheet via Alpine state (more reliable than clicking with dev-server reloads)
      await page.evaluate(() => {
        const root = document.querySelector('[x-data="app"]') as HTMLElement | null;
        // @ts-expect-error Alpine global
        if (root && window.Alpine) window.Alpine.$data(root).showDayPicker = false;
      });
      await page.waitForTimeout(300);
    }

    // 3. Mode toggle — click "Erleben" to flip away from default transit
    const mode = page.getByRole('button', { name: /Erleben/ }).first();
    let modeOk = false;
    if (await mode.count()) {
      await mode.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/03-mode-toggled.png` });
      modeOk = true;
    }

    // 4. Settings
    const settings = page.locator('[aria-label="Einstellungen"]').first();
    let settingsOk = false;
    if (await settings.count()) {
      await settings.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/04-settings.png`, fullPage: true });
      settingsOk = true;
    }

    await browser.close();

    const report = {
      facts,
      dpOk,
      modeOk,
      settingsOk,
      firstMonthOverflow,
      pageErrors,
      consoleErrors: consoleLogs
        .filter((l) => l.type === 'error' || l.type === 'warning')
        .slice(0, 20),
      consoleTotal: consoleLogs.length,
    };
    await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    if (firstMonthOverflow?.overflowsViewport) {
      console.error('[smoke] FAIL: calendar overflows viewport');
      process.exitCode = 1;
    }
    if (pageErrors.length) {
      console.error('[smoke] FAIL: page errors present');
      process.exitCode = 1;
    }
  } finally {
    if (!keep) cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
