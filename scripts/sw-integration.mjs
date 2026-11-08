// Runs after every build:
// 1. Adds <link rel="modulepreload"> for every script a page will import, so the browser fetches
//    them in parallel instead of discovering them one import at a time.
// 2. Writes dist/sw.js: the service worker template from src/sw/sw.js with the full list of built
//    files to precache and a version derived from their contents, so a new deploy is picked up
//    exactly when something changed and every page works offline from the first visit.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const SKIP = /(^|\/)(sw\.js|robots\.txt|sitemap[^/]*\.xml|_headers)$|\.map$/;
const STATIC_IMPORT = /(?:^|[;\s}])import\s*(?:[\w${},*\s]+from\s*)?["']([^"']+\.js)["']/g;

async function preload(root, files) {
  const cache = new Map();
  const deps = async (file, seen) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!cache.has(file)) cache.set(file, await readFile(join(root, file), 'utf8').catch(() => ''));
    for (const m of cache.get(file).matchAll(STATIC_IMPORT)) await deps(posix.normalize(posix.join(posix.dirname(file), m[1])), seen);
  };
  for (const page of files.filter((f) => f.endsWith('.html'))) {
    const path = join(root, page);
    let html = await readFile(path, 'utf8');
    const entries = [...html.matchAll(/(?:component-url|renderer-url|src)="([^"]*_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
    if (!entries.length) continue;
    const prefix = entries[0].slice(0, entries[0].indexOf('_astro/'));
    const seen = new Set();
    for (const e of entries) await deps(e.slice(prefix.length), seen);
    const links = [...seen].map((f) => `<link rel="modulepreload" href="${prefix}${f}">`).join('');
    html = html.replace('</head>', `${links}</head>`);
    await writeFile(path, html);
  }
}

export function serviceWorker() {
  return {
    name: 'ledger-postbuild',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const all = (await walk(root)).map((f) => relative(root, f).split(sep).join('/')).sort();
        await preload(root, all);
        const files = all.filter((f) => !SKIP.test(f));
        const hash = createHash('sha256');
        for (const f of files) {
          hash.update(f);
          hash.update(await readFile(join(root, f)));
        }
        const version = hash.digest('hex').slice(0, 12);
        const urls = files.map((f) => (f === 'index.html' ? './' : f.replace(/(^|\/)index\.html$/, '$1')));
        const template = await readFile(new URL('../src/sw/sw.js', import.meta.url), 'utf8');
        const body = template.replace("'__VERSION__'", JSON.stringify(version)).replace('[/* __PRECACHE__ */]', JSON.stringify(urls));
        await writeFile(join(root, 'sw.js'), body);
        logger.info(`modulepreload added; service worker ${version}: ${urls.length} files precached`);
      },
    },
  };
}
