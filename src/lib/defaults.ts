import { SCHEMA_VERSION, type Category, type LedgerData } from './model';

/** The starting categories. Ids are stable so import rules can point at them. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'groceries', name: 'Groceries', kind: 'expense', hue: 140, icon: 'basket' },
  { id: 'eating-out', name: 'Eating out', kind: 'expense', hue: 45, icon: 'utensils' },
  { id: 'delivery', name: 'Food delivery', kind: 'expense', hue: 28, icon: 'bike' },
  { id: 'coffee', name: 'Coffee', kind: 'expense', hue: 60, icon: 'coffee' },
  { id: 'transport', name: 'Transport', kind: 'expense', hue: 235, icon: 'car' },
  { id: 'fuel', name: 'Fuel', kind: 'expense', hue: 15, icon: 'fuel' },
  { id: 'bills', name: 'Phone & internet', kind: 'expense', hue: 205, icon: 'wifi' },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense', hue: 290, icon: 'repeat' },
  { id: 'shopping', name: 'Shopping', kind: 'expense', hue: 330, icon: 'bag' },
  { id: 'health', name: 'Health', kind: 'expense', hue: 5, icon: 'heart' },
  { id: 'fun', name: 'Going out', kind: 'expense', hue: 310, icon: 'ticket' },
  { id: 'travel', name: 'Travel', kind: 'expense', hue: 215, icon: 'plane' },
  { id: 'education', name: 'Education', kind: 'expense', hue: 260, icon: 'book' },
  { id: 'gifts', name: 'Gifts & family', kind: 'expense', hue: 350, icon: 'gift' },
  { id: 'cash', name: 'Cash', kind: 'expense', hue: 110, icon: 'banknote' },
  { id: 'fees', name: 'Fees', kind: 'expense', hue: 75, icon: 'receipt' },
  { id: 'other', name: 'Other', kind: 'expense', hue: 85, icon: 'dots' },
  { id: 'salary', name: 'Salary', kind: 'income', hue: 160, icon: 'briefcase' },
  { id: 'freelance', name: 'Freelance', kind: 'income', hue: 175, icon: 'laptop' },
  { id: 'allowance', name: 'Allowance', kind: 'income', hue: 150, icon: 'landmark' },
  { id: 'refunds', name: 'Refunds', kind: 'income', hue: 190, icon: 'undo' },
  { id: 'gifts-in', name: 'Gifts received', kind: 'income', hue: 340, icon: 'gift' },
  { id: 'other-income', name: 'Other income', kind: 'income', hue: 165, icon: 'plus' },
];

export function emptyData(): LedgerData {
  return {
    version: SCHEMA_VERSION,
    settings: { base: 'KWD', cycleDay: 1, name: '', onboarded: false, demo: false },
    accounts: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    txns: [],
    recurring: [],
    budgets: [],
    salary: null,
    target: null,
    rules: [],
    imports: [],
    rates: {},
    dismissed: [],
  };
}
