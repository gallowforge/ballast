import { useEffect } from 'preact/hooks';
import { openTxn, toast } from '@/lib/bus';
import { catchUp } from '@/lib/store/ops';
import { apply, getState, isReady } from '@/lib/store/store';
import { url } from '@/lib/site';
import { useKey, useLedger, useToday } from '../ui/hooks';
import { Palette } from './Palette';
import { Toaster } from './Toaster';
import { TxnSheet } from './TxnSheet';

/** Lives across page changes: the shared sheets, toasts, shortcuts and the update prompt. */
export default function Shell() {
  const { data } = useLedger();
  const today = useToday();

  // A new day while the app stays open: post whatever fell due.
  useEffect(() => {
    if (!isReady()) return;
    const r = catchUp(getState(), today);
    if (r.posted) apply(() => r.data);
  }, [today, data.settings.onboarded]);

  useKey('n', (e) => {
    e.preventDefault();
    openTxn();
  });

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    // Reload only when the person asked for the new version. The very first install also fires
    // controllerchange, and reloading then would interrupt whatever they are doing.
    let wanted = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!wanted) return;
      wanted = false;
      location.reload();
    });
    navigator.serviceWorker
      .register(url('sw.js'), { scope: url() })
      .then((reg) => {
        const offer = (w: ServiceWorker) =>
          toast({
            message: 'A new version of Ledger is ready.',
            action: {
              label: 'Reload',
              run: () => ((wanted = true), (reg.waiting ?? w).postMessage({ type: 'skip-waiting' })),
            },
            ms: Infinity,
          });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <TxnSheet data={data} today={today} />
      <Palette data={data} />
      <Toaster />
    </>
  );
}
