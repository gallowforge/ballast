import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.use({ locale: 'en-US' });

test('a new person sets up in three steps and sees their month', async ({ page }) => {
  await open(page, 'home/');
  await expect(page.getByRole('heading', { name: /A calm place/ })).toBeVisible();
  await page.getByRole('button', { name: /Set up in a minute/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Your money' });
  await expect(sheet.getByLabel('Main currency')).toHaveValue('USD');
  await sheet.getByLabel('Savings today').fill('3000');
  await sheet.getByLabel('Spending account today').fill('80.50');
  await sheet.getByLabel('Your first name (optional)').fill('Sam');
  await sheet.getByRole('button', { name: 'Next' }).click();

  const pay = page.getByRole('dialog', { name: 'Pay yourself' });
  await pay.getByRole('textbox', { name: 'Monthly salary' }).fill('200');
  await pay.getByRole('button', { name: 'Next' }).click();

  const target = page.getByRole('dialog', { name: 'A date to reach' });
  await expect(target.getByText(/your savings pay 15 more salaries/)).toBeVisible();
  await target.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sam');
  await expect(page.getByRole('heading', { name: 'Safe to spend today' })).toBeVisible();
  await expect(page.getByText(/15 salaries left/)).toBeVisible();

  // It is all still there after a reload.
  await page.reload();
  await expect(page.getByText(/15 salaries left/)).toBeVisible();
});

test.describe('in another country', () => {
  test.use({ locale: 'de-DE' });

  test('setup suggests the local currency, and any other can be chosen', async ({ page }) => {
    await open(page, 'home/');
    await page.getByRole('button', { name: /Set up in a minute/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Your money' });
    await expect(sheet.getByLabel('Main currency')).toHaveValue('EUR');
    await sheet.getByLabel('Main currency').selectOption('GBP');
    await sheet.getByLabel('Savings today').fill('3000');
    await sheet.getByRole('button', { name: 'Next' }).click();
    const pay = page.getByRole('dialog', { name: 'Pay yourself' });
    await pay.getByRole('textbox', { name: 'Monthly salary' }).fill('200');
    await pay.getByRole('button', { name: 'Next' }).click();
    await page
      .getByRole('dialog', { name: 'A date to reach' })
      .getByRole('button', { name: 'Start' })
      .click();
    await expect(page.getByRole('heading', { name: 'Safe to spend today' })).toBeVisible();
    await open(page, 'settings/');
    await expect(page.getByLabel('Main currency')).toHaveValue('GBP');
  });
});

test('demo data can be explored and cleared', async ({ page }) => {
  await open(page, 'home/');
  await page.getByRole('button', { name: /Look around first/ }).click();
  await expect(page.getByText(/Alex is made up/)).toBeVisible();
  await open(page, 'settings/');
  await page.getByRole('button', { name: /Delete everything/ }).click();
  await page
    .getByRole('dialog', { name: 'Delete everything?' })
    .getByRole('button', { name: 'Delete everything' })
    .click();
  await expect(page.getByRole('status')).toContainText('Everything was deleted');
  await open(page, 'home/');
  await expect(page.getByRole('button', { name: /Set up in a minute/ })).toBeVisible();
});
