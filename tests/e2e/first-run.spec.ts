import { expect, test } from '@playwright/test';
import { open } from './helpers';

test('a new person sets up in three steps and sees their month', async ({ page }) => {
  await open(page, 'home/');
  await expect(page.getByRole('heading', { name: /planned a month at a time/ })).toBeVisible();
  await page.getByRole('button', { name: /Set up in a minute/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Your money' });
  await sheet.getByLabel('Savings today').fill('3000');
  await sheet.getByLabel('Spending account today').fill('80.500');
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
  await expect(page.getByText('15 salaries')).toBeVisible();

  // It is all still there after a reload.
  await page.reload();
  await expect(page.getByText('15 salaries')).toBeVisible();
});

test('demo data can be explored and cleared', async ({ page }) => {
  await open(page, 'home/');
  await page.getByRole('button', { name: /Explore with demo data/ }).click();
  await expect(page.getByText('Demo data for a made-up person.')).toBeVisible();
  await open(page, 'settings/');
  await page.getByRole('button', { name: /Delete everything/ }).click();
  await page.getByRole('dialog', { name: 'Delete everything?' }).getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('status')).toContainText('Everything was deleted');
  await open(page, 'home/');
  await expect(page.getByRole('button', { name: /Set up in a minute/ })).toBeVisible();
});
