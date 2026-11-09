// Glass scenes for Ledger's README: the real app, captured by capture.mjs, as frosted-glass
// windows floating in light. One spatial grammar for every scene, the same as the profile's:
// copy sits flush on the page colour, the windows float beside it, and the one detail that
// matters is lifted out of its window toward the viewer.
// Positions are the apparent centre in CSS px (y down), sizes are apparent CSS px, z is depth
// (+ toward the viewer; 1 unit = 1 px at z = 0). Crops are in capture pixels.

// Where the lifted details sit in each capture (written by capture.mjs).
const RECTS = await (async () => {
  try {
    if (typeof window !== 'undefined') return await (await fetch('/shots/rects.json')).json();
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync(new URL('../.raw/shots/rects.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
})();
/** A measured box in capture pixels, grown by `pad` CSS px on every side. */
const box = (shot, theme, key, dpr, pad = 0) => {
  const r = RECTS[`${shot}-${theme}`]?.[key];
  if (!r) throw new Error(`No box ${key} for ${shot}-${theme}: run capture.mjs`);
  return [r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad].map((v) => Math.round(v * dpr));
};
const D = 2,
  P = 3; // capture scale: desktop 1440 x 900 at 2x, phone 390 x 844 at 3x
const FULL_D = [0, 0, 2880, 1800],
  FULL_P = [0, 0, 1170, 2532];

const merge = (a, b) => {
  const o = { ...a };
  for (const k in b)
    o[k] =
      b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return o;
};

// ---------- light ----------
// Night: a deep green dark with soft shafts of brass light falling through haze, edges melting
// into GitHub's dark page. Day: warm paper light through a tall window, dappled by leaves.
const NIGHT = merge(
  {
    page: '#0d1117',
    env: {
      top: '#0a0d15',
      bot: '#06080c',
      haze: '#18202f',
      hazeStr: 0.1,
      ray: '#a0b6dc',
      shafts: [
        [0.15, 0.06, 0.06, 0.16],
        [0.31, 0.024, 0.03, 0.1],
        [0.66, 0.03, -0.03, 0.11],
        [0.85, 0.07, -0.06, 0.15],
        [0.5, 0.2, 0.0, 0.05],
      ],
      glows: [
        [0.5, 1.15, 0.65, 0.1, '#8ea6d8'],
        [0.5, -0.15, 0.6, 0.05, '#4a5f86'],
      ],
    },
    glass: {
      tint: [0.062, 0.068, 0.082],
      transmit: 0.8,
      fog: '#0b0e15',
      light: [-700, 800, 900],
      rim: 0.9,
      spec: 0.4,
      glow: 0.62,
      shadow: 0.3,
      levels: 5,
      caustic: 0,
    },
    motes: { n: 70, color: '#d4e2ff', amt: 0.5 },
    bloom: 0.4,
    bloomThresh: 0.55,
    vig: 0.45,
  },
  {
    env: {
      top: '#0a100e',
      bot: '#050706',
      haze: '#1b261f',
      ray: '#d6c9a4',
      shafts: [
        [0.48, 0.05, 0.05, 0.1],
        [0.66, 0.025, 0.02, 0.07],
        [0.86, 0.07, -0.04, 0.1],
        [0.7, 0.22, 0.0, 0.04],
        [0.3, 0.04, 0.04, 0.05],
      ],
      glows: [
        [0.72, 1.1, 0.6, 0.08, '#b8a77a'],
        [0.75, -0.1, 0.5, 0.05, '#3c5a48'],
      ],
    },
    glass: { fog: '#0a0f0d' },
    motes: { color: '#f1e6c8' },
  },
);
const DAY = merge(
  {
    page: '#ffffff',
    env: {
      top: '#eef1f5',
      bot: '#f6f6f4',
      haze: '#ffffff',
      hazeStr: 0.04,
      shadeCol: '#eceff4',
      sun: [-0.15, 0, -0.62, 0.95],
      dapple: 0.5,
      sunStr: 0.075,
      sunCol: '#fff4e2',
      shadow: 0.55,
      caustic: 0.1,
      shadowDir: [0.05, -0.075],
      glows: [],
    },
    glass: {
      tint: [0.075, 0.078, 0.084],
      transmit: 0.88,
      fog: '#eef1f5',
      light: [-700, 800, 900],
      rim: 0.95,
      spec: 0.3,
      glow: 0.0,
      shadow: 0.12,
      levels: 5,
      caustic: 0,
    },
    motes: { n: 40, color: '#fffaf0', amt: 0.45 },
    bloom: 0.0,
    bloomThresh: 0.95,
    vig: 0.4,
  },
  {
    env: {
      top: '#f3f1ea',
      bot: '#f8f7f3',
      shadeCol: '#efece5',
      sunCol: '#fff0d2',
      sun: [0.42, 0, -1.15, 1.0],
      dapple: 0.6,
    },
    glass: { fog: '#f2f0ea' },
  },
);

// ---------- type ----------
const BRASS = { night: '#d8b46a', day: '#8a6418' };
const C = {
  kick: { night: { color: BRASS.night }, day: { color: BRASS.day } },
  name: { night: { color: '#f5f7fb' }, day: { color: '#0b0d11' } },
  line: { night: { color: 'rgba(222,229,240,0.74)' }, day: { color: '#4a5161' } },
  copy: {
    night: { color: '#f5f7fb', '--muted': 'rgba(222,229,240,0.72)', '--kick': BRASS.night },
    day: { color: '#0b0d11', '--muted': '#4a5161', '--kick': BRASS.day },
  },
  fact: {
    night: { color: '#f3f5f9', '--muted': 'rgba(222,229,240,0.66)' },
    day: { color: '#10131a', '--muted': '#5a6170' },
  },
  vrule: {
    night: { background: 'rgba(200,215,235,0.16)' },
    day: { background: 'rgba(20,30,50,0.12)' },
  },
};
const T = (cls, html, x, y, style = {}, align) => ({
  cls,
  html,
  x,
  y,
  align,
  style,
  ...C[cls.split(' ')[0]],
});
const COPY = (o) => `<span class="k">${o.kick}</span><h2>${o.head}</h2><p>${o.text}</p>`;

// ---------- grammar ----------
const key = (n) => (n ? '#121D18' : '#F2ECDF'); // the app's own page colour, keyed out
const th = (n) => (n ? 'dark' : 'light');
const LIFT = (n) => ({
  bezel: 8,
  radius: 14,
  key: key(n),
  keyAmt: 1.0,
  shadowOff: n ? [0, -16, 40] : [10, -22, 26],
  shadow: n ? 0.45 : 0.22,
  glow: 0.25,
});

const PANEL = (o) => {
  const H = o.h || 430,
    R = o.side === 'right',
    pool = o.pool || [0.69, 0.5, 0.4, 0.7];
  return {
    css: [840, H],
    fade: [56, 56, 34, 44],
    cam: [12, 5],
    pool: R ? [1 - pool[0], pool[1], pool[2], pool[3]] : pool,
    night: merge(NIGHT, o.night || {}),
    day: merge(DAY, o.day || {}),
    windows: (n) => o.win(n, false),
    type: [
      T('copy', COPY(o), R ? 838 - (o.cw || 292) : 2, H / 2 + (o.ty || 0), {
        width: (o.cw || 292) + 'px',
        transform: 'translateY(-50%)',
      }),
    ],
    ...(o.extra || {}),
  };
};
const PANEL_PHONE = (o) => ({
  css: [381, o.hp || 520],
  dpr: 1080 / 381,
  fade: [26, 26, 28, 36],
  cam: [8, 4],
  pool: o.poolPhone || [0.5, 0.66, 0.7, 0.4],
  night: merge(NIGHT, o.night || {}),
  day: merge(DAY, o.day || {}),
  windows: (n) => o.win(n, true),
  type: [T('copy phone', COPY(o), 4, 26, { width: '368px' })],
  ...(o.extraPhone || {}),
});

// ---------- the hero ----------
const HERO = (ph) => ({
  css: ph ? [381, 640] : [840, 540],
  ...(ph ? { dpr: 1080 / 381 } : {}),
  fade: ph ? [28, 28, 30, 40] : [80, 80, 40, 70],
  cam: ph ? [7, 3] : [11, 4],
  motion: 0.75,
  pool: ph ? [0.5, 0.4, 0.75, 0.55] : [0.5, 0.42, 0.62, 0.62],
  night: merge(NIGHT, {
    env: {
      shafts: [
        [0.3, 0.05, 0.05, 0.13],
        [0.42, 0.02, 0.02, 0.1],
        [0.58, 0.022, -0.02, 0.11],
        [0.71, 0.05, -0.05, 0.13],
        [0.5, 0.22, 0.0, 0.06],
      ],
      glows: [
        [0.5, 0.4, 0.4, 0.12, '#6f7a4a'],
        [0.5, 1.15, 0.65, 0.1, '#c8b88e'],
        [0.5, -0.15, 0.6, 0.05, '#3c5a48'],
      ],
    },
  }),
  day: merge(DAY, { env: { sun: [0.1, 0, -0.8, 0.95] } }),
  windows: (n) => {
    const t = th(n);
    const P0 = ph
      ? [
          { x: 92, y: 236, w: 88, z: -820, rot: [10, 18, 0] },
          { x: 292, y: 234, w: 90, z: -820, rot: [10, -18, 0] },
          { x: 316, y: 318, w: 150, z: -320, rot: [2, -32, 0] },
          { x: 66, y: 318, w: 150, z: -320, rot: [2, 32, 0] },
          { x: 182, y: 392, w: 300, z: 40, rot: [3, 0, 0] },
          { x: 312, y: 478, h: 210, z: 170, rot: [0, -14, 0] },
        ]
      : [
          { x: 100, y: 176, w: 108, z: -820, rot: [10, 18, 0] },
          { x: 742, y: 174, w: 110, z: -820, rot: [10, -18, 0] },
          { x: 722, y: 292, w: 200, z: -320, rot: [2, -32, 0] },
          { x: 120, y: 294, w: 200, z: -320, rot: [2, 32, 0] },
          { x: 410, y: 334, w: 410, z: 40, rot: [3, 0, 0] },
          { x: 650, y: 390, h: 240, z: 170, rot: [0, -14, 0] },
        ];
    const fig = box('d-home', t, 'hello', D, 0),
      safe = box('d-home', t, 'safe', D, 0),
      sent = box('d-home', t, 'sentence', D, 0);
    const figure = [fig[0] - 24, safe[1] - 22, fig[2] + 48, sent[1] + sent[3] - safe[1] + 46];
    const W = [
      {
        tex: `d-import-${t}.png`,
        crop: FULL_D,
        key: key(n),
        keyAmt: 0.6,
        fog: n ? 0.62 : 0.4,
        lod: 1.2,
        defocus: 2.5,
        breathe: [16, 0.15],
        bezel: 8,
      },
      {
        tex: `d-settings-${t}.png`,
        crop: FULL_D,
        key: key(n),
        keyAmt: 0.6,
        fog: n ? 0.58 : 0.38,
        lod: 1.2,
        defocus: 2.2,
        breathe: [12, 0.8],
        bezel: 8,
      },
      {
        tex: `d-runway-${t}.png`,
        crop: FULL_D,
        key: key(n),
        keyAmt: 0.75,
        breathe: [12, 0.5],
        lod: 0.4,
        defocus: 0.8,
        fog: n ? 0.18 : 0.1,
      },
      {
        tex: `d-insights-${t}.png`,
        crop: FULL_D,
        key: key(n),
        keyAmt: 0.75,
        breathe: [12, 0.0],
        lod: 0.4,
        defocus: 0.8,
        fog: n ? 0.18 : 0.1,
      },
      {
        tex: `d-home-${t}.png`,
        crop: FULL_D,
        key: key(n),
        keyAmt: 0.72,
        breathe: [10, 0.6],
        bezel: 11,
        glow: 0.7,
      },
      {
        tex: `p-runway-${t}.png`,
        crop: FULL_P,
        key: key(n),
        keyAmt: 0.6,
        breathe: [9, 0.3],
        bezel: 8,
      },
      { parent: 4, src: figure, lift: 110, breathe: [12, 0.85], shift: [-16, 6], ...LIFT(n) },
    ];
    return W.map((w, i) => ({ ...w, ...(P0[i] || {}) }));
  },
  type: ph
    ? [
        T('name', 'Ledger', 190.5, 30, { fontSize: '54px' }, 'center'),
        T(
          'line',
          'Turns your savings into<br>a monthly salary that lasts.',
          190.5,
          100,
          { fontSize: '16px', textAlign: 'center' },
          'center',
        ),
      ]
    : [
        T('name', 'Ledger', 420, 30, { fontSize: '66px' }, 'center'),
        T(
          'line',
          'Turns your savings into a monthly salary that lasts.',
          420,
          110,
          { fontSize: '17.5px' },
          'center',
        ),
      ],
});

// ---------- the numbers band ----------
const FACTS = [
  ['0', 'accounts, servers or trackers'],
  ['483', 'tests on every change'],
  ['3', 'decimals in a dinar, kept exact'],
  ['24', 'currencies, in whole-number maths'],
];
const BAND = (ph) => {
  const css = ph ? [381, 300] : [840, 196];
  const bw = ph ? 361 : 804,
    bh = ph ? 250 : 126,
    cx = css[0] / 2,
    cy = css[1] / 2;
  const cells = FACTS.map((f, i) =>
    ph
      ? {
          x: cx - bw / 2 + (i % 2) * (bw / 2) + 26,
          y: cy - bh / 2 + Math.floor(i / 2) * (bh / 2) + 26,
          w: bw / 2 - 44,
        }
      : { x: cx - bw / 2 + i * (bw / 4) + 28, y: cy - 34, w: bw / 4 - 48 },
  );
  return {
    css,
    ...(ph ? { dpr: 1080 / 381 } : {}),
    fade: ph ? [14, 14, 18, 18] : [30, 30, 22, 26],
    cam: [0, 0],
    motion: 0,
    vigOff: true,
    pool: [0.5, 0.5, 0.8, 0.95],
    night: merge(NIGHT, {
      env: {
        glows: [
          [0.5, 1.2, 0.7, 0.07, '#c8b88e'],
          [0.5, -0.3, 0.6, 0.05, '#3c5a48'],
        ],
      },
      motes: { n: 24 },
    }),
    day: merge(DAY, { motes: { n: 16 } }),
    windows: () => [
      {
        x: cx,
        y: cy,
        w: bw,
        h: bh,
        z: 0,
        rot: [0, 0, 0],
        bar: false,
        bezel: 0,
        radius: 22,
        bevel: 14,
        breathe: [0, 0],
        glow: 0.35,
        glowColor: '#3a4a3e',
        refract: 34,
      },
    ],
    type: [
      ...cells.map((c, i) =>
        T(
          'fact' + (ph ? ' phone' : ''),
          `<b>${FACTS[i][0]}</b><span>${FACTS[i][1]}</span>`,
          c.x,
          c.y,
          { width: c.w + 'px', whiteSpace: 'normal' },
        ),
      ),
      ...(ph
        ? [
            T('vrule', '', cx, cy - bh / 2 + 22, { height: bh - 44 + 'px' }),
            T('vrule', '', cx - bw / 2 + 22, cy, { width: bw - 44 + 'px', height: '1px' }),
          ]
        : [1, 2, 3].map((i) =>
            T('vrule', '', cx - bw / 2 + i * (bw / 4), cy - bh / 2 + 24, {
              height: bh - 48 + 'px',
            }),
          )),
    ],
  };
};

// ---------- the feature panels ----------
// Standard places: the desktop window behind, the phone in front of it, on the side away from
// the copy; a lifted detail floats nearest the viewer.
const SPOT = {
  left: {
    d: { x: 590, y: 204, w: 400, z: -80, rot: [2, -18, 0] },
    p: { x: 756, y: 250, h: 272, z: 60, rot: [0, -14, 0] },
  },
  right: {
    d: { x: 294, y: 212, w: 400, z: -80, rot: [2, 18, 0] },
    p: { x: 106, y: 254, h: 272, z: 60, rot: [0, 14, 0] },
  },
  phone: {
    d: { x: 200, y: 336, w: 318, z: -80, rot: [2, -14, 0] },
    p: { x: 316, y: 378, h: 236, z: 60, rot: [0, -14, 0] },
  },
};
const spot = (o, ph) => SPOT[ph ? 'phone' : o.side || 'left'];
const pick = (o, ph) => (ph ? o.phone || {} : o[o.side || 'left'] || {});

const HOME = {
  kick: 'Home',
  head: 'Know what is safe to spend today',
  text: 'One number, from your salary, what you have spent and the bills still due before payday.',
  left: { shift: [-200, -150], grow: 1.15 },
  phone: { shift: [-70, -110], grow: 1.15 },
  win(n, ph) {
    const t = th(n),
      S = spot(this, ph),
      L = pick(this, ph);
    return [
      {
        tex: `d-home-${t}.png`,
        crop: FULL_D,
        ...S.d,
        key: key(n),
        keyAmt: 0.72,
        breathe: [8, 0.0],
        bezel: 10,
      },
      {
        tex: `p-home-${t}.png`,
        crop: FULL_P,
        ...S.p,
        key: key(n),
        keyAmt: 0.6,
        breathe: [8, 0.45],
        bezel: 8,
      },
      {
        parent: 0,
        src: box('d-home', t, 'month', D, 14),
        lift: 120,
        grow: L.grow,
        shift: L.shift,
        breathe: [10, 0.25],
        ...LIFT(n),
      },
    ];
  },
};

const RW_FRAMES = 48;
const seq = (k, t) =>
  Array.from({ length: RW_FRAMES }, (_, i) => `${k}-rw-${t}-${String(i).padStart(2, '0')}.png`);
const RUNWAY = {
  side: 'right',
  kick: 'Runway',
  head: 'See exactly how long your savings last',
  text: 'Your savings projected payday by payday, drawn as a road that stops where the money does.',
  right: { shift: [150, -20], grow: 0.95 },
  phone: { shift: [60, 40], grow: 0.8 },
  win(n, ph) {
    const t = th(n),
      S = spot(this, ph),
      L = pick(this, ph);
    return [
      {
        seq: seq('d', t),
        crop: FULL_D,
        ...S.d,
        key: key(n),
        keyAmt: 0.72,
        breathe: [8, 0.0],
        bezel: 10,
      },
      {
        seq: seq('p', t),
        crop: FULL_P,
        ...S.p,
        key: key(n),
        keyAmt: 0.6,
        breathe: [8, 0.45],
        bezel: 8,
      },
      {
        parent: 0,
        src: box('d-rw', t, 'title', D, 16),
        lift: 110,
        grow: L.grow,
        shift: L.shift,
        breathe: [10, 0.25],
        ...LIFT(n),
      },
    ];
  },
};

const IMPORT = {
  kick: 'Import',
  head: 'A statement, checked to the fils',
  text: 'A PDF or CSV from your bank, read on your device and checked row by row against the running balance.',
  // the status is lifted from the phone, where it is short enough to read at this size
  left: { shift: [-170, -30], grow: 2.3 },
  phone: { shift: [-120, -20], grow: 2.0 },
  win(n, ph) {
    const t = th(n),
      S = spot(this, ph),
      L = pick(this, ph);
    return [
      {
        tex: `d-import-${t}.png`,
        crop: FULL_D,
        ...S.d,
        key: key(n),
        keyAmt: 0.72,
        breathe: [8, 0.0],
        bezel: 10,
      },
      {
        tex: `p-import-${t}.png`,
        crop: FULL_P,
        ...S.p,
        key: key(n),
        keyAmt: 0.6,
        breathe: [8, 0.45],
        bezel: 8,
      },
      {
        parent: 1,
        src: box('p-import', t, 'status', P, 6),
        lift: 120,
        grow: L.grow,
        shift: L.shift,
        breathe: [10, 0.25],
        ...LIFT(n),
        keyAmt: 0.0,
      },
    ];
  },
};

const INSIGHTS = {
  side: 'right',
  kick: 'Insights',
  head: 'See where the money went',
  text: 'The month or the year on one page: each category with its change, and the subscriptions it noticed.',
  right: { shift: [40, -130], grow: 1.05 },
  phone: { shift: [40, 10], grow: 0.9 },
  win(n, ph) {
    const t = th(n),
      S = spot(this, ph),
      L = pick(this, ph);
    const w = box('d-insights', t, 'where', D, 14);
    return [
      {
        tex: `d-insights-${t}.png`,
        crop: FULL_D,
        ...S.d,
        key: key(n),
        keyAmt: 0.72,
        breathe: [8, 0.0],
        bezel: 10,
      },
      {
        tex: `p-insights-${t}.png`,
        crop: FULL_P,
        ...S.p,
        key: key(n),
        keyAmt: 0.6,
        breathe: [8, 0.45],
        bezel: 8,
      },
      // the month's total and its strip of categories
      {
        parent: 0,
        src: [w[0], w[1], w[2], 196 * D],
        lift: 110,
        grow: L.grow,
        shift: L.shift,
        breathe: [10, 0.25],
        ...LIFT(n),
      },
    ];
  },
};

const PRIVACY = {
  kick: 'Privacy',
  head: 'Yours alone, on your device',
  text: 'No account, no server, no analytics. Every page tells the browser that Ledger may talk only to itself.',
  win(n, ph) {
    const t = th(n),
      S = spot(this, ph);
    const term = ph
      ? { x: 206, y: 384, w: 296, z: 70, rot: [0, -10, 0] }
      : { x: 604, y: 262, w: 326, z: 70, rot: [0, -12, 0] };
    return [
      {
        tex: `d-settings-${t}.png`,
        crop: FULL_D,
        ...S.d,
        key: key(n),
        keyAmt: 0.72,
        breathe: [8, 0.0],
        bezel: 10,
      },
      {
        tex: 't-csp.png',
        crop: [0, 0, 1280, 952],
        ...term,
        key: '#0A0D12',
        keyAmt: n ? 0.6 : 0.12,
        breathe: [8, 0.45],
        bezel: 9,
        glowColor: '#3c3420',
      },
    ];
  },
};

// ---------- the social preview, 1280 x 640 ----------
const SOCIAL = {
  css: [640, 320],
  fade: [26, 26, 22, 26],
  cam: [0, 0],
  motion: 0,
  pool: [0.7, 0.52, 0.4, 0.75],
  night: NIGHT,
  day: DAY,
  windows: (n) => {
    const t = th(n),
      fig = box('d-home', t, 'hello', D, 0),
      safe = box('d-home', t, 'safe', D, 0),
      sent = box('d-home', t, 'sentence', D, 0);
    return [
      {
        tex: `d-home-${t}.png`,
        crop: FULL_D,
        x: 446,
        y: 150,
        w: 300,
        z: -80,
        rot: [2, -18, 0],
        key: key(n),
        keyAmt: 0.72,
        breathe: [0, 0],
        bezel: 9,
      },
      {
        tex: `p-runway-${t}.png`,
        crop: FULL_P,
        x: 580,
        y: 184,
        h: 214,
        z: 60,
        rot: [0, -14, 0],
        key: key(n),
        keyAmt: 0.6,
        breathe: [0, 0],
        bezel: 7,
      },
      {
        parent: 0,
        src: [fig[0] - 24, safe[1] - 22, fig[2] + 48, sent[1] + sent[3] - safe[1] + 46],
        lift: 110,
        shift: [-30, -20],
        breathe: [0, 0],
        ...LIFT(n),
      },
    ];
  },
  type: [
    T('name', 'Ledger', 38, 112, { fontSize: '52px' }),
    T('line', 'Turns your savings into a monthly salary that lasts.', 40, 180, {
      fontSize: '16.5px',
      whiteSpace: 'normal',
      width: '230px',
    }),
  ],
};

export const LAYOUTS = {
  hero: HERO(false),
  'hero-phone': HERO(true),
  numbers: BAND(false),
  'numbers-phone': BAND(true),
  home: PANEL(HOME),
  'home-phone': PANEL_PHONE(HOME),
  runway: { ...PANEL(RUNWAY), envStill: true, motion: 0, cam: [0, 0] },
  'runway-phone': { ...PANEL_PHONE(RUNWAY), envStill: true, motion: 0, cam: [0, 0] },
  import: PANEL(IMPORT),
  'import-phone': PANEL_PHONE(IMPORT),
  insights: PANEL(INSIGHTS),
  'insights-phone': PANEL_PHONE(INSIGHTS),
  privacy: PANEL(PRIVACY),
  'privacy-phone': PANEL_PHONE(PRIVACY),
  social: SOCIAL,
};
for (const k in LAYOUTS) LAYOUTS[k].dpr = LAYOUTS[k].dpr || 2;
