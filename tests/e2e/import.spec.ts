import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { demo, open } from './helpers';

const expected = JSON.parse(readFileSync('tests/fixtures/sample-statement.json', 'utf8'));

async function choose(page: Page, file: string) {
  await page.locator('input[type=file]').setInputFiles(`tests/fixtures/${file}`);
}

async function importIntoNewAccount(page: Page, file: string) {
  await choose(page, file);
  await expect(page.getByRole('heading', { name: 'Check the columns' })).toBeVisible();
  await page.getByLabel('Import into').selectOption({ label: 'A new account…' });
  await page
    .getByRole('button', { name: new RegExp(`Review ${expected.rows} transactions`) })
    .click();
  await expect(
    page.getByText(`All ${expected.rows} rows match the statement's running balance`),
  ).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`Import ${expected.rows} transactions`) })
    .click();
  await expect(
    page.getByRole('heading', { name: `${expected.rows} transactions imported` }),
  ).toBeVisible();
  await expect(page.getByText('Balances match.')).toBeVisible();
}

test('a PDF statement imports, reconciles to the cent and matches the bank', async ({ page }) => {
  await open(page, 'import/');
  await importIntoNewAccount(page, 'sample-statement.pdf');
});

test('a CSV statement imports, and importing it again adds nothing', async ({ page }) => {
  await open(page, 'import/');
  await importIntoNewAccount(page, 'sample-statement.csv');
  await page.getByRole('button', { name: 'Import another' }).click();
  await choose(page, 'sample-statement.csv');
  await expect(page.getByLabel('Import into')).not.toHaveValue('__new__');
  await page.getByRole('button', { name: /^Review/ }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`Already here ${expected.rows}`) }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
});

test('a locked PDF asks for its password, and a wrong one is refused', async ({ page }) => {
  await open(page, 'import/');
  await choose(page, 'sample-statement-locked.pdf');
  await expect(page.getByRole('heading', { name: 'This statement is locked' })).toBeVisible();
  await page.getByLabel('Statement password').fill('wrong');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('did not open');
  await page.getByLabel('Statement password').fill('ballast-demo');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check the columns' })).toBeVisible();
});

test('an import can be undone from the history', async ({ page }) => {
  await open(page, 'import/');
  await importIntoNewAccount(page, 'sample-statement.csv');
  await page.getByRole('button', { name: 'Import another' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status')).toContainText(
    `Removed ${expected.rows} imported transactions`,
  );
  await open(page, 'activity/');
  await page.getByLabel('Search transactions').fill('uber eats');
  await expect(page.getByText('A clean page.')).toBeVisible();
});

test('the sample statement shows the columns it found', async ({ page }) => {
  await demo(page, 'import/');
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByLabel(/Column 1/)).toHaveValue('date');
  await expect(page.getByLabel(/Column 4/)).toHaveValue('debit');
  await expect(page.getByLabel(/Column 6/)).toHaveValue('balance');
});
