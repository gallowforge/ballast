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
  const { data, ready } = useLedger();
  const today = useToday();

  // The add buttons appear once there is an account to add to. Before setup, Welcome's own steps
  // are the only calls to action. Page changes replace <html>'s attributes, so it is set again.
  const books = ready && data.accounts.length > 0;
  useEffect(() => {
    const mark = () => document.documentElement.toggleAttribute('data-books', books);
    mark();
    document.addEventListener('astro:after-swap', mark);
    return () => document.removeEventListener('astro:after-swap', mark);
  }, [books]);

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
            message: 'A new version of Ballast is ready.',
            action: {
              label: 'Reload',
              run: () => (
                (wanted = true),
                (reg.waiting ?? w).postMessage({ type: 'skip-waiting' })
              ),
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
