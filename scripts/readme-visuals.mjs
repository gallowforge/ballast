/**
 * Regenerates the README images in docs/readme/. It captures the built app in dark mode on a
 * desktop browser and a phone, using the made-up demo data, then composes each scene as a dark
 * card: a neutral browser window and a generic phone, plus a numbers banner and a social card.
 * Every scene has a wide version and a portrait one for phones; README.md picks with <picture>.
 *
 *   npm run build && node scripts/serve.mjs dist 4173 &
 *   npm run readme:visuals              # capture and compose
 *   npm run readme:visuals -- --compose # compose again from the last captures
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4173';
const RAW = 'docs/readme/.raw';
const OUT = 'docs/readme';
const COMPOSE_ONLY = process.argv.includes('--compose');
mkdirSync(RAW, { recursive: true });

const launch = () =>
  chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );

async function capture() {
  const browser = await launch();
  const desktop = await browser.newContext({
    viewport: { width: 1360, height: 860 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const phone = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  for (const ctx of [desktop, phone]) {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/home/?demo=1`);
    await p.waitForTimeout(1500);
    await p.close();
  }
  const shot = async (ctx, path, name, prep) => {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/${path}`);
    await p
      .locator('astro-island[ssr]')
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => undefined);
    // The demo banner and the floating add button are left out of the pictures.
    await p.addStyleTag({
      content: '.fab{display:none!important} .border-gold\\/40{display:none!important}',
    });
    await p.waitForTimeout(900);
    if (prep) await prep(p);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${RAW}/${name}.png` });
    await p.close();
    console.log('captured', name);
  };
  const toReview = async (p) => {
    await p.locator('input[type=file]').setInputFiles('tests/fixtures/sample-statement.csv');
    await p.getByLabel('Import into').selectOption({ label: 'A new account…' });
    await p.getByLabel('Account name').fill('Example Bank current');
    await p.getByRole('button', { name: /^Review/ }).click();
    await p.getByText(/rows match/).waitFor();
  };

  // Scrolls so an element sits just under the sticky top bar.
  const to =
    (sel, gap = 84) =>
    (p) =>
      p.evaluate(
        ([s, g]) => {
          const el = document.querySelector(s);
          if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - g);
        },
        [sel, gap],
      );

  // The sample import adds data, so it is captured last in each context.
  await shot(desktop, 'home/', 'd-home');
  await shot(desktop, 'runway/', 'd-runway', (p) => p.evaluate(() => scrollTo(0, 70)));
  await shot(desktop, 'insights/', 'd-insights', (p) => p.evaluate(() => scrollTo(0, 70)));
  await shot(desktop, 'settings/', 'd-settings', to('#data', 96));
  await shot(desktop, 'import/', 'd-import', async (p) => {
    await toReview(p);
    await p.evaluate(() => scrollTo(0, 150));
  });

  await shot(phone, 'home/', 'p-home');
  await shot(phone, 'runway/', 'p-runway', to('#rw-title', 120));
  await shot(phone, 'runway/', 'p-whatif', async (p) => {
    await p.getByRole('button', { name: /^Try / }).click();
    await to('#whatif-title', 110)(p);
  });
  await shot(phone, 'plan/', 'p-plan', to('#budgets', 76));
  await shot(phone, 'activity/', 'p-activity', to('#activity-search', 104));
  await shot(phone, 'settings/', 'p-settings', to('#data', 76));
  await shot(phone, 'import/', 'p-import', async (p) => {
    await toReview(p);
    await p.getByRole('button', { name: /^Import \d+ transactions/ }).click();
    await p.getByText('Balances match.').waitFor();
    await p.evaluate(() => scrollTo(0, 120));
  });
  await browser.close();
}

/* ---------- Composition ---------- */

const font = (f) => pathToFileURL(resolve('node_modules/@fontsource-variable', f)).href;
const img = (name) => pathToFileURL(resolve(RAW, `${name}.png`)).href;
const logo = readFileSync('public/favicon.svg', 'utf8');

const css = `
@font-face { font-family: 'Manrope'; src: url('${font('manrope/files/manrope-latin-wght-normal.woff2')}') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Fraunces'; src: url('${font('fraunces/files/fraunces-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { font-family: Manrope, sans-serif; color: #f4efe7; -webkit-font-smoothing: antialiased; }
.card { position: relative; overflow: hidden; border-radius: 30px; border: 1px solid #ffffff14;
  background: radial-gradient(70% 60% at 18% 0%, #e9b35a26, transparent 70%), radial-gradient(60% 50% at 100% 100%, #d9772f14, transparent 70%), linear-gradient(180deg, #16120e, #0d0b09); }
.card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background-image: radial-gradient(#ffffff0c 1px, transparent 1px); background-size: 22px 22px; mask-image: linear-gradient(180deg, #000 0%, transparent 55%); }
.display { font-feature-settings: 'lnum' 1, 'pnum' 1; font-family: Fraunces, serif; font-variation-settings: 'opsz' 96; font-weight: 560; letter-spacing: -0.018em; word-spacing: 0.07em; line-height: 1; }
.gold { color: #f1c46a; }
.browser { position: absolute; border-radius: 16px; overflow: hidden; border: 1px solid #ffffff1c; background: #191511;
  box-shadow: 0 50px 100px -30px #000000d0, 0 0 0 1px #00000060; }
.browser .bar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #1f1a15; border-bottom: 1px solid #ffffff10; }
.browser .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ffffff22; }
.browser .bar span { margin: 0 auto; transform: translateX(-30px); font-size: 12.5px; color: #ffffff70; background: #ffffff0d; padding: 4px 16px; border-radius: 99px; }
.browser img { display: block; width: 100%; }
.phone { position: absolute; border-radius: 54px; padding: 11px; background: #0b0a09; border: 1.5px solid #ffffff22;
  box-shadow: 0 50px 90px -24px #000000e0, inset 0 0 0 2px #1d1915; }
.phone .screen { position: relative; border-radius: 44px; overflow: hidden; background: #191511; }
.phone .screen img { display: block; width: 100%; }
.phone .island { position: absolute; top: 11px; left: 50%; width: 31%; height: 30px; transform: translateX(-50%); border-radius: 20px; background: #000; z-index: 2; }
.phone .status { height: 50px; background: #1a1612; }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 99px; font-weight: 700; font-size: 18px; }
`;

const browser = (name, url, { left, top, width, height }) =>
  `<div class="browser" style="left:${left}px;top:${top}px;width:${width}px"><div class="bar"><i></i><i></i><i></i><span>gallowforge.github.io/ledger/${url}</span></div><div style="height:${height}px;overflow:hidden"><img src="${img(name)}"></div></div>`;
const phone = (name, { left, top, width }) =>
  `<div class="phone" style="left:${left}px;top:${top}px;width:${width}px"><div class="screen"><div class="island"></div><div class="status"></div><img src="${img(name)}"></div></div>`;

function page(body, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`;
}

const SCENES = {
  hero: {
    wide: [
      1200,
      1050,
      `<div class="card" style="width:1200px;height:1050px">
      <div style="position:absolute;top:58px;left:0;right:0;text-align:center">
        <div style="display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:30px;letter-spacing:-0.01em">${logo.replace('<svg', '<svg width="44" height="44"')}Ledger</div>
        <h1 class="display" style="font-size:82px;margin-top:30px">Pay yourself a salary that <em class="gold">lasts.</em></h1>
        <p style="font-size:23px;color:#ffffffa8;margin-top:22px">Your month, your runway and your bank statements, on your device. Free, offline, no account.</p>
        <div style="margin-top:30px;display:flex;justify-content:center;gap:14px">
          <span class="pill" style="background:#f1c46a;color:#2b1d0c">Open the app →</span>
          <span class="pill" style="border:1px solid #ffffff24;color:#f4efe7">Exact to the fils, in KD</span>
        </div>
      </div>
      ${browser('d-home', 'home/', { left: 70, top: 395, width: 900, height: 600 })}
      ${phone('p-runway', { left: 868, top: 470, width: 280 })}
    </div>`,
    ],
    mobile: [
      600,
      1050,
      `<div class="card" style="width:600px;height:1050px">
      <div style="position:absolute;top:54px;left:40px;right:40px;text-align:center">
        <div style="display:inline-flex;align-items:center;gap:12px;font-weight:800;font-size:26px">${logo.replace('<svg', '<svg width="38" height="38"')}Ledger</div>
        <h1 class="display" style="font-size:60px;margin-top:26px;line-height:1.02">Pay yourself a salary that <em class="gold">lasts.</em></h1>
        <p style="font-size:20px;color:#ffffffa8;margin-top:18px;line-height:1.4">Your month, your runway and your statements, on your device.</p>
      </div>
      ${phone('p-home', { left: 135, top: 400, width: 330 })}
    </div>`,
    ],
  },
  month: { desktop: 'd-home', url: 'home/', phone: 'p-plan' },
  runway: { desktop: 'd-runway', url: 'runway/', phone: 'p-whatif' },
  import: { desktop: 'd-import', url: 'import/', phone: 'p-import' },
  insights: { desktop: 'd-insights', url: 'insights/', phone: 'p-activity' },
  privacy: { desktop: 'd-settings', url: 'settings/', phone: 'p-settings' },
};

function scene(s) {
  return {
    wide: [
      1200,
      760,
      `<div class="card" style="width:1200px;height:760px">${browser(s.desktop, s.url, { left: 60, top: 60, width: 880, height: 600 })}${phone(s.phone, { left: 858, top: 112, width: 290 })}</div>`,
    ],
    mobile: [
      600,
      820,
      `<div class="card" style="width:600px;height:820px">${phone(s.phone, { left: 110, top: 55, width: 380 })}</div>`,
    ],
  };
}

// Real numbers: the files precached come from the built service worker.
const cached = (readFileSync('dist/sw.js', 'utf8').match(/const PRECACHE = (\[.*?\]);/) ?? [])[1];
const NUMBERS = [
  ['3', 'decimals', 'KD exact to the fils'],
  ['24', 'currencies', 'beside the dinar'],
  ['100%', 'rows checked', 'against the balance'],
  [String(cached ? JSON.parse(cached).length : 0), 'files cached', 'offline from day one'],
  ['0', 'servers', 'no account, no uploads'],
];
const numbers = {
  wide: [
    1200,
    270,
    `<div class="card" style="width:1200px;height:270px;display:grid;grid-template-columns:repeat(5,1fr);align-content:center;padding:0 50px">
    ${NUMBERS.map(([n, l, c], i) => `<div style="padding-left:${i ? 28 : 0}px;border-left:${i ? '1px solid #ffffff14' : 'none'}"><div class="display ${i === 4 ? 'gold' : ''}" style="font-size:66px">${n}</div><div style="font-weight:700;font-size:20px;margin-top:14px">${l}</div><div style="color:#ffffff8c;font-size:15.5px;margin-top:6px">${c}</div></div>`).join('')}
  </div>`,
  ],
  mobile: [
    600,
    760,
    `<div class="card" style="width:600px;height:760px;padding:50px 48px;display:grid;grid-template-columns:1fr 1fr;gap:36px 28px;align-content:center">
    ${NUMBERS.map(([n, l, c], i) => `<div style="${i === 4 ? 'grid-column:span 2' : ''}"><div class="display ${i === 4 ? 'gold' : ''}" style="font-size:58px">${n}</div><div style="font-weight:700;font-size:19px;margin-top:10px">${l}</div><div style="color:#ffffff8c;font-size:15px;margin-top:4px">${c}</div></div>`).join('')}
  </div>`,
  ],
};

const social = [
  1280,
  640,
  `<div class="card" style="width:1280px;height:640px;border-radius:0">
  <div style="position:absolute;left:80px;top:96px;width:560px">
    <div style="display:inline-flex;align-items:center;gap:16px;font-weight:800;font-size:34px">${logo.replace('<svg', '<svg width="52" height="52"')}Ledger</div>
    <h1 class="display" style="font-size:78px;margin-top:40px;line-height:1.02">Pay yourself a salary that <em class="gold">lasts.</em></h1>
    <p style="font-size:26px;color:#ffffffad;margin-top:28px;line-height:1.4">An offline money app. Bank statements read on your device. No account.</p>
  </div>
  ${phone('p-runway', { left: 760, top: 64, width: 300 })}
  ${phone('p-home', { left: 980, top: 150, width: 260 })}
</div>`,
];

async function render(browserInst, name, [w, h, body], { webp = true } = {}) {
  const p = await browserInst.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const file = resolve(RAW, `compose-${name}.html`);
  writeFileSync(file, page(body, w, h));
  await p.goto(pathToFileURL(file).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const png = await p.screenshot({ omitBackground: true });
  await p.close();
  if (webp) await sharp(png).webp({ quality: 86, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  else await sharp(png).resize(1280, 640).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`);
  console.log('composed', name);
}

async function compose() {
  const b = await launch();
  await render(b, 'hero', SCENES.hero.wide);
  await render(b, 'hero-mobile', SCENES.hero.mobile);
  await render(b, 'numbers', numbers.wide);
  await render(b, 'numbers-mobile', numbers.mobile);
  for (const key of ['month', 'runway', 'import', 'insights', 'privacy']) {
    const s = scene(SCENES[key]);
    await render(b, key, s.wide);
    await render(b, `${key}-mobile`, s.mobile);
  }
  await render(b, 'social', social, { webp: false });
  await b.close();
}

if (!COMPOSE_ONLY) await capture();
await compose();
