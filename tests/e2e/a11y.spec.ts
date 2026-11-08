import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { demo, hydrated, openAdd } from './helpers';

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, serious.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n')).toEqual([]);
}

const APP = ['home/', 'activity/', 'plan/', 'runway/', 'insights/', 'import/', 'settings/'];
const SITE = ['', 'about/', 'privacy/'];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const path of SITE)
      test(`/${path} has no serious accessibility issues`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        await audit(page);
      });
    for (const path of APP)
      test(`/${path} with data has no serious accessibility issues`, async ({ page }) => {
        await demo(page, path);
        await audit(page);
      });
    test('the first-run screen and the add sheet have no serious issues', async ({ page }) => {
      await page.goto('home/');
      await hydrated(page);
      await audit(page);
      await openAdd(page);
      await audit(page);
    });
  });
}
