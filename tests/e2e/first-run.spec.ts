import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.use({ locale: 'en-US' });

test('a new person sets up in three steps and sees their month', async ({ page, isMobile }) => {
  await open(page, 'home/');
  await expect(page.getByRole('heading', { name: /A calm place/ })).toBeVisible();
  if (!isMobile) {
    // Welcome's road (wide screens only): the flag's label stays in the picture, beside or above
    // its flag, never drawn back across the road.
    const label = await page
      .locator('[data-road]:visible svg')
      .evaluate(async (svg: SVGSVGElement) => {
        await document.fonts.ready;
        const text = svg.querySelector<SVGTextElement>('[data-flag] text')!.getBBox();
        const pole = svg.querySelector<SVGLineElement>('[data-flag] line')!.x1.baseVal.value;
        return { left: text.x, right: text.x + text.width, pole, width: svg.viewBox.baseVal.width };
      });
    expect(label.left).toBeGreaterThanOrEqual(label.pole - 1);
    expect(label.right).toBeLessThanOrEqual(label.width);
  }
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

test('setup needs savings, and plans toward a date only when asked', async ({ page }) => {
  await open(page, 'home/');
  // Nothing to add to yet: Welcome's steps are the only calls to action.
  await expect(page.locator('[data-add]:visible')).toHaveCount(0);
  await page.getByRole('button', { name: /Set up in a minute/ }).click();

  const money = page.getByRole('dialog', { name: 'Your money' });
  await money.getByRole('button', { name: 'Next' }).click();
  await expect(money.getByRole('alert')).toContainText('Enter what you have saved');
  await expect(money.getByLabel('Savings today')).toBeFocused();
  await expect(money.getByLabel('Savings today')).toHaveAttribute('aria-invalid', 'true');
  await money.getByLabel('Savings today').fill('3000');
  await expect(money.getByRole('alert')).toHaveCount(0);
  await money.getByRole('button', { name: 'Next' }).click();

  const pay = page.getByRole('dialog', { name: 'Pay yourself' });
  await pay.getByRole('textbox', { name: 'Monthly salary' }).fill('200');
  await pay.getByRole('button', { name: 'Next' }).click();

  const target = page.getByRole('dialog', { name: 'A date to reach' });
  await expect(target.getByRole('switch', { name: 'Plan toward a date' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await target.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText(/15 salaries left/)).toBeVisible();
  await expect(page.getByText(/You pass/)).toHaveCount(0);
  await expect(page.locator('[data-add]:visible')).toHaveCount(1);
});

test('without a salary or a month of history, the road says what it needs', async ({ page }) => {
  await open(page, 'home/');
  await page.getByRole('button', { name: /Set up in a minute/ }).click();
  await page.getByLabel('Savings today').fill('3000');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('switch', { name: 'Pay myself a monthly salary' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  const road = page.getByRole('region', { name: 'The road ahead' });
  await expect(road).toContainText('No road to draw yet');
  await expect(road.getByRole('link', { name: 'Set a salary' })).toBeVisible();
  await expect(page.getByText(/keep up with you/)).toHaveCount(0);
  await open(page, 'runway/');
  await expect(page.getByRole('heading', { level: 1, name: 'No road to draw yet' })).toBeVisible();
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
