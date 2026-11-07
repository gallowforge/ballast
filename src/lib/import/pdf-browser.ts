/** Loads pdf.js only when a PDF is chosen, with its worker bundled from this site (no CDN). */
import { extractItems } from './pdf-text';
import type { TextItem } from './pdf-layout';

export async function readPdf(bytes: Uint8Array, password?: string): Promise<{ items: TextItem[]; pages: number }> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js takes ownership of the buffer it is given, so pass a copy and keep ours for a retry.
  return extractItems(pdfjs as unknown as Parameters<typeof extractItems>[0], bytes.slice(), password);
}
