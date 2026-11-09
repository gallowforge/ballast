// Renders one Glass scene from layouts.js with the GPU, through headless Chromium.
//   node render.cjs <layout> <dark|light> still <phase> <out.png>
//   node render.cjs <layout> <dark|light> anim <frames> <outDir>
// Needs `playwright` and `three` on NODE_PATH (build.sh sets it up). Captures are read from
// ../.raw/shots, which capture.mjs fills.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SRC = __dirname;
const SHOTS = path.resolve(SRC, '../.raw/shots');
// three is not one of the app's dependencies: `npm install --no-save three` puts it in node_modules.
const THREE = [
  ...(process.env.NODE_PATH || '').split(path.delimiter),
  path.resolve(SRC, '../../../node_modules'),
]
  .filter(Boolean)
  .map((d) => path.join(d, 'three/build/three.module.js'))
  .find((f) => fs.existsSync(f));
if (!THREE) throw new Error('three is missing: run `npm install --no-save three` first');
const MIME = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.png': 'image/png',
  '.css': 'text/css',
  '.webp': 'image/webp',
};

(async () => {
  const [layout, theme, mode, arg, out, ss] = process.argv.slice(2);
  const { LAYOUTS } = await import(pathToFileURL(path.join(SRC, 'layouts.js')).href);
  const L = LAYOUTS[layout];
  if (!L) throw new Error(`No layout called ${layout}`);
  const browser = await chromium.launch({
    args: [
      '--use-angle=vulkan',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: L.css[0], height: L.css[1] },
    deviceScaleFactor: L.dpr,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log('[page]', m.text().slice(0, 2000));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('http://glass.local/**', (r) => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname);
    const f =
      p === '/vendor/three.module.js'
        ? THREE
        : p.startsWith('/shots/')
          ? path.join(SHOTS, p.slice(7))
          : path.join(SRC, p.replace(/^\/src\//, ''));
    if (fs.existsSync(f))
      r.fulfill({ path: f, contentType: MIME[path.extname(f)] || 'application/octet-stream' });
    else {
      console.log('404', p);
      r.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto(
    `http://glass.local/src/scene.html?layout=${layout}&theme=${theme}&ss=${ss || 2}`,
  );
  await page.waitForFunction(() => window.__ready !== undefined, null, { timeout: 30000 });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(300);
  if (mode === 'still') {
    await page.evaluate((p) => window.renderAt(p), +arg);
    await page.screenshot({ path: out });
  } else {
    const n = +arg;
    fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < n; i++) {
      await page.evaluate((p) => window.renderAt(p), i / n);
      await page.screenshot({ path: path.join(out, `f${String(i).padStart(4, '0')}.png`) });
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
