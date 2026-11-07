import { useEffect, useState } from 'preact/hooks';
import type { ToastInput } from '@/lib/bus';
import { Icon } from '../ui/Icon';

interface Item extends ToastInput {
  id: number;
}

let next = 1;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<ToastInput>).detail;
      const id = next++;
      setItems((list) => [...list.slice(-2), { ...t, id }]);
      const ms = t.ms ?? (t.action ? 7000 : 4000);
      if (Number.isFinite(ms)) window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), ms);
    };
    window.addEventListener('ledger:toast', on);
    return () => window.removeEventListener('ledger:toast', on);
  }, []);
  const close = (id: number) => setItems((list) => list.filter((x) => x.id !== id));
  return (
    <div class="toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div class="toast" key={t.id}>
          {t.tone === 'good' && <Icon name="check" size={18} class="text-good" />}
          {t.tone === 'warn' && <Icon name="alert" size={18} class="text-warn" />}
          <span class="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="btn btn-sm"
              onClick={() => {
                t.action!.run();
                close(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" class="btn btn-sm btn-icon" aria-label="Dismiss" onClick={() => close(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
