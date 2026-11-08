/**
 * Builds the synthetic sample statements used by the tests and by "Try a sample statement":
 * a two-page PDF in the posting-date / value-date / debit / credit / balance layout, the same
 * PDF locked with a password, and a CSV export of the same month. Every name and number is made
 * up. Requires qpdf for the locked copy.
 *
 *   node scripts/make-fixtures.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'tests/fixtures';
const PUB = 'public/samples';
mkdirSync(OUT, { recursive: true });
mkdirSync(PUB, { recursive: true });

// A fixed sample month. [day, description lines, debit fils, credit fils]
const MONTH = { y: 2026, m: 10, name: 'October 2026' };
const ROWS = [
  [1, ['TRANSFER FROM SAVINGS', 'OWN ACCOUNT 0021'], 0, 220_000],
  [1, ['POS PURCHASE 4111XXXXXXXX2290', 'STARBUCKS AVENUES KUWAIT KW'], 1_750, 0],
  [2, ['POS PURCHASE 4111XXXXXXXX2290', 'TALABAT GENERAL TRADING KW'], 4_250, 0],
  [3, ['KNET PURCHASE GYM OXYGEN FITNESS'], 18_000, 0],
  [3, ['POS PURCHASE LULU HYPERMARKET', 'AL RAI KUWAIT'], 14_380, 0],
  [4, ['POS PURCHASE KNPC STATION 112'], 5_000, 0],
  [5, ['POS PURCHASE CARIBOU COFFEE'], 1_500, 0],
  [6, ['STC KUWAIT POSTPAID BILL'], 8_500, 0],
  [7, ['POS PURCHASE TALABAT GENERAL TRADING KW'], 6_100, 0],
  [8, ['ECOM PURCHASE AMAZON.COM USD 23.49', 'AMZN MKTP US'], 7_215, 0],
  [9, ['SPOTIFY P2D4F9 STOCKHOLM SE'], 1_990, 0],
  [10, ['POS PURCHASE THE SULTAN CENTER', 'SALMIYA'], 9_870, 0],
  [11, ['ATM WITHDRAWAL 000117 HAWALLY'], 20_000, 0],
  [12, ['POS PURCHASE SHAKE SHACK THE AVENUES'], 8_750, 0],
  [13, ['POS PURCHASE STARBUCKS AVENUES KUWAIT KW'], 1_750, 0],
  [14, ['REFUND XCITE ONLINE ORDER 55821'], 0, 12_500],
  [15, ['NETFLIX.COM 866-579-7172'], 3_500, 0],
  [15, ['POS PURCHASE OULA FUEL 31'], 5_250, 0],
  [17, ['POS PURCHASE CARREFOUR AVENUES'], 17_640, 0],
  [18, ['POS PURCHASE TALABAT GENERAL TRADING KW'], 3_900, 0],
  [19, ['POS PURCHASE CINESCAPE 360 MALL'], 4_500, 0],
  [20, ['UPWORK ESCROW INC TRANSFER', 'INWARD REMITTANCE USD 380.00'], 0, 116_698],
  [21, ['APPLE.COM/BILL ITUNES.COM IE'], 990, 0],
  [22, ['POS PURCHASE CARIBOU COFFEE'], 1_250, 0],
  [23, ['POS PURCHASE KNPC STATION 112'], 4_750, 0],
  [24, ['POS PURCHASE LULU HYPERMARKET', 'AL RAI KUWAIT'], 11_220, 0],
  [25, ['POS PURCHASE CAREEM RIDE'], 2_350, 0],
  [26, ['POS PURCHASE PHARMACY AL SHIFA'], 3_150, 0],
  [27, ['POS PURCHASE TALABAT GENERAL TRADING KW'], 5_400, 0],
  [28, ['POS PURCHASE STARBUCKS AVENUES KUWAIT KW'], 2_000, 0],
  [29, ['SERVICE CHARGE ACCOUNT MAINTENANCE'], 1_000, 0],
  [30, ['POS PURCHASE THE SULTAN CENTER', 'SALMIYA'], 8_430, 0],
  [31, ['POS PURCHASE OULA FUEL 31'], 5_000, 0],
];
const OPENING = 46_320;

const fmt = (fils) => {
  const s = String(fils).padStart(4, '0');
  return `${s.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${s.slice(-3)}`;
};
const d2 = (n) => String(n).padStart(2, '0');
const date = (day) => `${d2(day)}/${d2(MONTH.m)}/${MONTH.y}`;

let bal = OPENING;
const lines = ROWS.map(([day, desc, debit, credit]) => {
  bal = bal - debit + credit;
  return { day, desc, debit, credit, bal };
});
const closing = bal;

// CSV export of the same month (one line per row, signed amount, balance).
const csv = [
  'Posting Date,Value Date,Description,Debit,Credit,Balance',
  `01/${d2(MONTH.m)}/${MONTH.y},01/${d2(MONTH.m)}/${MONTH.y},Opening Balance,,,${fmt(OPENING)}`,
  ...lines.map((l) =>
    [
      date(l.day),
      date(l.day),
      `"${l.desc.join(' ')}"`,
      l.debit ? fmt(l.debit) : '',
      l.credit ? fmt(l.credit) : '',
      `"${fmt(l.bal)}"`,
    ].join(','),
  ),
].join('\r\n');
writeFileSync(`${OUT}/sample-statement.csv`, csv + '\r\n');
copyFileSync(`${OUT}/sample-statement.csv`, `${PUB}/sample-statement.csv`);

const row = (l) => `<tr>
  <td>${date(l.day)}</td><td>${date(l.day)}</td>
  <td>${l.desc.map((s, i) => (i ? `<div class="wrap">${s}</div>` : s)).join('')}</td>
  <td class="n">${l.debit ? fmt(l.debit) : ''}</td><td class="n">${l.credit ? fmt(l.credit) : ''}</td><td class="n">${fmt(l.bal)}</td>
</tr>`;
const head = `<tr><th>Posting Date</th><th>Value Date</th><th>Description</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr>`;
const page = (rows, n, total, first) => `<section>
  <header><div class="bank">EXAMPLE BANK</div><div class="sub">Sample statement · synthetic data for testing</div></header>
  ${first ? `<div class="meta"><div><b>Statement of Account</b></div><div>Account holder: Alex Example</div><div>Account: 0000 1111 2222 (Current)</div><div>Currency: KWD</div><div>Period: 01/${d2(MONTH.m)}/${MONTH.y} to 31/${d2(MONTH.m)}/${MONTH.y}</div></div>` : ''}
  <table>${head}
  ${first ? `<tr><td>01/${d2(MONTH.m)}/${MONTH.y}</td><td></td><td>Opening Balance</td><td></td><td></td><td class="n">${fmt(OPENING)}</td></tr>` : ''}
  ${rows.map(row).join('')}
  ${n === total ? `<tr><td></td><td></td><td>Closing Balance</td><td></td><td></td><td class="n">${fmt(closing)}</td></tr>` : ''}
  </table>
  <footer>Page ${n} of ${total}</footer>
</section>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font: 9.5pt Helvetica, Arial, sans-serif; color: #111; }
  section { page-break-after: always; position: relative; min-height: 262mm; }
  section:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5pt solid #333; padding-bottom: 4pt; margin-bottom: 10pt; }
  .bank { font-weight: 700; font-size: 15pt; letter-spacing: 1pt; }
  .sub { font-size: 8pt; color: #555; }
  .meta { margin-bottom: 12pt; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; border-bottom: 1pt solid #333; padding: 4pt 4pt; font-size: 8.5pt; }
  td { padding: 3.5pt 4pt; vertical-align: top; border-bottom: 0.5pt solid #ddd; }
  td:nth-child(1), td:nth-child(2) { width: 62pt; white-space: nowrap; }
  .n { text-align: right; white-space: nowrap; width: 62pt; }
  .wrap { color: #333; }
  footer { position: absolute; bottom: 0; width: 100%; text-align: center; font-size: 8pt; color: #555; }
</style></head><body>
${page(lines.slice(0, 20), 1, 2, true)}
${page(lines.slice(20), 2, 2, false)}
</body></html>`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const p = await browser.newPage();
await p.setContent(html);
await p.pdf({
  path: `${OUT}/sample-statement.pdf`,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
copyFileSync(`${OUT}/sample-statement.pdf`, `${PUB}/sample-statement.pdf`);
execFileSync('qpdf', [
  '--encrypt',
  'ledger-demo',
  'ledger-demo',
  '256',
  '--',
  `${OUT}/sample-statement.pdf`,
  `${OUT}/sample-statement-locked.pdf`,
]);
writeFileSync(
  `${OUT}/sample-statement.json`,
  JSON.stringify(
    {
      opening: OPENING,
      closing,
      rows: lines.length,
      debit: lines.reduce((s, l) => s + l.debit, 0),
      credit: lines.reduce((s, l) => s + l.credit, 0),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `sample statement: ${lines.length} rows, opening ${fmt(OPENING)}, closing ${fmt(closing)}`,
);
