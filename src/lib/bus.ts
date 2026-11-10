/** Tiny app-wide events, so any island can open the shared sheets in the persistent shell. */
import type { ISODate, TxnKind } from './model';

export interface TxnPrefill {
  kind?: TxnKind;
  amount?: number;
  payee?: string;
  categoryId?: string;
  accountId?: string;
  date?: ISODate;
}

export function openTxn(detail: { id?: string; prefill?: TxnPrefill } = {}): void {
  window.dispatchEvent(new CustomEvent('ballast:txn', { detail }));
}

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent('ballast:palette'));
}

export type ToastTone = 'default' | 'good' | 'warn';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; run: () => void };
  ms?: number;
}

export function toast(input: ToastInput | string): void {
  const detail = typeof input === 'string' ? { message: input } : input;
  window.dispatchEvent(new CustomEvent('ballast:toast', { detail }));
}
