import { moneyParts, type FormatOptions } from '@/lib/money/money';
import { useCountUp } from './hooks';

interface Props {
  value: number;
  code: string;
  sign?: FormatOptions['sign'];
  /** Colour income green (and nothing red: spending is normal, not alarming). */
  tone?: 'auto' | 'none' | 'income';
  count?: boolean;
  unit?: boolean;
  class?: string;
}

/** An amount with the decimals drawn lighter than the whole units, and the unit small. */
export function Money({
  value,
  code,
  sign = 'auto',
  tone = 'none',
  count = false,
  unit = true,
  class: cls = '',
}: Props) {
  const counted = useCountUp(value);
  const shown = count ? counted : value;
  const p = moneyParts(shown, code, { sign });
  const colour =
    tone === 'income' || (tone === 'auto' && value > 0 && sign === 'always') ? 'text-good' : '';
  return (
    <span class={`money ${colour} ${cls}`}>
      {p.sign}
      {p.whole}
      {p.fraction && <span class="f">.{p.fraction}</span>}
      {unit && <span class="u">{p.unit}</span>}
    </span>
  );
}
