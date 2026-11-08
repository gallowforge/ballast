// Fails the build when a page ships more JavaScript than its budget. It follows every script a
// built page loads (Astro island entries and their static imports, not lazy imports such as the
// PDF reader) and adds up their gzip sizes.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET = { site: 12, app: 65 }; // KB gzip per page
const SITE_PAGES = new Set(['index.html', 'about/index.html', 'privacy/index.html', 'offline/index.html', '404.html']);

function pages(dir, base = '') {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    const rel = posix.join(base, f);
    if (statSync(p).isDirectory()) return f === '_astro' ? [] : pages(p, rel);
    return f.endsWith('.html') ? [rel] : [];
  });
}

const sizes = new Map();
function gz(file) {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(join(DIST, file))).length);
  return sizes.get(file);
}

function deps(file, seen) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(join(DIST, file), 'utf8');
  // Static imports only: `import ... from "./x.js"` and `import "./x.js"`, not `import("./x.js")`.
  for (const m of code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},*\s]+from\s*)?["']([^"']+\.js)["']/g)) {
    deps(posix.normalize(posix.join(dirname(file), m[1])), seen);
  }
}

let failed = false;
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const rows = [];
for (const page of pages(DIST).sort()) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const entries = new Set();
  for (const m of html.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js)"/g)) entries.add(m[1].replace(base, ''));
  for (const m of html.matchAll(/import\s*["']([^"']+\.js)["']/g)) entries.add(m[1].replace(base, ''));
  const seen = new Set();
  for (const e of entries) deps(e.replace(/^\//, ''), seen);
  const total = [...seen].reduce((s, f) => s + gz(f), 0) / 1024;
  const budget = SITE_PAGES.has(page) ? BUDGET.site : BUDGET.app;
  const ok = total <= budget;
  if (!ok) failed = true;
  rows.push(`${ok ? 'ok  ' : 'OVER'} ${page.padEnd(26)} ${total.toFixed(1).padStart(6)} KB of ${budget} KB`);
}
console.log(rows.join('\n'));
if (failed) {
  console.error('\nJavaScript budget exceeded.');
  process.exit(1);
}
