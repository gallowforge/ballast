export const SITE = {
  name: 'Ballast',
  tagline: 'Pay yourself a salary that lasts.',
  description:
    'Ballast is a private money app that works offline. Pay yourself a monthly salary from your savings, see how long they last, set budgets, and import bank statements on your device. No account, no tracking.',
  repo: 'https://github.com/gallowforge/ballast',
  version: '1.2.0',
};

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');

/** A path inside the app, respecting the deploy sub-path ("home/" → "/ballast/home/"). */
export function url(path = ''): string {
  return BASE + path.replace(/^\//, '');
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  section: string;
}

export const NAV: NavItem[] = [
  { href: 'home/', label: 'Home', icon: 'home', section: 'home' },
  { href: 'activity/', label: 'Activity', icon: 'activity', section: 'activity' },
  { href: 'plan/', label: 'Plan', icon: 'plan', section: 'plan' },
  { href: 'runway/', label: 'Runway', icon: 'runway', section: 'runway' },
  { href: 'insights/', label: 'Insights', icon: 'insights', section: 'insights' },
];

export const NAV_MORE: NavItem[] = [
  { href: 'import/', label: 'Import', icon: 'import', section: 'import' },
  { href: 'settings/', label: 'Settings', icon: 'settings', section: 'settings' },
];
