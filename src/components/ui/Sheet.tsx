import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  wide?: boolean;
  children: ComponentChildren;
  footer?: ComponentChildren;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A modal sheet: bottom sheet on phones, centred dialog on wider screens. Traps focus, closes on
 *  Escape or a tap outside, and gives focus back to whatever opened it. */
export function Sheet({ open, onClose, title, description, wide, children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const first =
      el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (n) => n.offsetParent !== null,
        );
        if (!items.length) return;
        const firstItem = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div class="backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        class={`sheet ${wide ? 'sheet-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <div class="sheet-handle" />
        <div class="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-6">
          <div>
            <h2 id={titleId} class="serif text-[1.55rem] leading-tight font-[480]">
              {title}
            </h2>
            {description && (
              <p id={descId} class="text-muted mt-1 text-sm">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-icon -mr-2"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>
        <div class="px-5 pt-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
        {footer && (
          <div class="border-line bg-raised/95 sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3 backdrop-blur sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
