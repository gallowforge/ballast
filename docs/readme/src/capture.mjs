/**
 * Fresh captures of the real app for the README's Glass scenes, in the dark theme and the light one.
 * Everything comes from Ballast's own demo data (Alex, who is made up), on the live site by default.
 *
 *   node docs/readme/src/capture.mjs                    # every screen, both themes
 *   ORIGIN=http://localhost:4173 node docs/readme/src/capture.mjs   # against a local build
 *
 * Desktop screens are 1440 x 900 at 2x; phone screens are 390 x 844 at 3x. The runway frames are
 * the real salary slider, moved one step at a time, with the road and the sentence redrawn by the
 * app for each value. The hero frames are the same slider on a phone 420 wide, where the sentence
 * keeps its two lines for every value, so nothing on the screen jumps while the slider moves.
 *
 *   node docs/readme/src/capture.mjs hero               # only the hero's slider frames
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const ORIGIN = (process.env.ORIGIN ?? 'https://gallowforge.github.io/ballast').replace(/\/$/, '');
const OUT = resolve(HERE, '../.raw/shots');
const ONLY = process.argv[2];
mkdirSync(OUT, { recursive: true });

const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const HERO_PHONE = { ...PHONE, viewport: { width: 420, height: 910 } };

const settle = async (p) => {
  await p
    .locator('astro-island[ssr]')
    .first()
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(() => undefined);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(900);
};
const toReview = async (p) => {
  await p
    .locator('input[type=file]')
    .setInputFiles(resolve(REPO, 'tests/fixtures/sample-statement.csv'));
  await p.getByLabel('Import into').selectOption({ label: 'A new account…' });
  await p.getByLabel('Account name').fill('Example Bank current');
  await p.getByRole('button', { name: /^Review/ }).click();
  await p.getByText(/rows match/).waitFor();
  await p.evaluate(() => {
    const s = document.querySelector('section[aria-labelledby="review-title"]');
    const bar = document.querySelector('header')?.getBoundingClientRect().height ?? 64;
    scrollTo(0, s.getBoundingClientRect().top + scrollY - bar - 24);
  });
};
const scrollToSection =
  (id, gap = 24) =>
  async (p) =>
    p.evaluate(
      ([id, gap]) => {
        const s = document.querySelector(`section[aria-labelledby="${id}"]`);
        const bar = document.querySelector('header')?.getBoundingClientRect().height ?? 64;
        scrollTo(0, s.getBoundingClientRect().top + scrollY - bar - gap);
      },
      [id, gap],
    );
const salary = (v) => (p) =>
  p.evaluate((v) => {
    const el = document.querySelector('#whatif');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

/** Where the parts that the scenes lift out sit in each capture, in CSS px of the viewport.
 *  A box is a CSS selector, `text:<words>` (the element showing them) optionally followed by
 *  ` @ <selector>` (its nearest ancestor matching it), or `value=<text>` for an input. */
const measure = (p, boxes) =>
  p.evaluate((boxes) => {
    const out = {};
    for (const [k, spec] of Object.entries(boxes)) {
      let el = null;
      if (spec.startsWith('text:')) {
        const [t, up] = spec.slice(5).split(' @ ');
        const leaf = [...document.querySelectorAll('body *')].find(
          (e) => e.children.length === 0 && e.textContent.includes(t) && e.getClientRects().length,
        );
        el = up ? (leaf?.closest(up) ?? null) : (leaf ?? null);
      } else if (spec.startsWith('value=')) {
        el = [...document.querySelectorAll('input')].find((i) => i.value === spec.slice(6)) ?? null;
      } else el = document.querySelector(spec);
      const r = el?.getBoundingClientRect();
      out[k] = r ? [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10) : null;
    }
    return out;
  }, boxes);

const HOME = {
  hello: 'section[aria-labelledby="hello"]',
  safe: '#safe-title',
  sentence: 'text:is yours to spend today',
  month: 'section[aria-labelledby="month-title"]',
  road: 'section[aria-labelledby="road-title"]',
};
const RUNWAY = { title: '#rw-title', section: 'section[aria-labelledby="rw-title"]' };
const IMPORT = {
  review: 'section[aria-labelledby="review-title"]',
  status: 'section[aria-labelledby="review-title"] [role="status"]',
};
const INSIGHTS = { where: 'section[aria-labelledby="where-title"]', title: 'main h1' };
// [name, device, path, action, boxes]
const SHOTS = [
  ['d-home', DESK, 'home/', null, HOME],
  ['d-runway', DESK, 'runway/', null, RUNWAY],
  ['d-import', DESK, 'import/', toReview, IMPORT],
  ['d-insights', DESK, 'insights/', null, INSIGHTS],
  [
    'd-settings',
    DESK,
    'settings/',
    scrollToSection('data-title', 40),
    { data: 'section[aria-labelledby="data-title"]' },
  ],
  ['p-home', PHONE, 'home/', null, HOME],
  ['p-runway', PHONE, 'runway/', null, RUNWAY],
  ['p-import', PHONE, 'import/', toReview, IMPORT],
  ['p-insights', PHONE, 'insights/', null, INSIGHTS],
];
const rects = {};

// The slider (in cents): up until the road stops short of the date, down to a long road, and
// back to where it started.
const legs = [
  [310_000, 390_000, 14],
  [390_000, 230_000, 22],
  [230_000, 310_000, 12],
];
const drag = (legs) =>
  legs.flatMap(([a, z, n]) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i + 1) / n;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      return Math.round((a + (z - a) * e) / 5000) * 5000;
    }),
  );
const VALUES = drag(legs);
// The hero plays the same drag at 12 frames a second: the resting value first (the frame the loop
// holds and starts on), then 61 steps; the 62nd step is the resting frame again, so the loop closes.
const HERO_VALUES = [
  310_000,
  ...drag([
    [310_000, 390_000, 18],
    [390_000, 230_000, 28],
    [230_000, 310_000, 16],
  ]).slice(0, -1),
];

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctxs = {};
  for (const [k, dev] of [
    ['d', DESK],
    ['p', PHONE],
  ]) {
    const ctx = await browser.newContext({ ...dev, colorScheme: theme, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/home/?demo=1`);
    await settle(p);
    await p.close();
    ctxs[k] = ctx;
  }
  for (const [name, dev, path, action, boxes] of SHOTS) {
    if (ONLY && !name.startsWith(ONLY)) continue;
    const p = await ctxs[dev === DESK ? 'd' : 'p'].newPage();
    await p.goto(`${ORIGIN}/${path}`);
    await settle(p);
    await p.addStyleTag({ content: '.fab{display:none!important}' });
    if (action) await action(p);
    await p.waitForTimeout(500);
    if (boxes) rects[`${name}-${theme}`] = await measure(p, boxes);
    await p.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    await p.close();
    console.log('shot', name, theme);
  }
  if (!ONLY || ONLY === 'rw') {
    for (const k of ['d', 'p']) {
      const p = await ctxs[k].newPage();
      await p.goto(`${ORIGIN}/runway/`);
      await settle(p);
      await p.addStyleTag({ content: '.fab{display:none!important}' });
      rects[`${k}-rw-${theme}`] = await measure(p, RUNWAY);
      const snap = (i) =>
        p.screenshot({ path: `${OUT}/${k}-rw-${theme}-${String(i).padStart(2, '0')}.png` });
      for (const [i, v] of VALUES.entries()) {
        await salary(v)(p);
        await p.waitForTimeout(110);
        await snap(i);
      }
      await p.close();
      console.log('runway frames', k, theme, VALUES.length);
    }
  }
  if (!ONLY || ONLY === 'hero') {
    const ctx = await browser.newContext({
      ...HERO_PHONE,
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    let p = await ctx.newPage();
    await p.goto(`${ORIGIN}/home/?demo=1`);
    await settle(p);
    await p.close();
    p = await ctx.newPage();
    await p.goto(`${ORIGIN}/runway/`);
    await settle(p);
    await p.addStyleTag({ content: '.fab{display:none!important}' });
    const tops = [];
    for (const [i, v] of HERO_VALUES.entries()) {
      await salary(v)(p);
      await p.waitForTimeout(110);
      tops.push(await p.evaluate(() => document.querySelector('#whatif').getBoundingClientRect().top));
      await p.screenshot({ path: `${OUT}/h-rw-${theme}-${String(i).padStart(2, '0')}.png` });
    }
    await ctx.close();
    // The loop is only calm while the text above the slider keeps its line count.
    const jump = tops.findIndex((y) => Math.abs(y - tops[0]) > 1);
    if (jump > 0)
      throw new Error(
        `The runway screen jumps at hero step ${jump} (${HERO_VALUES[jump]}): try another width for HERO_PHONE.`,
      );
    console.log('hero frames', theme, HERO_VALUES.length);
  }
  for (const c of Object.values(ctxs)) await c.close();
}
await browser.close();
writeFileSync(`${OUT}/rw-values.json`, JSON.stringify(VALUES));
// Merged, so capturing one screen again keeps the others' boxes.
const known = existsSync(`${OUT}/rects.json`)
  ? JSON.parse(readFileSync(`${OUT}/rects.json`, 'utf8'))
  : {};
writeFileSync(`${OUT}/rects.json`, JSON.stringify({ ...known, ...rects }, null, 1));

// The privacy panel's terminal: the Content Security Policy the live site actually serves.
if (!ONLY || ONLY === 'csp') {
  const html = execFileSync('curl', ['-fsSL', `${ORIGIN}/home/`]).toString();
  const csp = html.match(/connect-src[^;"]*/)?.[0];
  writeFileSync(`${OUT}/csp.json`, JSON.stringify({ csp, origin: ORIGIN }));
  console.log('csp', csp);
}
