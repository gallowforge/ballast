import type { Rule } from '../model';
import { cleanPayee, merchantKey } from './clean';

interface Known {
  re: RegExp;
  payee?: string;
  categoryId: string;
  /** Only for money out (expense) or money in (income). */
  dir?: 'out' | 'in';
  /** Tried after the merchant names, so a merchant's own name wins ("TESLA ELECTRIC"). */
  late?: boolean;
}

/**
 * Merchants and words that say what a statement line was for: big names around the world and
 * online, some regional ones, and generic words. A person's own rules always win over these.
 * Rules for one direction (money out or in) are tried before the rest, each group in this order.
 */
export const KNOWN: Known[] = [
  // Food delivery, before the ride-hailing names they share ("UBER EATS", "GRABFOOD").
  { re: /\bUBER\s*\*?\s*EATS\b/, payee: 'Uber Eats', categoryId: 'delivery' },
  { re: /\bDOORDASH\b/, payee: 'DoorDash', categoryId: 'delivery' },
  { re: /\bDELIVEROO\b/, payee: 'Deliveroo', categoryId: 'delivery' },
  { re: /\bJUST ?EAT\b/, payee: 'Just Eat', categoryId: 'delivery' },
  { re: /\bGRUBHUB\b/, payee: 'Grubhub', categoryId: 'delivery' },
  { re: /\bGLOVO\b/, payee: 'Glovo', categoryId: 'delivery' },
  { re: /\bWOLT\b/, payee: 'Wolt', categoryId: 'delivery' },
  { re: /\bGRAB ?FOOD\b/, payee: 'GrabFood', categoryId: 'delivery' },
  { re: /\bFOODPANDA\b/, payee: 'foodpanda', categoryId: 'delivery' },
  { re: /\bSWIGGY\b/, payee: 'Swiggy', categoryId: 'delivery' },
  { re: /\bZOMATO\b/, payee: 'Zomato', categoryId: 'delivery' },
  { re: /\bTALABAT\b/, payee: 'Talabat', categoryId: 'delivery' },
  { re: /\bJAHEZ\b/, payee: 'Jahez', categoryId: 'delivery' },
  { re: /\bKEETA\b/, payee: 'Keeta', categoryId: 'delivery' },
  // Coffee.
  { re: /\bSTARBUCKS\b/, payee: 'Starbucks', categoryId: 'coffee' },
  { re: /\bCOSTA COFFEE\b/, payee: 'Costa Coffee', categoryId: 'coffee' },
  { re: /\bPRET( A MANGER)?\b/, payee: 'Pret A Manger', categoryId: 'coffee' },
  { re: /\bDUNKIN\b/, payee: 'Dunkin', categoryId: 'coffee' },
  { re: /\bTIM HORTONS?\b/, payee: 'Tim Hortons', categoryId: 'coffee' },
  { re: /\bBLUE BOTTLE\b/, payee: 'Blue Bottle Coffee', categoryId: 'coffee' },
  { re: /\bCARIBOU\b/, payee: 'Caribou Coffee', categoryId: 'coffee' },
  { re: /\b(%|PERCENT)?\s*ARABICA\b/, payee: '% Arabica', categoryId: 'coffee' },
  { re: /\bCOFFEE|CAFE|ESPRESSO|ROASTER/, categoryId: 'coffee' },
  // Groceries.
  { re: /\bWHOLE ?FOODS\b|\bWFM\b/, payee: 'Whole Foods Market', categoryId: 'groceries' },
  { re: /\bTRADER JOE/, payee: 'Trader Joe’s', categoryId: 'groceries' },
  { re: /\bALDI\b/, payee: 'Aldi', categoryId: 'groceries' },
  { re: /\bLIDL\b/, payee: 'Lidl', categoryId: 'groceries' },
  { re: /\bTESCO\b/, payee: 'Tesco', categoryId: 'groceries' },
  { re: /\bSAINSBURY/, payee: 'Sainsbury’s', categoryId: 'groceries' },
  { re: /\bWAITROSE\b/, payee: 'Waitrose', categoryId: 'groceries' },
  { re: /\bKROGER\b/, payee: 'Kroger', categoryId: 'groceries' },
  { re: /\bSAFEWAY\b/, payee: 'Safeway', categoryId: 'groceries' },
  { re: /\bCOSTCO\b/, payee: 'Costco', categoryId: 'groceries' },
  { re: /\bWAL-?MART\b/, payee: 'Walmart', categoryId: 'groceries' },
  { re: /\bINSTACART\b/, payee: 'Instacart', categoryId: 'groceries' },
  { re: /\bREWE\b/, payee: 'REWE', categoryId: 'groceries' },
  { re: /\bEDEKA\b/, payee: 'Edeka', categoryId: 'groceries' },
  { re: /\bALBERT HEIJN\b/, payee: 'Albert Heijn', categoryId: 'groceries' },
  { re: /\bMERCADONA\b/, payee: 'Mercadona', categoryId: 'groceries' },
  { re: /\bWOOLWORTHS\b/, payee: 'Woolworths', categoryId: 'groceries' },
  { re: /\bCOLES\b/, payee: 'Coles', categoryId: 'groceries' },
  { re: /\bCARREFOUR\b/, payee: 'Carrefour', categoryId: 'groceries' },
  { re: /\bLULU\b/, payee: 'Lulu Hypermarket', categoryId: 'groceries' },
  { re: /\bSULTAN CENT(ER|RE)\b|\bTSC\b/, payee: 'The Sultan Center', categoryId: 'groceries' },
  { re: /\bGEANT\b/, payee: 'Geant', categoryId: 'groceries' },
  { re: /\bCITY ?CENT(ER|RE)\b/, payee: 'City Centre', categoryId: 'groceries' },
  { re: /\b(CO-?OP|COOPERATIVE|JAMEIA|JAMEYA)\b/, categoryId: 'groceries' },
  { re: /\bSUPERMARKET|HYPERMARKET|GROCER/, categoryId: 'groceries' },
  // Fuel.
  { re: /\bSHELL\b/, payee: 'Shell', categoryId: 'fuel' },
  { re: /\bBP\b/, payee: 'BP', categoryId: 'fuel' },
  { re: /\bESSO\b/, payee: 'Esso', categoryId: 'fuel' },
  { re: /\bEXXON(MOBIL)?\b/, payee: 'ExxonMobil', categoryId: 'fuel' },
  { re: /\bCHEVRON\b/, payee: 'Chevron', categoryId: 'fuel' },
  { re: /\bTEXACO\b/, payee: 'Texaco', categoryId: 'fuel' },
  { re: /\bTOTAL ?ENERGIES\b/, payee: 'TotalEnergies', categoryId: 'fuel' },
  { re: /\bCIRCLE K\b/, payee: 'Circle K', categoryId: 'fuel' },
  { re: /\bADNOC\b/, payee: 'ADNOC', categoryId: 'fuel' },
  { re: /\bKNPC\b/, payee: 'KNPC', categoryId: 'fuel' },
  { re: /\bOULA\b/, payee: 'Oula', categoryId: 'fuel' },
  { re: /\bAL ?SOOR\b/, payee: 'Alsoor', categoryId: 'fuel' },
  { re: /\bFUEL|PETROL|GAS STATION\b/, categoryId: 'fuel' },
  // Getting around.
  { re: /\bUBER\b/, payee: 'Uber', categoryId: 'transport' },
  { re: /\bLYFT\b/, payee: 'Lyft', categoryId: 'transport' },
  { re: /\bBOLT\.EU\b|\bBOLT RIDES?\b/, payee: 'Bolt', categoryId: 'transport' },
  { re: /\bGRAB\b/, payee: 'Grab', categoryId: 'transport' },
  { re: /\bCAREEM\b/, payee: 'Careem', categoryId: 'transport' },
  { re: /\bTFL\b|TRANSPORT FOR LONDON/, payee: 'Transport for London', categoryId: 'transport' },
  { re: /\b(PARKING|TAXIS?|TRANSIT)\b/, categoryId: 'transport' },
  // Phone and internet.
  { re: /\bVODAFONE\b/, payee: 'Vodafone', categoryId: 'bills' },
  { re: /\bT-?MOBILE\b/, payee: 'T-Mobile', categoryId: 'bills' },
  { re: /\bVERIZON\b/, payee: 'Verizon', categoryId: 'bills' },
  { re: /\bAT ?& ?T\b/, payee: 'AT&T', categoryId: 'bills' },
  { re: /\bXFINITY|COMCAST\b/, payee: 'Xfinity', categoryId: 'bills' },
  { re: /\bVIRGIN MEDIA\b/, payee: 'Virgin Media', categoryId: 'bills' },
  { re: /\bETISALAT\b/, payee: 'e&', categoryId: 'bills' },
  { re: /\bZAIN\b/, payee: 'Zain', categoryId: 'bills' },
  { re: /\bOOREDOO\b/, payee: 'Ooredoo', categoryId: 'bills' },
  { re: /\bSTC\b|\bVIVA\b/, payee: 'stc', categoryId: 'bills' },
  // Subscriptions, before the shops some of them belong to ("AMAZON PRIME").
  { re: /\bNETFLIX\b/, payee: 'Netflix', categoryId: 'subscriptions' },
  { re: /\bSPOTIFY\b/, payee: 'Spotify', categoryId: 'subscriptions' },
  { re: /\bDISNEY\b/, payee: 'Disney+', categoryId: 'subscriptions' },
  { re: /\bHBO\b/, payee: 'HBO Max', categoryId: 'subscriptions' },
  { re: /\bHULU\b/, payee: 'Hulu', categoryId: 'subscriptions' },
  {
    re: /\bPRIME VIDEO|AMAZON PRIME|PRIME MEMBERSHIP\b/,
    payee: 'Amazon Prime',
    categoryId: 'subscriptions',
  },
  { re: /\bAUDIBLE\b/, payee: 'Audible', categoryId: 'subscriptions' },
  { re: /\bYOUTUBE\b/, payee: 'YouTube', categoryId: 'subscriptions' },
  { re: /\bAPPLE\.?COM|ITUNES|APPLE SERVICES\b/, payee: 'Apple', categoryId: 'subscriptions' },
  { re: /\bGOOGLE\b/, payee: 'Google', categoryId: 'subscriptions' },
  { re: /\b(MICROSOFT|MSFT)\b/, payee: 'Microsoft', categoryId: 'subscriptions' },
  { re: /\bADOBE\b/, payee: 'Adobe', categoryId: 'subscriptions' },
  { re: /\bDROPBOX\b/, payee: 'Dropbox', categoryId: 'subscriptions' },
  { re: /\bPATREON\b/, payee: 'Patreon', categoryId: 'subscriptions' },
  { re: /\bANGHAMI\b/, payee: 'Anghami', categoryId: 'subscriptions' },
  { re: /\bSHAHID\b/, payee: 'Shahid', categoryId: 'subscriptions' },
  { re: /\bOSN\b/, payee: 'OSN+', categoryId: 'subscriptions' },
  // Going out and games.
  { re: /\b(PLAYSTATION|PSN\b|STEAM|XBOX|NINTENDO)/, categoryId: 'fun' },
  {
    re: /\b(CINEMAS?|AMC|ODEON|CINEWORLD|REGAL|VUE|PATHE|CINESCAPE|VOX|GRAND CINEMAS)\b/,
    categoryId: 'fun',
  },
  { re: /\bTICKETMASTER|EVENTBRITE\b/, categoryId: 'fun' },
  // Shopping.
  { re: /\bAMAZON|AMZN\b/, payee: 'Amazon', categoryId: 'shopping' },
  { re: /\bEBAY\b/, payee: 'eBay', categoryId: 'shopping' },
  { re: /\bETSY\b/, payee: 'Etsy', categoryId: 'shopping' },
  { re: /\bALIEXPRESS\b/, payee: 'AliExpress', categoryId: 'shopping' },
  { re: /\bTEMU\b/, payee: 'Temu', categoryId: 'shopping' },
  { re: /\bSHEIN\b/, payee: 'Shein', categoryId: 'shopping' },
  { re: /\bZALANDO\b/, payee: 'Zalando', categoryId: 'shopping' },
  { re: /\bIKEA\b/, payee: 'IKEA', categoryId: 'shopping' },
  { re: /\bBEST BUY\b/, payee: 'Best Buy', categoryId: 'shopping' },
  { re: /\bMEDIA ?MARKT\b/, payee: 'MediaMarkt', categoryId: 'shopping' },
  { re: /\bNOON\b/, payee: 'noon', categoryId: 'shopping' },
  { re: /\bXCITE\b/, payee: 'Xcite', categoryId: 'shopping' },
  { re: /\bEUREKA\b/, payee: 'Eureka', categoryId: 'shopping' },
  {
    re: /\b(ZARA|H&M|H & M|UNIQLO|PRIMARK|MANGO|NIKE|ADIDAS|DECATHLON|CENTREPOINT|CENTERPOINT|MAX FASHION)\b/,
    categoryId: 'shopping',
  },
  // Health.
  {
    re: /\b(PHARMAC|CLINIC|HOSPITAL|DENTAL|MEDICAL|DOCTOR)|\b(BOOTS|CVS|WALGREENS)\b/,
    categoryId: 'health',
  },
  { re: /\bGYM|FITNESS|OXYGEN|GOLD'?S\b/, categoryId: 'health' },
  // Travel.
  {
    re: /\bAIRWAYS|AIRLINES?|RYANAIR|EASYJET|LUFTHANSA|EMIRATES|QATAR AIR|JAZEERA|FLYDUBAI|BOOKING\.COM|AIRBNB|HOTEL|HOSTEL|EXPEDIA|TRAINLINE|AMTRAK\b/,
    categoryId: 'travel',
  },
  // Learning.
  {
    re: /\bUNIVERSITY|COURSERA|UDEMY|SKILLSHARE|DOMESTIKA|MASTERCLASS|DUOLINGO|BOOKSTORE|BOOKSHOP|WATERSTONES|JARIR\b/,
    categoryId: 'education',
  },
  // Eating out.
  {
    re: /\bMCDONALD|KFC|BURGER|PIZZA|SUBWAY|SHAWARMA|RESTAURANT|GRILL|KITCHEN|BISTRO|BRASSERIE|TRATTORIA|SUSHI|SHAKE SHACK|FIVE GUYS|NANDO|WAGAMAMA|CHIPOTLE|DOMINO|TACO BELL|WENDY|PANERA|P\.?F\.? CHANG|CHEESECAKE|APPLEBEE|TGI\b/,
    categoryId: 'eating-out',
  },
  // Money out with a direction of its own: car hire (so it is never taken for rent), cash, fees,
  // and home costs, which wait until no merchant name has matched.
  {
    re: /\b(HERTZ|AVIS|SIXT|EUROPCAR|RENT ?A ?CAR|CAR RENTAL|CAR HIRE)\b/,
    categoryId: 'travel',
    dir: 'out',
  },
  {
    re: /\b(RENT|LANDLORD|LETTING|MORTGAGE|ELECTRICITY|ELECTRIC|UTILITY|UTILITIES|WATER BILL|COUNCIL TAX)\b/,
    categoryId: 'home',
    dir: 'out',
    late: true,
  },
  { re: /\bATM\b|CASH WITHDRAWAL/, payee: 'Cash withdrawal', categoryId: 'cash', dir: 'out' },
  { re: /\b(FEE|FEES|CHARGE|CHARGES|COMMISSION)\b/, categoryId: 'fees', dir: 'out' },
  // Money in.
  { re: /\b(SALARY|PAYROLL|WAGES)\b/, payee: 'Salary', categoryId: 'salary', dir: 'in' },
  { re: /\b(BENEFITS?|ALLOWANCE|STIPEND|PENSION)\b/, categoryId: 'allowance', dir: 'in' },
  { re: /\b(REFUND|REVERSAL|CASHBACK|CASH BACK)\b/, categoryId: 'refunds', dir: 'in' },
  {
    re: /\b(UPWORK|FIVERR|TOPTAL|MALT|DEEL|STRIPE|PAYPAL|PAYONEER|WISE)\b/,
    categoryId: 'freelance',
    dir: 'in',
  },
];

/** Words that suggest money moving between your own accounts. */
export const TRANSFER_HINT = /\b(TRANSFER|TRF|TRFR|FUNDS? TRANSFER|OWN ACCOUNT|IBAN|INTERNAL)\b/;

export interface Guess {
  payee: string;
  categoryId?: string;
  /** The text looks like a transfer between your own accounts. */
  transfer: boolean;
  /** The rule that decided it, for "why this category?". */
  ruleId?: string;
}

/** Picks a payee name and category for a statement line: your rules first, then known merchants. */
export function categorize(raw: string, dir: 'out' | 'in', rules: readonly Rule[]): Guess {
  const key = merchantKey(raw);
  const upper = raw.toUpperCase();
  const clean = cleanPayee(raw);
  const transfer = TRANSFER_HINT.test(upper);
  const mine = [...rules]
    .sort((a, b) => b.match.length - a.match.length)
    .find((r) => r.match && key.includes(r.match));
  if (mine)
    return { payee: mine.payee || clean, categoryId: mine.categoryId, transfer, ruleId: mine.id };
  // Rules made for this direction (salary, refunds, cash) win over merchant names; home costs
  // come after them.
  const ordered = [
    ...KNOWN.filter((k) => k.dir === dir && !k.late),
    ...KNOWN.filter((k) => !k.dir),
    ...KNOWN.filter((k) => k.dir === dir && k.late),
  ];
  for (const k of ordered) {
    if (k.re.test(upper))
      return { payee: k.payee ?? clean, categoryId: k.categoryId, transfer: false };
  }
  return { payee: clean, transfer };
}

/** A rule for this merchant, so the next statement sorts itself. */
export function ruleKey(raw: string): string {
  const key = merchantKey(raw);
  // Keep the first two words: "UBER EATS AMSTERDAM" and "UBER EATS PENDING" share "UBER EATS".
  return key.split(' ').slice(0, 2).join(' ');
}
