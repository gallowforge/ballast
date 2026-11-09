import { expect, test } from '@playwright/test';
import { demo, nav, openAdd } from './helpers';

test('one line of text becomes a categorised transaction', async ({ page }) => {
  await demo(page, 'activity/');
  await openAdd(page);
  const sheet = page.getByRole('dialog', { name: 'Add a transaction' });
  await sheet.getByLabel('Type it in one line').fill('3.750 blue door bakery');
  await expect(sheet.getByText(/Spent 3.750 KD at Blue Door Bakery/)).toBeVisible();
  await sheet.getByLabel('Type it in one line').press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Added 3.750 KD');
  await expect(page.getByRole('button', { name: /Blue Door Bakery.*3\.750/ })).toBeVisible();
});

test('a transaction can be edited, deleted and brought back', async ({ page }) => {
  await demo(page, 'activity/');
  await openAdd(page);
  const add = page.getByRole('dialog', { name: 'Add a transaction' });
  await add.getByLabel('Amount', { exact: true }).fill('12.5');
  await add.getByLabel('Where').fill('Bookworm');
  await add.locator('label', { hasText: 'Education' }).click();
  await add.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('button', { name: /Bookworm.*12\.500/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit transaction' });
  await edit.getByLabel('Amount', { exact: true }).fill('14');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Bookworm.*14\.000/ })).toBeVisible();

  await page.getByRole('button', { name: /Bookworm.*14\.000/ }).click();
  await page
    .getByRole('dialog', { name: 'Edit transaction' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('button', { name: /Bookworm/ })).toHaveCount(0);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByRole('button', { name: /Bookworm.*14\.000/ })).toBeVisible();
});

test('the N key opens the add sheet, and Escape closes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'No keyboard on a phone');
  await demo(page);
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Add a transaction' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('money can be moved between accounts', async ({ page }) => {
  await demo(page, 'activity/');
  await openAdd(page);
  const sheet = page.getByRole('dialog', { name: 'Add a transaction' });
  await sheet.getByRole('radio', { name: 'Transfer' }).click();
  await sheet.getByLabel('Amount moved').fill('50');
  await sheet.getByLabel('From account').selectOption({ label: 'Current account (KD)' });
  await sheet.getByLabel('To account').selectOption({ label: 'Savings (KD)' });
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Transfers' }).click();
  await expect(page.getByText('Current account to Savings')).toBeVisible();
});

test('search finds transactions across all months', async ({ page }) => {
  await demo(page, 'activity/');
  await page.getByLabel('Search transactions').fill('upwork');
  await expect(page.getByText('across all time')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upwork/ }).first()).toBeVisible();
});

test('the quick launcher jumps to a page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard shortcut');
  await demo(page);
  await page.keyboard.press('Control+k');
  const launcher = page.getByRole('dialog', { name: 'Quick launcher' });
  await launcher.getByRole('combobox').fill('runway');
  await launcher.getByRole('combobox').press('Enter');
  await expect(page).toHaveURL(/runway\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /carry you to/ })).toBeVisible();
});

test('the runway tries a salary and applies it', async ({ page }) => {
  await demo(page, 'runway/');
  await expect(page.getByRole('heading', { name: /carry you to/ })).toBeVisible();
  await page.getByRole('button', { name: /^Try / }).click();
  await expect(page.getByText(/You still reach your date/)).toBeVisible();
  await page.getByRole('button', { name: 'Use this salary' }).click();
  await expect(page.getByRole('status')).toContainText('Salary set to');
  await nav(page, 'Plan');
  await expect(page.locator('#salary')).not.toContainText('220.000');
});

test('a budget can be added from its suggestion', async ({ page }) => {
  await demo(page, 'plan/');
  await page.getByRole('button', { name: 'Draw a new line' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a budget' });
  await sheet.getByLabel('Category').selectOption({ label: 'Transport' });
  await expect(sheet.getByText(/Your last three months averaged/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#budgets').getByRole('button', { name: /Transport/ })).toBeVisible();
});
