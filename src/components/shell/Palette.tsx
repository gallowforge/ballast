import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { navigate } from 'astro:transitions/client';
import { openTxn } from '@/lib/bus';
import { formatShort } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import type { LedgerData } from '@/lib/model';
import { NAV, NAV_MORE, url } from '@/lib/site';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { setTheme } from './theme';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function Palette({ data }: { data: LedgerData }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setQ('');
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('ballast:palette', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ballast:palette', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const base = data.settings.base;
  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => navigate(url(href));
    const all: Cmd[] = [
      { id: 'add', label: 'Add a transaction', hint: 'N', icon: 'plus', run: () => openTxn() },
      ...[...NAV, ...NAV_MORE].map((n) => ({
        id: n.href,
        label: `Go to ${n.label}`,
        icon: n.icon,
        run: go(n.href),
      })),
      { id: 'import', label: 'Import a bank statement', icon: 'upload', run: go('import/') },
      { id: 'backup', label: 'Export a backup', icon: 'download', run: go('settings/#data') },
      { id: 'light', label: 'Use the light theme', icon: 'sun', run: () => setTheme('light') },
      { id: 'dark', label: 'Use the dark theme', icon: 'moon', run: () => setTheme('dark') },
      {
        id: 'system',
        label: 'Match the system theme',
        icon: 'monitor',
        run: () => setTheme('system'),
      },
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    const hits = all.filter((c) => c.label.toLowerCase().includes(needle));
    const txns = data.txns
      .filter(
        (t) =>
          t.payee.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8)
      .map<Cmd>((t) => ({
        id: t.id,
        label: t.payee || 'Untitled',
        hint: `${formatShort(t.date)} · ${formatMoney(t.base, base)}`,
        icon:
          t.kind === 'income'
            ? 'arrow-down-left'
            : t.kind === 'transfer'
              ? 'swap'
              : 'arrow-up-right',
        run: () => openTxn({ id: t.id }),
      }));
    return [...hits, ...txns];
  }, [q, data.txns, base]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    setTimeout(c.run, 60);
  };

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Quick launcher">
      <div class="grid gap-3">
        <div class="relative">
          <Icon
            name="search"
            size={18}
            class="text-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <input
            data-autofocus
            class="input pl-10"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={cmds[active] ? `cmd-${cmds[active]!.id}` : undefined}
            aria-label="Search pages, actions and transactions"
            placeholder="Search pages, actions and transactions"
            value={q}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(cmds.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(cmds[active]);
              }
            }}
          />
        </div>
        <ul
          id="palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          class="-mx-2 max-h-[50vh] overflow-y-auto"
        >
          {cmds.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              class={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 ${i === active ? 'bg-sunken' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span class="tile tile-sm">
                <Icon name={c.icon} size={16} />
              </span>
              <span class="flex-1 font-semibold">{c.label}</span>
              {c.hint && <span class="text-subtle text-sm">{c.hint}</span>}
            </li>
          ))}
          {!cmds.length && (
            <li class="text-muted px-3 py-6 text-center text-sm">Nothing matches “{q}”.</li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
