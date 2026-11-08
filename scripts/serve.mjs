// Minimal static file server for `dist/`, used by Playwright, Lighthouse and the README visuals.
// Mirrors a static host: directory index.html, 404 → dist/404.html, immutable hashed assets.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'dist';
const port = Number(process.env.PORT ?? process.argv[3] ?? 4321);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  let status = 200;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    status = 404;
    file = join(root, '404.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
  }
  const type = types[extname(file)] ?? 'application/octet-stream';
  // Compress text like a real static host (GitHub Pages does), so Lighthouse measures fairly.
  const gzip =
    /text|javascript|json|xml|svg|manifest/.test(type) &&
    /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(status, {
    'content-type': type,
    ...(gzip ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}),
    'cache-control': path.startsWith('/_astro/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  const stream = createReadStream(file);
  (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
