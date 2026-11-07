import type { APIRoute } from 'astro';
import { SITE, url } from '@/lib/site';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        name: 'Ledger',
        short_name: 'Ledger',
        description: SITE.description,
        id: url(),
        start_url: url('home/'),
        scope: url(),
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        background_color: '#1b1712',
        theme_color: '#1b1712',
        lang: 'en',
        categories: ['finance', 'productivity'],
        icons: [
          { src: url('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
          { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
          { src: url('icons/maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: url('favicon.svg'), sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Add a transaction', short_name: 'Add', url: url('activity/?add=1'), icons: [{ src: url('icons/icon-192.png'), sizes: '192x192' }] },
          { name: 'Import a statement', short_name: 'Import', url: url('import/'), icons: [{ src: url('icons/icon-192.png'), sizes: '192x192' }] },
          { name: 'Runway', url: url('runway/'), icons: [{ src: url('icons/icon-192.png'), sizes: '192x192' }] },
        ],
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
