// Browser smoke/E2E (Playwright + axe-core). NOT a project dependency and NOT for Termux:
// run on a machine with Chromium:  npm i --no-save playwright axe-core && npm run build && npm run preview & node tests/e2e/smoke.mjs
// E2E smoke against `vite preview` (production build, DEMO mode). Chromium in a Linux container —
// NOT a Termux/phone check. Writes screenshots to the project's docs/screenshots and a JSON report.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = 'http://127.0.0.1:4173';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = ROOT + 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(readFileSync(ROOT + 'src/data/seed.json', 'utf8'));
const firstItem = seed.content.find((c) => c.type === 'video' && c.status === 'published' && c.durationSeconds > 2000);
const report = { checks: [], axe: {}, overflow: [], consoleErrors: [] };
const ok = (name, pass, detail = '') => { report.checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ROUTES = ['/', '/library', `/item/${firstItem.slug}`, '/series/or-haneeman', '/topics', '/books', '/responsa', '/ask', '/about', '/institutions', '/sources', '/favorites', '/p/accessibility', '/no-such-page'];

async function newPage(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 800 : 900 }, locale: 'he-IL', ...opts });
  // Block third-party network (YouTube thumbnails etc.) so results don't depend on the sandbox network.
  await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) report.consoleErrors.push(`${width} ${page.url()} ${m.text()}`); });
  page.on('pageerror', (e) => report.consoleErrors.push(`${width} ${page.url()} pageerror ${e.message}`));
  return { ctx, page };
}
async function settle(page) { await page.waitForLoadState('networkidle'); await page.waitForTimeout(400); }

// 1) routes × viewports: overflow + axe
for (const width of [360, 390, 768, 1440]) {
  const { ctx, page } = await newPage(width);
  for (const r of ROUTES) {
    await page.goto(BASE + r);
    await settle(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) report.overflow.push(`${width}px ${r} +${over}px`);
    if (width === 390 || width === 1440) {
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })));
      report.axe[`${width} ${r}`] = res;
    }
  }
  await ctx.close();
}
ok('no horizontal overflow at 360/390/768/1440 on all public routes', report.overflow.length === 0, report.overflow.join('; '));
const axeTotal = Object.values(report.axe).flat();
ok('axe WCAG 2.2 A/AA: no violations', axeTotal.length === 0, [...new Set(axeTotal.map((v) => `${v.id}(${v.impact})`))].join(', '));

// 2) screenshots
{
  const shots = [[390, '/', 'home-390'], [1440, '/', 'home-1440'], [390, '/library?type=short', 'library-shorts-390'], [1440, `/item/${firstItem.slug}`, 'item-1440'], [390, '/ask', 'ask-390'], [1440, '/books', 'books-1440']];
  for (const [w, r, name] of shots) {
    const { ctx, page } = await newPage(w);
    await page.goto(BASE + r); await settle(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  }
  const { ctx, page } = await newPage(390, { colorScheme: 'dark' });
  await page.goto(BASE + '/'); await settle(page);
  await page.screenshot({ path: `${OUT}/home-dark-390.png` });
  await ctx.close();
}

// 3) keyboard, reduced motion, search, filters, YouTube click-to-load
{
  const { ctx, page } = await newPage(1440, { reducedMotion: 'reduce' });
  await page.goto(BASE + '/'); await settle(page);
  await page.keyboard.press('Tab');
  ok('first Tab lands on the skip link', (await page.evaluate(() => document.activeElement?.className)) === 'skip-link');
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-2').trim());
  ok('prefers-reduced-motion zeroes motion tokens', dur === '0ms', dur);
  const animated = await page.evaluate(() => [...document.querySelectorAll('section, .action-tile')].some((el) => (el.getAttribute('style') ?? '').includes('transform')));
  ok('no JS-driven transforms under reduced motion', !animated);

  await page.keyboard.press('/');
  await page.waitForSelector('.search-panel', { timeout: 3000 });
  await page.keyboard.type('ארבעת המינים');
  await page.waitForSelector('.search-results [role=option] a', { timeout: 4000 });
  const n = await page.locator('.search-results [role=option]').count();
  ok('search panel opens with "/" and returns results for Hebrew query', n >= 2, `${n} options`);
  await page.keyboard.press('Escape');
  ok('Escape closes the search panel', (await page.locator('.search-panel').count()) === 0);

  await page.goto(BASE + '/library'); await settle(page);
  await page.getByRole('button', { name: 'קצר', exact: true }).click();
  await page.waitForURL(/type=short/);
  await settle(page);
  const count1 = await page.locator('[role=status]').first().innerText();
  await page.reload(); await settle(page);
  ok('library filter is preserved in the URL across reload', page.url().includes('type=short') && (await page.getByRole('button', { name: 'קצר', exact: true }).getAttribute('aria-pressed')) === 'true', count1);
  await page.getByRole('link', { name: 'עמוד 2' }).first().click();
  await page.waitForURL(/page=2/);
  ok('pagination keeps filters', page.url().includes('type=short') && page.url().includes('page=2'));

  await page.goto(BASE + `/item/${firstItem.slug}`); await settle(page);
  ok('YouTube iframe not loaded before click', (await page.locator('iframe').count()) === 0);
  await page.getByRole('button', { name: /ניגון הסרטון/ }).click();
  const src = await page.locator('iframe').getAttribute('src');
  ok('click loads official youtube-nocookie embed only', /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(src ?? ''), src ?? '');
  await ctx.close();
}

// 4) ask → track (demo)
{
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/ask'); await settle(page);
  await page.getByRole('textbox', { name: 'השאלה' }).fill('האם מותר לומר סליחות ביחיד ללא מניין?');
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: 'שליחת השאלה' }).click();
  await page.waitForSelector('#trk');
  const link = await page.inputValue('#trk');
  ok('question submitted; private tracking link uses URL fragment', /\/track#code=[A-Z0-9]{4}-[A-Z0-9]{4}&token=/.test(link));
  await page.goto(link); await settle(page);
  ok('tracking page shows status and strips the secret from the address bar', (await page.getByText('התקבלה').count()) > 0 && !page.url().includes('token'), page.url());
  await ctx.close();
}

// 5) CMS end-to-end in demo: editor creates → review; reviewer approves → publishes; public page shows it
{
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/admin'); await settle(page);
  await page.getByRole('button', { name: 'עורך' }).click();
  await page.goto(BASE + '/admin/content/new'); await settle(page);
  await page.getByLabel('כותרת', { exact: false }).first().fill('בדיקת מערכת — שיעור חדש');
  await page.getByRole('button', { name: 'יצירה כטיוטה' }).click();
  await page.waitForURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  const editUrl = page.url();
  await page.getByRole('button', { name: /העברה ל„בבדיקה”/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/admin-editor-390.png` });
  ok('editor cannot see a publish button', (await page.getByRole('button', { name: /„פורסם”/ }).count()) === 0);
  await page.getByRole('button', { name: 'יציאה' }).click();
  await page.getByRole('button', { name: 'בודק' }).click();
  await page.goto(editUrl); await settle(page);
  await page.getByRole('button', { name: /העברה ל„מאושר”/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /העברה ל„פורסם”/ }).click();
  await page.waitForTimeout(300);
  await page.reload(); await settle(page);
  ok('status persisted after reload (published)', (await page.locator('.badge', { hasText: 'פורסם' }).count()) > 0);
  await page.goto(BASE + '/library?q=' + encodeURIComponent('בדיקת מערכת')); await settle(page);
  ok('published item appears in public library search', (await page.getByRole('link', { name: 'בדיקת מערכת — שיעור חדש' }).count()) === 1);
  await ctx.close();
  const wide = await newPage(1440);
  await wide.page.goto(BASE + '/admin'); await settle(wide.page);
  await wide.page.getByRole('button', { name: 'מנהל' }).click();
  await wide.page.goto(BASE + '/admin/content'); await settle(wide.page);
  await wide.page.screenshot({ path: `${OUT}/admin-list-1440.png` });
  await wide.ctx.close();
}

ok('no console errors / page errors', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5).join(' | '));
writeFileSync(ROOT + 'docs/e2e-report.json', JSON.stringify(report, null, 1));
await browser.close();
const failed = report.checks.filter((c) => !c.pass).length;
console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
