import { ICONS } from '@/lib/icons';

interface Props {
  name: string;
  size?: number;
  stroke?: number;
  class?: string;
  label?: string;
}

export function Icon({ name, size = 20, stroke = 1.8, class: cls, label }: Props) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.dots! }}
    />
  );
}
