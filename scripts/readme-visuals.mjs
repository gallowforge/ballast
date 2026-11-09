/**
 * Regenerates the README images in docs/readme/ from the real app, in Ledger's own identity
 * (docs/DESIGN.md): warm paper, ink green, brass, Newsreader figures. Each image has one idea and
 * stages a real screen: cropped hard to the thing that matters, set on paper, with a phone where a
 * phone helps. Nothing is drawn that the app does not draw itself, except captions and the odd
 * brass annotation.
 *
 *   npm run build && node scripts/serve.mjs dist 4173 &
 *   npm run readme:visuals              # capture and compose
 *   npm run readme:visuals -- --compose # compose again from the last captures
 *
 * The runway picture is an animated WebP of the signature interaction: the real salary slider
 * dragged frame by frame, with the road and the sentence above it redrawn by the app each time.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4173';
const RAW = 'docs/readme/.raw';
const OUT = 'docs/readme';
const COMPOSE_ONLY = process.argv.includes('--compose');
const DESKTOP_W = 1360;
// A Pro Max-sized phone, installed as an app: the whole screen below the status bar is Ledger's.
const PHONE_W = 440;
const PHONE_H = 912;
mkdirSync(RAW, { recursive: true });

const launch = () =>
  chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );

/* ---------- Capture ---------- */

async function capture() {
  const browser = await launch();
  const desktop = await browser.newContext({
    viewport: { width: DESKTOP_W, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const phone = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    viewport: { width: PHONE_W, height: PHONE_H },
    deviceScaleFactor: 3,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  for (const ctx of [desktop, phone]) {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/home/?demo=1`);
    await p.waitForTimeout(1500);
    await p.close();
  }
  const rects = {};
  const shot = async (ctx, path, name, { prep, boxes = {}, full = true } = {}) => {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/${path}`);
    await p
      .locator('astro-island[ssr]')
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => undefined);
    // The demo note and the floating add button stay out of the pictures.
    await p.addStyleTag({
      content: '.fab{display:none!important} [data-demo-note]{display:none!important}',
    });
    // A full-page picture has no scroll position, so the import bar sits where it ends up: below the rows.
    // The phone's tab bar is fixed to the screen, so it has no place in a picture of the whole page.
    if (full)
      await p.addStyleTag({
        content: '.card.sticky{position:static!important} .tabbar{display:none!important}',
      });
    await p.waitForTimeout(700);
    if (prep) await prep(p);
    await p.waitForTimeout(700);
    // Full-page shots are measured from the top, so a sticky bar is painted where it belongs.
    if (full) await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(200);
    rects[name] = {};
    for (const [key, sel] of Object.entries(boxes)) {
      rects[name][key] = await p.evaluate((s) => {
        const el = s.startsWith('value=')
          ? [...document.querySelectorAll('input')].find((i) => i.value === s.slice(6))
          : document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
      }, sel);
    }
    rects[name].text = await p.evaluate(
      () => document.querySelector('h1')?.textContent?.trim() ?? '',
    );
    await p.screenshot({ path: `${RAW}/${name}.png`, fullPage: full });
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
  const salary = (amount) => async (p) => {
    await p.evaluate((v) => {
      const el = document.querySelector('#whatif');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, amount);
  };

  await shot(desktop, 'home/', 'd-home', {
    boxes: {
      hero: 'section[aria-labelledby="hello"]',
      month: 'section[aria-labelledby="month-title"]',
      figure: '#safe-title',
    },
  });
  const roadBoxes = {
    road: '[data-road]',
    sun: '[data-road] circle',
    flag: '[data-flag]',
    end: '[data-road-end]',
  };
  await shot(desktop, 'runway/', 'd-road-a', { boxes: roadBoxes });
  await shot(desktop, 'insights/', 'd-insights', {
    boxes: { where: 'section[aria-labelledby="where-title"]' },
  });
  await shot(phone, 'insights/', 'p-insights', {
    boxes: { where: 'section[aria-labelledby="where-title"]' },
  });
  await shot(phone, 'home/', 'p-home', { full: false });
  await shot(phone, 'runway/', 'p-runway', { full: false });
  const importBoxes = {
    review: 'section[aria-labelledby="review-title"]',
    status: 'section[aria-labelledby="review-title"] [role="status"]',
    payee: 'value=Starbucks',
  };
  await shot(desktop, 'import/', 'd-import', { prep: toReview, boxes: importBoxes });
  await shot(phone, 'import/', 'p-import', { prep: toReview, boxes: importBoxes });

  // The signature interaction, frame by frame: drag the salary up past the date, down to a long
  // road, back, and let go.
  const legs = [
    [220_000, 290_000, 13],
    [290_000, 160_000, 20],
    [160_000, 220_000, 11],
  ];
  const values = legs
    .flatMap(([a, z, n]) =>
      Array.from({ length: n }, (_, i) => {
        const t = (i + 1) / n;
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        return Math.round((a + (z - a) * e) / 5000) * 5000;
      }),
    )
    .filter((v, i, all) => v !== all[i - 1]);
  writeFileSync(`${RAW}/a-values.json`, JSON.stringify(values));
  for (const [ctx, name] of [
    [desktop, 'a-road'],
    [phone, 'a-road-p'],
  ]) {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/runway/`);
    await p
      .locator('astro-island[ssr]')
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => undefined);
    await p.addStyleTag({
      content: '.fab{display:none!important} [data-demo-note]{display:none!important}',
    });
    await p.waitForTimeout(900);
    const clip = await p.evaluate((isPhone) => {
      const sec = document.querySelector('section[aria-labelledby="rw-title"]');
      if (isPhone) {
        const bar = document.querySelector('header')?.getBoundingClientRect().height ?? 56;
        scrollTo(0, sec.getBoundingClientRect().top + scrollY - bar - 18);
        return null;
      }
      const r = sec.getBoundingClientRect();
      return {
        x: r.left - 28,
        y: r.top + scrollY - 26,
        width: r.width + 56,
        height: r.height + 46,
      };
    }, ctx === phone);
    await p.waitForTimeout(300);
    const snap = (i) =>
      p.screenshot({
        path: `${RAW}/${name}-${String(i).padStart(2, '0')}.png`,
        ...(clip ? { clip } : {}),
      });
    await snap(0);
    let i = 1;
    for (const v of values) {
      await salary(v)(p);
      await p.waitForTimeout(90);
      await snap(i++);
    }
    await p.getByRole('button', { name: 'Reset' }).click();
    await p.waitForTimeout(200);
    await snap(i);
    await p.close();
    console.log('captured', name, i + 1, 'frames');
  }
  writeFileSync(`${RAW}/rects.json`, JSON.stringify(rects, null, 1));
  await browser.close();
}

/* ---------- Composition ---------- */

const font = (f) => pathToFileURL(resolve('node_modules/@fontsource-variable', f)).href;
const img = (name) => pathToFileURL(resolve(RAW, `${name}.png`)).href;
const mark = readFileSync('public/favicon.svg', 'utf8');
const PAPER = '#f2ecdf';

const css = `
@font-face { font-family: 'Newsreader'; src: url('${font('newsreader/files/newsreader-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Newsreader'; font-style: italic; src: url('${font('newsreader/files/newsreader-latin-wght-italic.woff2')}') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Atkinson'; src: url('${font('atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2')}') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Figures'; src: url('${font('newsreader/files/newsreader-latin-opsz-normal.woff2')}') format('woff2'); unicode-range: U+0030-0039; }
* { box-sizing: border-box; margin: 0; }
:root { --paper: ${PAPER}; --sheet: #faf7f0; --ink: #1d3a2e; --ink2: #44574d; --ink3: #57665d; --rule: rgb(29 58 46 / .14); --brass: #b8892f; --brass-ink: #805a15; --good: #23704a; }
html, body { background: var(--paper); }
body { font-family: Figures, Atkinson, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; position: relative; overflow: hidden; }
.serif { font-family: Newsreader, serif; font-optical-sizing: auto; }
.display { font-family: Newsreader, serif; font-optical-sizing: auto; font-weight: 440; letter-spacing: -0.015em; line-height: 0.98; }
em { font-style: italic; color: var(--brass-ink); }
.caps { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink3); }
.figure { font-family: Newsreader, serif; font-variant-numeric: lining-nums tabular-nums; font-weight: 420; letter-spacing: -0.02em; }
.crop { position: absolute; overflow: hidden; }
.crop img { position: absolute; left: 0; top: 0; display: block; max-width: none; }
.phone { position: absolute; padding: 9px; border-radius: 46px; background: #171a18; box-shadow: 0 2px 0 #2b302d inset, 0 50px 80px -30px rgb(29 58 46 / .55), 0 18px 30px -18px rgb(29 58 46 / .5); }
.phone .screen { position: relative; overflow: hidden; border-radius: 38px; background: var(--paper); }
.phone .screen img { display: block; width: 100%; }
.phone .island { position: absolute; left: 50%; transform: translateX(-50%); width: 30%; border-radius: 16px; background: #000; z-index: 2; }
.note { position: absolute; font-family: Newsreader, serif; font-style: italic; color: var(--brass-ink); font-size: 23px; line-height: 1.25; }
.row { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid var(--rule); }
.row.total { border-bottom: 4px double var(--ink); }
`;

let rects = {};
const R = (name, key) => rects[name]?.[key];
const srcW = (name) => (name.startsWith('p-') ? PHONE_W : DESKTOP_W);

/** A hard crop of a capture: the rect (CSS px) scaled to `width`. `fade` dissolves the right edge. */
function crop(name, r, { left, top, width, pad = 0, fade = 0 }) {
  const box = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  const k = width / box.w;
  const mask = fade
    ? `-webkit-mask-image:linear-gradient(to right,#000 ${100 - fade}%,transparent);`
    : '';
  return `<div class="crop" style="left:${left}px;top:${top}px;width:${width}px;height:${Math.round(box.h * k)}px;${mask}"><img src="${img(name)}" style="width:${srcW(name) * k}px;transform:translate(${-box.x * k}px,${-box.y * k}px)"></div>`;
}
const cropHeight = (r, width, pad = 0) => Math.round(((r.h + pad * 2) * width) / (r.w + pad * 2));

/** A phone, its screen showing a capture below a status bar; scaled like the real thing. */
const phoneGeom = (width) => {
  const screen = width - 18;
  const s = screen / PHONE_W;
  return { screen, s, status: Math.round(44 * s), height: Math.round(18 + 44 * s + PHONE_H * s) };
};
const phone = (name, { left, top, width, rotate = 0 }) => {
  const g = phoneGeom(width);
  return `<div class="phone" style="left:${left}px;top:${top}px;width:${width}px;transform:rotate(${rotate}deg)"><div class="screen"><div class="island" style="top:${10 * g.s}px;height:${27 * g.s}px"></div><div style="height:${g.status}px"></div>${name ? `<img src="${img(name)}">` : `<div style="height:${PHONE_H * g.s}px"></div>`}</div></div>`;
};

const logo = (size) =>
  `<div style="display:inline-flex;align-items:center;gap:${size / 3}px">${mark.replace('<svg', `<svg width="${size}" height="${size}"`)}<span class="serif" style="font-size:${size * 0.82}px;font-weight:560">Ledger</span></div>`;

const page = (body, w, h) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`;

/** A hand-drawn brass arrow from (x1,y1) curving to (x2,y2). */
const arrow = (x1, y1, x2, y2, bend = 40) => {
  const mx = (x1 + x2) / 2 + bend;
  const my = (y1 + y2) / 2 - bend / 2;
  const a = Math.atan2(y2 - my, x2 - mx);
  const h = 11;
  const p1 = [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)];
  const p2 = [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)];
  return `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="#b8892f" stroke-width="2.2" stroke-linecap="round"/><path d="M${p1[0]},${p1[1]} L${x2},${y2} L${p2[0]},${p2[1]}" fill="none" stroke="#b8892f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};

function scenes() {
  const road = R('d-road-a', 'road');
  const sun = R('d-road-a', 'sun');
  const centre = sun.x + sun.w / 2;
  // The road without the year column on its left, so it can bleed off the edge cleanly.
  const ground = { x: road.x + 64, y: road.y, w: road.w - 64, h: road.h };
  /** Places the road so its vanishing point lands on `c`, scaled by `k`. */
  const roadAt = (c, top, k, fade = 0) =>
    crop('d-road-a', ground, {
      left: Math.round(c - (centre - ground.x) * k),
      top,
      width: Math.round(ground.w * k),
      fade,
    });
  const out = {};

  // Hero: the promise, the road it is about, and the app in hand.
  {
    const k = 1.34;
    const top = 440;
    out.hero = [
      1200,
      top + Math.round(road.h * k),
      `
      <div style="position:absolute;left:64px;top:52px">${logo(34)}</div>
      <h1 class="display" style="position:absolute;left:62px;top:122px;width:720px;font-size:104px">Pay yourself a salary that <em>lasts.</em></h1>
      <p class="serif" style="position:absolute;left:64px;top:356px;width:600px;font-size:25px;font-style:italic;color:var(--ink2);line-height:1.35">Your month, your runway and your bank statements, on your own device. Free, offline, no account.</p>
      ${roadAt(600, top, k)}
      ${phone('p-home', { left: 900, top: 40, width: 252, rotate: 4 })}
    `,
    ];
    out['hero-mobile'] = [
      600,
      1120,
      `
      <div style="position:absolute;left:40px;top:44px">${logo(30)}</div>
      <h1 class="display" style="position:absolute;left:38px;top:108px;width:520px;font-size:74px">Pay yourself a salary that <em>lasts.</em></h1>
      <p class="serif" style="position:absolute;left:40px;top:292px;width:500px;font-size:23px;font-style:italic;color:var(--ink2);line-height:1.35">Your month, your runway and your statements, on your own device.</p>
      ${phone('p-runway', { left: 110, top: 400, width: 380 })}
    `,
    ];
  }

  // Numbers: the facts, kept as a ledger whose total is zero.
  {
    const rows = [
      ['Decimals in a dinar, kept exactly', '3'],
      ['Currencies beside the dinar', String(currencies() - 1)],
      ['Statement lines checked against the running balance', 'Every one'],
      ['Files kept for working offline', String(cached())],
    ];
    const table = (size) =>
      rows
        .map(
          ([k, v]) =>
            `<div class="row" style="padding:${size * 0.3}px 0"><span style="font-size:${size * 0.48}px">${k}</span><span class="figure" style="font-size:${/\d/.test(v) ? size : size * 0.72}px;white-space:nowrap;margin-left:16px">${v}</span></div>`,
        )
        .join('') +
      `<div class="row total" style="padding:${size * 0.3}px 0"><span style="font-size:${size * 0.48}px;font-weight:700">Things that leave your device</span><span class="figure" style="font-size:${size * 1.3}px;line-height:1;color:var(--brass-ink)">0</span></div>`;
    out.numbers = [
      1200,
      436,
      `
      <div class="display" style="position:absolute;left:64px;top:58px;width:330px;font-size:58px">An honest ledger</div>
      <p class="serif" style="position:absolute;left:66px;top:206px;width:300px;font-size:21px;font-style:italic;color:var(--ink2);line-height:1.35">What Ledger keeps exact, what it checks, and what it sends anywhere.</p>
      <div style="position:absolute;left:470px;top:52px;width:666px;border-top:2px solid var(--ink)">${table(40)}</div>
    `,
    ];
    out['numbers-mobile'] = [
      600,
      500,
      `
      <div class="display" style="position:absolute;left:40px;top:50px;font-size:54px">An honest ledger</div>
      <div style="position:absolute;left:40px;top:142px;width:520px;border-top:2px solid var(--ink)">${table(36)}</div>
    `,
    ];
  }

  // Today: one number, cropped from the Home screen, beside the month it comes from.
  {
    const hero = R('d-home', 'hero');
    const month = R('d-home', 'month');
    const fig = R('d-home', 'figure');
    const figBox = { x: hero.x, y: fig.y - 6, w: hero.w, h: hero.y + hero.h - fig.y - 28 };
    const fw = 600;
    const mw = 450;
    const fh = cropHeight(figBox, fw);
    const mh = cropHeight(month, mw, 6);
    out.month = [
      1200,
      56 + Math.max(fh, mh + 130) + 44,
      `
      ${crop('d-home', figBox, { left: 56, top: 56, width: fw })}
      ${crop('d-home', month, { left: 710, top: 56, width: mw, pad: 6 })}
      <div class="note" style="left:730px;top:${56 + mh + 28}px;width:410px">bills still to come are set aside before the day’s figure is worked out</div>
      ${arrow(724, 56 + mh + 40, 703, 56 + mh - 100, -28)}
    `,
    ];
    const fwm = 540;
    const fhm = cropHeight(figBox, fwm);
    out['month-mobile'] = [
      600,
      40 + fhm + 40 + cropHeight(month, 520, 6) + 40,
      `
      ${crop('d-home', figBox, { left: 30, top: 40, width: fwm })}
      ${crop('d-home', month, { left: 40, top: 40 + fhm + 40, width: 520, pad: 6 })}
    `,
    ];
  }

  // Import: every line checked against the bank, with bank gibberish turned into plain names.
  {
    const rev = R('d-import', 'review');
    const pay = R('d-import', 'payee');
    const box = {
      x: rev.x - 4,
      y: rev.y - 4,
      w: rev.w + 8,
      h: Math.min(rev.h, (pay ? pay.y + pay.h - rev.y : 600) + 210),
    };
    const w = 930;
    const k = w / box.w;
    const py = pay ? 40 + (pay.y - box.y + pay.h / 2) * k : 400;
    const px = pay ? 40 + (pay.x - box.x + pay.w) * k : 600;
    out.import = [
      1200,
      40 + Math.round(box.h * k) + 40,
      `
      ${crop('d-import', box, { left: 40, top: 40, width: w })}
      <div class="note" style="left:1000px;top:${py - 120}px;width:180px">bank gibberish in, plain names out</div>
      ${arrow(1010, py - 30, px + 14, py - 6, 30)}
    `,
    ];
    const prev = R('p-import', 'review');
    const pbox = { x: 0, y: prev.y - 10, w: PHONE_W, h: Math.min(prev.h, 900) };
    out['import-mobile'] = [
      600,
      cropHeight(pbox, 600) + 40,
      crop('p-import', pbox, { left: 0, top: 20, width: 600 }),
    ];
  }

  // Insights: where it went, as one strip.
  {
    const where = R('d-insights', 'where');
    out.insights = [
      1200,
      cropHeight(where, 1080, 10) + 80,
      crop('d-insights', where, { left: 60, top: 40, width: 1080, pad: 10 }),
    ];
    const pw = R('p-insights', 'where');
    const pbox = { x: 0, y: pw.y - 10, w: PHONE_W, h: Math.min(pw.h + 20, 820) };
    out['insights-mobile'] = [
      600,
      cropHeight(pbox, 600) + 40,
      crop('p-insights', pbox, { left: 0, top: 20, width: 600 }),
    ];
  }

  // Privacy: the one line that means it cannot phone home.
  out.privacy = [
    1200,
    520,
    `
    <div class="caps" style="position:absolute;left:64px;top:70px">In every page Ledger serves</div>
    <div class="display" style="position:absolute;left:60px;top:120px;font-size:124px;white-space:nowrap">connect-src <span style="color:var(--brass-ink)">'self'</span></div>
    <div style="position:absolute;left:64px;top:282px;width:1072px;height:2px;background:var(--brass)"></div>
    <p class="serif" style="position:absolute;left:64px;top:318px;width:700px;font-size:27px;font-style:italic;color:var(--ink2);line-height:1.35">One line of the Content Security Policy tells the browser that Ledger may talk only to itself. No account, no server, no analytics: your money stays on your device.</p>
  `,
  ];
  out['privacy-mobile'] = [
    600,
    620,
    `
    <div class="caps" style="position:absolute;left:40px;top:50px">In every page Ledger serves</div>
    <div class="display" style="position:absolute;left:38px;top:96px;font-size:74px;line-height:1.05">connect-src<br><span style="color:var(--brass-ink)">'self'</span></div>
    <div style="position:absolute;left:40px;top:290px;width:520px;height:2px;background:var(--brass)"></div>
    <p class="serif" style="position:absolute;left:40px;top:322px;width:520px;font-size:25px;font-style:italic;color:var(--ink2);line-height:1.35">Ledger may talk only to itself. No account, no server, no analytics.</p>
  `,
  ];

  // Social card: legible at 500 px wide.
  out.social = [
    1280,
    640,
    `
    <div style="position:absolute;left:72px;top:64px">${logo(40)}</div>
    ${roadAt(687, 262, 1.4)}
    <h1 class="display" style="position:absolute;left:70px;top:140px;width:720px;font-size:92px">Pay yourself a salary that <em>lasts.</em></h1>
  `,
  ];
  return out;
}

function cached() {
  try {
    return JSON.parse(readFileSync('dist/sw.js', 'utf8').match(/const PRECACHE = (\[.*?\]);/)[1])
      .length;
  } catch {
    return 0;
  }
}
const currencies = () =>
  (readFileSync('src/lib/money/currency.ts', 'utf8').match(/\{ code: '/g) ?? []).length;

async function render(b, name, [w, h, body], scale = 2) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const file = resolve(RAW, `compose-${name}.html`);
  writeFileSync(file, page(body, w, h));
  await p.goto(pathToFileURL(file).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  const png = await p.screenshot();
  await p.close();
  return png;
}

async function save(name, png) {
  if (name === 'social')
    await sharp(png).resize(1280, 640).png({ compressionLevel: 9 }).toFile(`${OUT}/social.png`);
  else await sharp(png).webp({ quality: 88, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  console.log('composed', name);
}

/* ---------- The signature interaction, animated ---------- */

const frameFiles = (name) =>
  readdirSync(RAW)
    .filter((f) => new RegExp(`^${name}-\\d+\\.png$`).test(f))
    .sort();

/** Frame timing: hold the first look, move briskly, pause where the road turns round. */
function delays(n) {
  const values = JSON.parse(readFileSync(`${RAW}/a-values.json`, 'utf8'));
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return 1800;
    if (i === n - 1) return 300;
    const v = values[i - 1];
    return v === 290_000 || v === 160_000 ? 1300 : 70;
  });
}

async function animate(b) {
  // Desktop: the Runway section as it is, on a paper margin.
  {
    const files = frameFiles('a-road');
    const meta = await sharp(resolve(RAW, files[0])).metadata();
    const W = 1600;
    const inner = W - 80;
    const ih = Math.round((meta.height * inner) / meta.width);
    const H = ih + 72;
    const frames = await Promise.all(
      files.map(async (f) =>
        sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
          .composite([
            { input: await sharp(resolve(RAW, f)).resize(inner).toBuffer(), left: 40, top: 36 },
          ])
          .png()
          .toBuffer(),
      ),
    );
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 90, effort: 6, loop: 0, delay: delays(files.length), smartDeltas: true })
      .toFile(`${OUT}/runway.webp`);
    console.log('animated runway', files.length, 'frames');
  }
  // Phone: the same gesture in hand, with one line of what to do.
  {
    const files = frameFiles('a-road-p');
    const S = 1.5;
    const W = 600;
    const H = 1080;
    const pw = 392;
    const left = (W - pw) / 2;
    const top = 200;
    const g = phoneGeom(pw);
    const base = await render(
      b,
      'runway-mobile-base',
      [
        W,
        H,
        `
      <div class="display" style="position:absolute;left:40px;top:48px;width:520px;font-size:50px">Drag the salary. <em>The road follows.</em></div>
      ${phone(null, { left, top, width: pw })}
    `,
      ],
      S,
    );
    const sw = Math.round(g.screen * S);
    const sh = Math.round(PHONE_H * g.s * S);
    const r = Math.round(38 * S);
    const mask = Buffer.from(
      `<svg width="${sw}" height="${sh}"><rect x="0" y="${-r}" width="${sw}" height="${sh + r}" rx="${r}" ry="${r}"/></svg>`,
    );
    const sx = Math.round((left + 9) * S);
    const sy = Math.round((top + 9 + g.status) * S);
    const frames = await Promise.all(
      files.map(async (f) => {
        const screen = await sharp(resolve(RAW, f))
          .resize(sw, sh)
          .composite([{ input: mask, blend: 'dest-in' }])
          .png()
          .toBuffer();
        return sharp(base)
          .composite([{ input: screen, left: sx, top: sy }])
          .png()
          .toBuffer();
      }),
    );
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 88, effort: 6, loop: 0, delay: delays(files.length), smartDeltas: true })
      .toFile(`${OUT}/runway-mobile.webp`);
    console.log('animated runway-mobile', files.length, 'frames');
  }
}

if (!COMPOSE_ONLY) await capture();
rects = JSON.parse(readFileSync(`${RAW}/rects.json`, 'utf8'));
const b = await launch();
for (const [name, spec] of Object.entries(scenes())) await save(name, await render(b, name, spec));
await animate(b);
await b.close();
