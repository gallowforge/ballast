import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { currency } from '@/lib/money/currency';
import { formatMinor, parseMinor } from '@/lib/money/money';
import type { Category } from '@/lib/model';
import { Icon } from './Icon';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  class: cls = '',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  class?: string;
}) {
  return (
    <div class={`seg ${cls}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const i = options.findIndex((x) => x.value === value);
            const next =
              options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
            onChange(next.value);
            (
              (e.currentTarget as HTMLElement).parentElement?.querySelector(
                `[aria-checked="true"]`,
              ) as HTMLElement | null
            )?.focus();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div class="flex items-center justify-between gap-4">
      <div>
        <div id={id} class="font-semibold">
          {label}
        </div>
        {hint && <div class="hint mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        class="switch"
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
  id: string;
}) {
  return (
    <div class="field">
      <label class="label" for={id}>
        {label}
      </label>
      {children}
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

/** An amount box that accepts what people type and reports minor units (or null). */
export function AmountInput({
  id,
  value,
  onInput,
  code,
  big,
  placeholder,
  invalid,
  label,
}: {
  id: string;
  value: string;
  onInput: (text: string) => void;
  code: string;
  big?: boolean;
  placeholder?: string;
  invalid?: boolean;
  label?: string;
}) {
  const c = currency(code);
  return (
    <div class="relative">
      <input
        id={id}
        class={`input pr-16 ${big ? 'input-amount' : ''}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? formatMinor(0, c.exp, { group: false })}
        value={value}
        aria-invalid={invalid || undefined}
        aria-label={label}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      />
      <span class="text-subtle pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold">
        {c.label}
      </span>
    </div>
  );
}

export function toInput(minor: number | undefined, code: string): string {
  if (!minor) return '';
  return formatMinor(minor, currency(code).exp, { group: false, sign: 'never' });
}

export function fromInput(text: string, code: string): number | null {
  const v = parseMinor(text, currency(code).exp);
  return v !== null && v > 0 ? v : null;
}

export function CategoryTile({
  category,
  size = 'md',
}: {
  category?: Category | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const hue = category?.hue ?? 80;
  const icon = category?.icon ?? 'tag';
  const px = size === 'sm' ? 16 : size === 'lg' ? 24 : 19;
  return (
    <span
      class={`tile ${size === 'sm' ? 'tile-sm' : size === 'lg' ? 'tile-lg' : ''}`}
      style={{ '--tile': category ? `oklch(68% 0.13 ${hue})` : 'var(--subtle)' }}
      aria-hidden="true"
    >
      <Icon name={icon} size={px} />
    </span>
  );
}

/** A grid of categories to pick from, with keyboard support from native radio buttons. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  name,
}: {
  categories: Category[];
  value?: string;
  onChange: (id: string) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend class="label mb-2">Category</legend>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {categories.map((c) => (
          <label
            key={c.id}
            class={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-center text-xs font-semibold transition ${
              value === c.id
                ? 'border-gold bg-gold-soft text-fg'
                : 'border-line text-muted hover:border-line-strong hover:text-fg'
            }`}
          >
            <input
              type="radio"
              class="sr-only"
              name={name}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
            />
            <CategoryTile category={c} size="sm" />
            <span class="line-clamp-2 leading-tight">{c.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Empty({
  icon,
  title,
  body,
  children,
  level = 3,
}: {
  icon: string;
  title: string;
  body: string;
  children?: ComponentChildren;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div class="grid justify-items-center gap-3 px-4 py-10 text-center">
      <span class="tile tile-lg">
        <Icon name={icon} size={24} />
      </span>
      <H class="text-base font-bold">{title}</H>
      <p class="text-muted max-w-sm text-sm">{body}</p>
      {children && <div class="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ class: cls = '' }: { class?: string }) {
  return <div class={`skeleton ${cls}`} />;
}
