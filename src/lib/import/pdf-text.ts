import type { TextItem } from './pdf-layout';

export class PdfPasswordError extends Error {
  constructor(public reason: 'need' | 'wrong') {
    super(
      reason === 'need'
        ? 'This statement is password-protected.'
        : 'That password did not open it.',
    );
    this.name = 'PdfPasswordError';
  }
}

export class PdfNoTextError extends Error {
  constructor() {
    super(
      'This PDF is a picture of a page, so there is no text in it to read. A CSV export from your bank will work.',
    );
    this.name = 'PdfNoTextError';
  }
}

/** The parts of pdf.js this module uses, so the browser and Node builds can both be passed in. */
interface PdfLib {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfPage {
  getViewport(o: { scale: number }): { height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
}

/**
 * Reads every text run from a PDF on the device. Nothing is uploaded: pdf.js runs in a worker in
 * this tab. A password, when needed, is used once and never kept.
 */
export async function extractItems(
  lib: PdfLib,
  data: Uint8Array,
  password?: string,
): Promise<{ items: TextItem[]; pages: number }> {
  const task = lib.getDocument({
    data,
    password,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    enableXfa: false,
  });
  let doc: PdfDoc;
  try {
    doc = await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === 'PasswordException')
      throw new PdfPasswordError(e.code === 2 ? 'wrong' : 'need');
    throw err;
  }
  const items: TextItem[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const raw of content.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (typeof it.str !== 'string' || !it.transform) continue;
        const [a = 1, b = 0, , d = 1, e = 0, f = 0] = it.transform;
        const h = it.height || Math.hypot(a, b) || Math.abs(d) || 8;
        items.push({ str: it.str, x: e, y: height - f - h, w: it.width ?? 0, h, page: p });
      }
    }
  } finally {
    await task.destroy();
  }
  if (!items.some((i) => i.str.trim())) throw new PdfNoTextError();
  return { items, pages: doc.numPages };
}
