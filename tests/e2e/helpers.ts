import { expect, type Page } from '@playwright/test';

/** Waits until every island on the page has hydrated. */
export async function hydrated(page: Page) {
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0, { timeout: 15_000 });
}

export async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}

/** Loads the made-up demo data and lands on Home. */
export async function demo(page: Page, path = 'home/') {
  await open(page, 'home/?demo=1');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  if (path !== 'home/') await open(page, path);
}

/** Opens the add sheet the way a person would on this screen size. */
export async function openAdd(page: Page) {
  await page.locator('[data-add]:visible').first().click();
  await expect(page.getByRole('dialog', { name: 'Add a transaction' })).toBeVisible();
}

export const dialog = (page: Page) => page.getByRole('dialog');

/** Moves to another page through the app's own navigation, as a person would. */
export async function nav(page: Page, label: string) {
  await page.locator('nav[aria-label="Main"]:visible').getByRole('link', { name: label }).click();
  await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
  await hydrated(page);
}
