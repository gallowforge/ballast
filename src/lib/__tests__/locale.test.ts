import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENCIES, isCurrency } from '../money/currency';
import {
  FALLBACK_CURRENCY,
  REGION_CURRENCIES,
  currencyForLocales,
  currencyForRegion,
  localCurrency,
} from '../money/locale';

afterEach(() => vi.unstubAllGlobals());

describe('a main currency from the browser language', () => {
  it.each([
    [['en-US'], 'USD'],
    [['en-GB'], 'GBP'],
    [['de-DE'], 'EUR'],
    [['fr-FR'], 'EUR'],
    [['nl-NL'], 'EUR'],
    [['bg-BG'], 'EUR'],
    [['fr-CA'], 'CAD'],
    [['en-AU'], 'AUD'],
    [['en-NZ'], 'NZD'],
    [['de-CH'], 'CHF'],
    [['ja-JP'], 'JPY'],
    [['ko-KR'], 'KRW'],
    [['pt-BR'], 'BRL'],
    [['es-MX'], 'MXN'],
    [['hi-IN'], 'INR'],
    [['sv-SE'], 'SEK'],
    [['ar-AE'], 'AED'],
    [['ar-EG'], 'EGP'],
    [['zh-Hant-TW'], 'TWD'],
    [['sr-Latn-ME'], 'EUR'],
  ])('%j → %s', (locales, code) => expect(currencyForLocales(locales)).toBe(code));

  it('uses the likeliest region of a language without one', () => {
    expect(currencyForLocales(['de'])).toBe('EUR');
    expect(currencyForLocales(['ja'])).toBe('JPY');
    expect(currencyForLocales(['en'])).toBe('USD');
  });

  it('follows the order of preference, skipping regions it cannot use', () => {
    expect(currencyForLocales(['de', 'en-US', 'en'])).toBe('EUR');
    expect(currencyForLocales(['es-AR', 'en-GB'])).toBe('GBP');
    expect(currencyForLocales(['es-419', 'pt-PT'])).toBe('EUR');
  });

  it('falls back to US dollars', () => {
    expect(FALLBACK_CURRENCY).toBe('USD');
    expect(currencyForLocales([])).toBe('USD');
    expect(currencyForLocales(['es-AR'])).toBe('USD');
    expect(currencyForLocales(['not a locale', '!!'])).toBe('USD');
  });

  it('reads regions in any case', () => {
    expect(currencyForRegion('gb')).toBe('GBP');
    expect(currencyForRegion('ZZ')).toBeUndefined();
    expect(currencyForRegion(undefined)).toBeUndefined();
  });

  it('knows a region for every supported currency, and only supported ones', () => {
    for (const c of CURRENCIES) expect(REGION_CURRENCIES[c.code]?.length).toBeGreaterThan(0);
    for (const code of Object.keys(REGION_CURRENCIES)) expect(isCurrency(code)).toBe(true);
    const all = Object.values(REGION_CURRENCIES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('reads the browser languages, then the single language', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB', 'en'], language: 'en-GB' });
    expect(localCurrency()).toBe('GBP');
    vi.stubGlobal('navigator', { languages: [], language: 'ja-JP' });
    expect(localCurrency()).toBe('JPY');
    vi.stubGlobal('navigator', undefined);
    expect(localCurrency()).toBe('USD');
  });
});
