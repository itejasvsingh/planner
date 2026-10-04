import * as XLSX from 'xlsx';
import { getDocumentProxy } from 'unpdf';
import { itemsToRows, linesToRows, tableToRows, type PdfItem, type StatementRow } from './statementParse';

export type ReadResult =
  | { status: 'ok'; rows: StatementRow[]; text?: string }
  | { status: 'password'; incorrect: boolean }
  | { status: 'unreadable'; message: string; text?: string };

/** Positioned text of a PDF, plus lines rebuilt from it (same baseline = same line). */
async function pdfText(data: Uint8Array, password?: string): Promise<{ items: PdfItem[]; lines: string[] }> {
  const pdf = await getDocumentProxy(data, password ? { password } : {});
  const lines: string[] = [];
  const all: PdfItem[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    type Item = PdfItem;
    const items: Item[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, page: p });
    }
    all.push(...items);
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let row: Item[] = [];
    const flush = () => {
      if (!row.length) return;
      row.sort((a, b) => a.x - b.x);
      let s = '';
      let end = -Infinity;
      for (const it of row) {
        s += s && it.x - end > 1 ? ' ' : '';
        s += it.str;
        end = it.x + it.w;
      }
      lines.push(s);
      row = [];
    };
    for (const it of items) {
      if (row.length && Math.abs(row[0].y - it.y) > 3) flush();
      row.push(it);
    }
    flush();
  }
  return { items: all, lines };
}

/** "Opening balance", "Closing balance", "B/F" lines state a balance; they aren't transactions. */
function withoutBalanceLines(rows: StatementRow[]) {
  return rows.filter((r) => !/^\s*(?:opening|closing)\s+bal(?:ance)?\b|\bbalance\s+(?:brought|carried)\s+forward\b|^\s*(?:b\/f|c\/f)\b/i.test(r.description));
}

/** Reads a statement file (PDF, XLSX, XLS, CSV or the HTML-as-.xls some banks send) into transactions. */
export async function readStatement(buf: Buffer, password?: string): Promise<ReadResult> {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    let lines: string[];
    let items: PdfItem[];
    try {
      ({ items, lines } = await pdfText(new Uint8Array(buf), password));
    } catch (e) {
      const err = e as { name?: string; code?: number };
      if (err?.name === 'PasswordException') return { status: 'password', incorrect: err.code === 2 };
      return { status: 'unreadable', message: 'This PDF could not be opened.' };
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 40) {
      return { status: 'unreadable', message: 'This PDF looks like a scanned image. Download the statement as Excel or CSV from your bank instead.' };
    }
    // Table reading handles cells that wrap; plain lines suit simple layouts. Keep whichever finds more.
    const fromTable = itemsToRows(items);
    const fromLines = linesToRows(lines);
    const rows = withoutBalanceLines(fromTable.length >= fromLines.length ? fromTable : fromLines);
    return rows.length ? { status: 'ok', rows, text } : { status: 'unreadable', message: 'No transactions found in this PDF.', text };
  }

  let wb: XLSX.WorkBook;
  try {
    // raw: CSV text stays text, so day-first dates aren't misread as US month-first.
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true, dense: true, raw: true });
  } catch {
    return { status: 'unreadable', message: 'Use a PDF, Excel (.xls/.xlsx) or CSV statement.' };
  }
  let best: StatementRow[] = [];
  for (const name of wb.SheetNames) {
    const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const rows = tableToRows(table);
    if (rows.length > best.length) best = rows;
  }
  best = withoutBalanceLines(best);
  return best.length ? { status: 'ok', rows: best } : { status: 'unreadable', message: 'No transactions found. Check that the file has Date, Description and amount columns.' };
}
