// Writes dist/sw.js after every build: the service worker template from src/sw/sw.js with the
// full list of built files to precache and a version derived from their contents, so a new
// deploy is picked up exactly when something changed and every page works offline at once.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
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

export function serviceWorker() {
  return {
    name: 'ledger-service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await walk(root))
          .map((f) => relative(root, f).split(sep).join('/'))
          .filter((f) => !SKIP.test(f))
          .sort();
        const hash = createHash('sha256');
        for (const f of files) {
          hash.update(f);
          hash.update(await readFile(join(root, f)));
        }
        const version = hash.digest('hex').slice(0, 12);
        const urls = files.map((f) => (f === 'index.html' ? './' : f.replace(/(^|\/)index\.html$/, '$1')));
        const template = await readFile(new URL('../src/sw/sw.js', import.meta.url), 'utf8');
        const body = template
          .replace("'__VERSION__'", JSON.stringify(version))
          .replace('[/* __PRECACHE__ */]', JSON.stringify(urls));
        await writeFile(join(root, 'sw.js'), body);
        logger.info(`service worker ${version}: ${urls.length} files precached`);
      },
    },
  };
}
