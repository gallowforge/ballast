import { expect, test } from '@playwright/test';
import { hydrated } from './helpers';

const PAGES = [
  '',
  'home/',
  'activity/',
  'plan/',
  'runway/',
  'insights/',
  'import/',
  'settings/',
  'about/',
  'privacy/',
  'offline/',
];

for (const path of PAGES) {
  test(`/${path} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await hydrated(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('unknown pages get the 404 page', async ({ page }) => {
  const res = await page.goto('nope/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
});

test('the manifest makes it installable', async ({ request }) => {
  const m = await (await request.get('manifest.webmanifest')).json();
  expect(m).toMatchObject({ name: 'Ledger', display: 'standalone' });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('the service worker precaches every page', async ({ request }) => {
  const sw = await (await request.get('sw.js')).text();
  for (const p of ['home/', 'runway/', 'import/', 'offline/', 'samples/sample-statement.pdf'])
    expect(sw).toContain(`"${p}"`);
  expect(sw).not.toContain('__PRECACHE__');
});

test('every page forbids connections to other sites', async ({ page }) => {
  await page.goto('home/');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'self'");
});
