// Live E2E against the CONNECTED Supabase project (read-only; anonymous visitor).
// Run: npm run build && npx vite preview --port 4180 &  then  node tests/e2e/live-supabase.mjs [screenshot-dir]
// Expected numbers come from the imported seed: 209 published items (7 drafts hidden).
// Network failures are retried at most 3 times via the page's own "retry" button and are reported, never hidden.
import { chromium } from 'playwright';
const S = process.argv[2] ?? '/tmp'; const base = process.env.BASE_URL ?? 'http://localhost:4180';
const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, locale: 'he-IL' });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const res = []; let retries = 0;
const ok = (name, pass, detail = '') => { res.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail); };
const status = async () => {
  await p.waitForFunction(() => { const el = document.querySelector('[role=status]'); return el && !/טוען/.test(el.textContent) && el.textContent.trim().length > 0; }, null, { timeout: 45000 }).catch(() => {});
  let t = (await p.locator('[role=status]').first().innerText().catch(() => '')).trim();
  for (let i = 0; i < 3 && /נכשלה/.test(t); i++) {
    retries++; await p.getByRole('button', { name: 'לנסות שוב' }).first().click().catch(() => {});
    await p.waitForFunction(() => { const el = document.querySelector('[role=status]'); return el && !/טוען/.test(el.textContent); }, null, { timeout: 45000 }).catch(() => {});
    t = (await p.locator('[role=status]').first().innerText().catch(() => '')).trim();
  }
  return t;
};
const settle = async (sel) => p.locator(sel).first().waitFor({ timeout: 45000 }).catch(() => {});
const num = (t) => /לא נמצאו|אין תוצאות/.test(t) ? 0 : Number((t.match(/[\d,]+/) || ['-1'])[0].replace(/,/g, ''));

await p.goto(base + '/library', { waitUntil: 'domcontentloaded', timeout: 15000 }); let t = await status();
ok('library total = 209 published', num(t) === 209, t);
ok('no demo banner (live Supabase)', (await p.locator('.demo-banner').count()) === 0);
await p.screenshot({ path: `${S}/live-library.png` });

for (const [q, want] of [['type=article', 15], ['type=book', 4], ['type=leaflet', 5], ['type=answer', 3], ['type=live', 2], ['type=audio', 2], ['series=or-haneeman', 24], ['series=perek-yomi', 2], ['topic=pesach', 5], ['provider=hm-news', 15]]) {
  await p.goto(base + '/library?' + q, { waitUntil: 'domcontentloaded', timeout: 15000 }); t = await status(); ok(`filter ${q} = ${want}`, num(t) === want, t);
}
await p.goto(base + '/library?q=' + encodeURIComponent('מאזוז')); const a = num(await status());
ok('search "מאזוז" returns results', a > 0, String(a));
await p.goto(base + '/library?q=' + encodeURIComponent('שליט״א')); const g1 = num(await status());
await p.goto(base + '/library?q=' + encodeURIComponent('שליטא')); const g2 = num(await status());
ok('search normalises gershayim (שליט״א == שליטא)', g1 > 0 && g1 === g2, `${g1} vs ${g2}`);
await p.goto(base + '/library?q=' + encodeURIComponent('התמודדות נותנת טעם')); const d = num(await status());
ok('search does not surface draft (legacy channel)', d === 0, String(d));

// Item page + YouTube player (click-to-load)
await p.goto(base + '/library?type=video&sort=catalog', { waitUntil: 'domcontentloaded', timeout: 15000 }); await status();
const href = await p.locator('.card-title a').first().getAttribute('href');
await p.goto(base + href, { waitUntil: 'domcontentloaded', timeout: 15000 }); await p.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
const poster = p.locator('button.media-poster'); await settle('button.media-poster');
ok('item page renders poster (no autoplay, no iframe before click)', (await poster.count()) === 1 && (await p.locator('iframe').count()) === 0, decodeURI(href));
await poster.click(); await p.waitForTimeout(500);
const src = await p.locator('.media-frame iframe').getAttribute('src').catch(() => '');
ok('click loads official YouTube embed', /youtube(-nocookie)?\.com\/embed\/[\w-]{11}/.test(src || ''), (src || '').slice(0, 70));
ok('item shows sources / attribution', (await p.getByText(/מקור/).count()) > 0);
await p.screenshot({ path: `${S}/live-item.png` });

// Drafts are not reachable
for (const slug of ['תפילה-והקשר-לבורא-עולם-שיחה-לימים-נוראים-283e01', 'אגרות-הנאמן-5e8221']) {
  await p.goto(base + '/item/' + encodeURIComponent(slug)); await p.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500);
  const body = await p.locator('main').innerText().catch(() => '');
  ok(`draft not shown: ${slug.slice(0, 20)}…`, !(await p.locator('h1').innerText().catch(() => '')).includes(slug.split('-')[0]) || /לא נמצא/.test(body), (await p.locator('h1').innerText().catch(() => '')).slice(0, 40));
}
// Other public pages
for (const [path, sel] of [['/series', '.card, a[href^="/series/"]'], ['/series/or-haneeman', '.card-title'], ['/topics', 'a[href^="/topics/"]'], ['/books', '.card-title, .book'], ['/responsa', 'h1'], ['/institutions', 'h2, h3'], ['/about', 'h1'], ['/sources', 'a[href^="http"]']]) {
  await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 15000 }); await settle(sel);
  const n = await p.locator(sel).count(); ok(`page ${path} renders data`, n > 0, `${n} × ${sel}`);
}
console.log('page errors:', errors.join(' | ') || 'none');
console.log('retries after network failure:', retries);
console.log(`TOTAL ${res.filter((r) => r.pass).length}/${res.length}`);
await b.close();
process.exitCode = res.every((r) => r.pass) ? 0 : 1;
