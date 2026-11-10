import { expect, test } from '@playwright/test';
import { demo, hydrated } from './helpers';

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

test('moving between pages leaves no screen half-built', async ({ page }) => {
  await demo(page);
  const tabs = [
    ['Activity', 'activity/'],
    ['Plan', 'plan/'],
    ['Runway', 'runway/'],
    ['Insights', 'insights/'],
    ['Home', 'home/'],
  ];
  for (const [label, path] of tabs) {
    await page
      .locator('nav[aria-label="Main"]:visible')
      .getByRole('link', { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await hydrated(page);
    // A screen hydrated onto its loading skeleton keeps aria-busy and loses its layout classes.
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  }
});

test('the landing page reads as one sentence under the road', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText(/savings last until \w+ \d{4},\s+\d+ salaries of/)).toBeVisible();
});

test('unknown pages get the 404 page', async ({ page }) => {
  const res = await page.goto('nope/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
});

test('the manifest makes it installable', async ({ request }) => {
  const m = await (await request.get('manifest.webmanifest')).json();
  expect(m).toMatchObject({ name: 'Ballast', display: 'standalone' });
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
