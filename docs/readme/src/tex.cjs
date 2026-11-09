// Renders the terminal pages in tex/ to captures at 2x (t-<name>.png), so a terminal can be a window.
const { chromium } = require('playwright');
const fs = require('fs'),
  path = require('path'),
  { pathToFileURL } = require('url');
const TEX = path.join(__dirname, 'tex'),
  OUT = path.resolve(__dirname, '../.raw/shots');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const f of fs.readdirSync(TEX).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(TEX, f), 'utf8');
    const [, w, h] = html.match(/width:(\d+)px;height:(\d+)px/);
    const page = await browser.newPage({
      viewport: { width: +w, height: +h },
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(path.join(TEX, f)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 't-' + f.replace('.html', '.png')) });
    await page.close();
  }
  await browser.close();
})();
