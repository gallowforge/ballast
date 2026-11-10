import { isCurrency } from './currency';

/** The main currency when nothing better is known. */
export const FALLBACK_CURRENCY = 'USD';

/**
 * The regions (ISO 3166 codes, as browser locales carry them) that use each supported currency,
 * including the territories and small states that use another country's money.
 */
const REGIONS: Record<string, string> = {
  USD: 'US PR GU VI AS MP UM EC SV PA TL FM MH PW BQ TC VG IO',
  EUR: 'AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK AX GF GP MQ RE YT PM BL MF TF',
  GBP: 'GB IM JE GG',
  AED: 'AE',
  AUD: 'AU CX CC NF KI NR TV HM',
  BHD: 'BH',
  BRL: 'BR',
  CAD: 'CA',
  CHF: 'CH LI',
  CNY: 'CN',
  COP: 'CO',
  CZK: 'CZ',
  DKK: 'DK GL FO',
  EGP: 'EG',
  HKD: 'HK',
  HUF: 'HU',
  IDR: 'ID',
  INR: 'IN',
  JOD: 'JO',
  JPY: 'JP',
  KRW: 'KR',
  KWD: 'KW',
  MXN: 'MX',
  MYR: 'MY',
  NGN: 'NG',
  NOK: 'NO SJ BV',
  NZD: 'NZ CK NU PN TK',
  OMR: 'OM',
  PHP: 'PH',
  PKR: 'PK',
  PLN: 'PL',
  QAR: 'QA',
  SAR: 'SA',
  SEK: 'SE',
  SGD: 'SG',
  THB: 'TH',
  TRY: 'TR',
  TWD: 'TW',
  VND: 'VN',
  ZAR: 'ZA',
};

const BY_REGION = new Map(
  Object.entries(REGIONS).flatMap(([code, regions]) =>
    regions.split(' ').map((region) => [region, code] as const),
  ),
);

/** Every region the mapping knows, by currency (for tests that keep it in step with the list). */
export const REGION_CURRENCIES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(REGIONS).map(([code, regions]) => [code, regions.split(' ')]),
);

/** The supported currency a region uses ("DE" → "EUR"), or undefined. */
export function currencyForRegion(region: string | undefined): string | undefined {
  const code = region ? BY_REGION.get(region.toUpperCase()) : undefined;
  return code && isCurrency(code) ? code : undefined;
}

/** The region a locale names ("en-GB" → "GB"), or the likeliest one for its language ("de" → "DE"). */
function regionOf(tag: string): string | undefined {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region ?? locale.maximize().region;
  } catch {
    return undefined;
  }
}

/**
 * The main currency for someone with these preferred languages, in order: the first locale whose
 * region uses a supported currency decides ("de-AT" → EUR, "en-GB" → GBP, "ja" → JPY). A locale
 * without a usable region is skipped; with none at all, US dollars.
 */
export function currencyForLocales(locales: readonly string[]): string {
  for (const tag of locales) {
    const code = currencyForRegion(regionOf(tag));
    if (code) return code;
  }
  return FALLBACK_CURRENCY;
}

/** The main currency this browser's language settings suggest, for a new user's first setup. */
export function localCurrency(): string {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const list = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return currencyForLocales(list);
}
