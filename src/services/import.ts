// Use-case service: parse a bank/credit-card CSV statement into clean rows.
//
// Parsing is PURE (no Prisma, no domain math) so it can be unit-tested with
// plain strings. The repository turns these rows into `needs_review`
// transactions; the review workflow then decides ownership.

export interface ParsedStatementRow {
  expenseDate: Date;
  merchant: string | null;
  amountCents: number;
}

/** Split one CSV line, honoring double-quoted fields and escaped quotes (""). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else if (c === '"') {
      inQuotes = true;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse a money string ("$1,234.50", "-12", "(8.00)") into integer cents. */
function parseAmountCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  // Accounting negatives: "(12.00)" means -12.00.
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  if (m[1] === "-") sign = -sign;
  const whole = Number(m[2]);
  const frac = (m[3] ?? "").padEnd(2, "0");
  return sign * (whole * 100 + Number(frac));
}

/** Parse a date as UTC midnight from common statement formats. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    // Assume MM/DD/YYYY (North American statements).
    return new Date(Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function findColumn(header: string[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] ?? "").toLowerCase();
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

/**
 * Parse statement text into rows. Recognises a header row (columns named like
 * date / description|merchant|payee / amount); otherwise assumes the first three
 * columns are date, description, amount. Rows that don't parse are skipped.
 */
export function parseStatementCsv(text: string): ParsedStatementRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const first = splitCsvLine(lines[0] ?? "");
  const looksLikeHeader =
    findColumn(first, ["date"]) !== -1 && findColumn(first, ["amount", "amt"]) !== -1;

  let dateCol = 0;
  let descCol = 1;
  let amountCol = 2;
  let start = 0;

  if (looksLikeHeader) {
    dateCol = findColumn(first, ["date"]);
    amountCol = findColumn(first, ["amount", "amt"]);
    descCol = findColumn(first, ["description", "merchant", "payee", "name", "memo", "detail"]);
    if (descCol === -1) descCol = dateCol === 1 ? 0 : 1;
    start = 1;
  }

  const rows: ParsedStatementRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i] ?? "");
    const expenseDate = parseDate(cols[dateCol] ?? "");
    const amountCents = parseAmountCents(cols[amountCol] ?? "");
    if (!expenseDate || amountCents === null) continue;
    const merchantRaw = (cols[descCol] ?? "").trim();
    rows.push({
      expenseDate,
      merchant: merchantRaw.length > 0 ? merchantRaw : null,
      amountCents,
    });
  }
  return rows;
}
