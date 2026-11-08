// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorker } from './scripts/sw-integration.mjs';

/**
 * SITE_URL is the canonical public origin of the deployed site.
 * BASE_PATH is only needed under a sub-path (GitHub project pages: "/ledger/").
 */
const site = process.env.SITE_URL ?? 'https://gallowforge.github.io';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  build: {
    // One request fewer on a cold load; the service worker serves repeat visits locally anyway.
    inlineStylesheets: 'always',
    format: 'directory',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    preact({ compat: false }),
    sitemap({
      filter: (page) => !/\/(404|offline)\//.test(page),
    }),
    serviceWorker(),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: 'lightningcss',
      // Keep fonts and images as files: the Content Security Policy allows no data: fonts.
      assetsInlineLimit: 0,
    },
    worker: { format: 'es' },
  },
});
