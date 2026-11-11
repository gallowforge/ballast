import { CURRENCIES } from '../money/currency';

/**
 * Turns raw statement text into a readable payee: "POS PURCHASE 4111XXXXXXXX1234 WHOLE FOODS
 * MARKET AUSTIN TX 08/11 14:32" becomes "Whole Foods Market Austin". Conservative: when in doubt
 * it keeps words.
 */
const ACRONYMS = new Set([
  'ATM',
  'POS',
  'USA',
  'UK',
  'EU',
  'UAE',
  'KSA',
  'GCC',
  'NYC',
  'IKEA',
  'H&M',
  'AT&T',
  'BP',
  'BBQ',
  'KFC',
  'TGI',
  'AMC',
  'CVS',
  'HBO',
  'BBC',
  'DHL',
  'UPS',
  'USPS',
  'TFL',
  'NHS',
  'HMRC',
  'IRS',
  'DMV',
  'HSBC',
  'IBAN',
  'PS',
  'TV',
  'ID',
  'ADNOC',
  'STC',
]);

// Codes of every supported currency, for amounts quoted in another currency inside the text.
const CODES = CURRENCIES.map((c) => c.code).join('|');

const LEADING = [
  /^(POS|ECOM|E-COM|E-COMMERCE|ONLINE|CONTACTLESS|APPLE ?PAY|GOOGLE ?PAY|SAMSUNG ?PAY)\b[\s:-]*/,
  /^(PURCHASE|PURCHASES|PAYMENT|PMT|PAY)\b[\s:-]*/,
  /^(DIRECT DEBIT|STANDING ORDER|DEBIT ORDER|BILL PAYMENT)\b[\s:-]*/,
  // The card network a line may open with: the worldwide ones, then national networks whose
  // names are no shop's name (so "Maestro Pizza" keeps its first word).
  /^(VISA|MASTERCARD|MASTER CARD|MC|UNIONPAY|BANCONTACT|DANKORT|EFTPOS|GIROCARD|INTERAC|KNET|RUPAY)\b[\s:-]*/,
  /^(DEBIT CARD|CREDIT CARD|CARD|DC|CC)\b[\s:-]*/,
  /^(TXN|TRANSACTION|TRN|TRAN|RETAIL)\b[\s:-]*/,
  /^(AT|TO|FROM)\s+/,
];
const NOISE = [
  new RegExp(`\\b(?:${CODES})\\s*[\\d.,]+`, 'g'), // an amount quoted in another currency
  /\b\d{4,}[X*•]{2,}\d{2,6}\b/g, // masked card numbers
  /\b[X*•]{4,}\d{2,6}\b/g,
  /\b\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?\b/g, // dates
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/g, // times
  /\b(?:REF|REFERENCE|AUTH|AUTH CODE|APPR|SEQ|TERM|TID|MID|RRN)\b[\s.:#-]*[A-Z0-9-]+/g,
  /\b[A-Z]*\d[A-Z\d]{7,}\b/g, // long reference codes
  /\b\d{6,}\b/g,
  /#\s*\d+/g,
];
const TRAILING = [
  // A country printed in full after the merchant (two-letter codes are handled below).
  /\b(AUSTRALIA|CANADA|FRANCE|GERMANY|GREAT BRITAIN|ITALY|KUWAIT|NETHERLANDS|PORTUGAL|SAUDI ARABIA|SINGAPORE|SPAIN|UNITED ARAB EMIRATES|UNITED KINGDOM|UNITED STATES|USA)\s*$/,
  // The company's legal form: Inc, Ltd, GmbH, S.A., W.L.L., and a joint-stock company in its
  // national spellings (J.S.C., P.J.S.C. and the like, closed or public).
  /\b(W\.?L\.?L\.?|L\.?L\.?C\.?|(?:P\.?J\.?|[BJKPQ]\.?)S\.?C\.?[CP]?\.?|INC\.?|LTD\.?|LIMITED|CO\.?|COMPANY|GMBH|S\.?A\.?|PLC)\s*$/,
  /\s+[A-Z]{2}$/, // a trailing country code ("GB", "US")
  new RegExp(`\\s+(${CODES})\\s*[\\d.,]*$`),
];

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((w) => {
      const up = w.toUpperCase();
      if (ACRONYMS.has(up)) return up;
      if (/^(and|of|the|for|at|in|on|by|&)$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('')
    .replace(/^./, (c) => c.toUpperCase());
}

export function cleanPayee(raw: string): string {
  const original = raw.replace(/\s+/g, ' ').trim();
  let s = original.toUpperCase();
  for (const re of NOISE) s = s.replace(re, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    for (const re of LEADING) s = s.replace(re, '').trim();
    if (s === before) break;
  }
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const re of TRAILING) s = s.replace(re, '').trim();
    if (s === before || s.split(' ').length <= 1) break;
  }
  s = s
    .replace(/[*_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, '');
  if (s.length < 2) return original.length ? titleCase(original.slice(0, 40)) : 'Unknown';
  return titleCase(s.slice(0, 48)).trim();
}

/** Uppercase letters and spaces only: the key rules match against. */
export function merchantKey(raw: string): string {
  return cleanPayee(raw)
    .toUpperCase()
    .replace(/[^A-Z&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
