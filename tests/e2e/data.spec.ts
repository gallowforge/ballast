import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { demo, open } from './helpers';

test('a backup exports, and restores after deleting everything', async ({ page }) => {
  await demo(page, 'settings/');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export a backup/ }).click();
  const file = await (await download).path();
  const backup = JSON.parse(readFileSync(file!, 'utf8'));
  expect(backup.app).toBe('ballast');
  const count = backup.data.txns.length;
  expect(count).toBeGreaterThan(100);

  await page.getByRole('button', { name: /Delete everything/ }).click();
  await page
    .getByRole('dialog', { name: 'Delete everything?' })
    .getByRole('button', { name: 'Delete everything' })
    .click();
  await expect(page.getByRole('button', { name: /Export to CSV/ })).toBeDisabled();

  await page.locator('input[type=file][accept*="json"]').setInputFiles(file!);
  await page
    .getByRole('dialog', { name: 'Restore this backup?' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(
    page.getByRole('button', { name: new RegExp(`Export to CSV.*${count} transactions`) }),
  ).toBeVisible();
});

test('transactions export as CSV', async ({ page }) => {
  await demo(page, 'settings/');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export to CSV/ }).click();
  const csv = readFileSync((await (await download).path())!, 'utf8');
  expect(csv.split('\r\n')[0]).toBe(
    'Date,Type,Account,To account,Payee,Category,Amount,Currency,Amount (KWD),Note',
  );
});

test('a file that is not a backup is refused politely', async ({ page }) => {
  await open(page, 'settings/');
  await page.locator('input[type=file][accept*="json"]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByRole('status')).toContainText('This file is not a Ballast backup.');
});

test('the whole app works offline after the first visit', async ({ page, context }) => {
  await demo(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
    return reg.active?.state;
  });
  await context.setOffline(true);
  await page.goto('runway/');
  await expect(page.getByRole('heading', { name: /carry you to/ })).toBeVisible();
  await page.goto('import/');
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Check the columns' })).toBeVisible();
  await context.setOffline(false);
});
