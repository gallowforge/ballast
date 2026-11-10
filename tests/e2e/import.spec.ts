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

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000028000000280103000000b6302a2e0000000c504c5445ff000019e2093700',
  'hex',
);

for (const [what, file, message] of [
  [
    'an image',
    { name: 'pic.png', mimeType: 'image/png', buffer: PNG },
    'does not look like a statement',
  ],
  [
    'an image named as a PDF',
    { name: 'fake.pdf', mimeType: 'application/pdf', buffer: PNG },
    'does not look like a statement',
  ],
  [
    'an empty file',
    { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') },
    'This file is empty',
  ],
  [
    'a note with no table',
    {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello world, plain text that is not a statement\n'),
    },
    'found no rows of transactions',
  ],
  [
    'a damaged PDF',
    {
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >>\ntrailer garbage'),
    },
    'This PDF could not be opened',
  ],
] as const)
  test(`${what} is refused in plain words, where it can be seen`, async ({ page }) => {
    await open(page, 'import/');
    await page.locator('input[type=file]').setInputFiles(file);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(message);
    // Said at the top of the card, with focus on it, so a phone never hides it below the fold.
    await expect(alert).toBeFocused();
    await expect(alert).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('heading', { name: 'Check the columns' })).toHaveCount(0);
  });

test('the sample statement shows the columns it found', async ({ page }) => {
  await demo(page, 'import/');
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByLabel(/Column 1/)).toHaveValue('date');
  await expect(page.getByLabel(/Column 4/)).toHaveValue('debit');
  await expect(page.getByLabel(/Column 6/)).toHaveValue('balance');
});
