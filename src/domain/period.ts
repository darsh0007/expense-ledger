// Period membership — does a calendar date fall inside a budget window?
//
// Budget periods are stored as DATEs (no time, no zone). We compare on the
// calendar date only, so a transaction at any time on the end day still counts.
// We read the UTC fields because Prisma/pg hand back DATE columns as Dates
// pinned to UTC midnight; using UTC consistently avoids off-by-one-day shifts.

import type { BudgetPeriod } from "./types.js";

/** Collapse a Date to a comparable yyyymmdd-style key in UTC. */
function utcDateKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** True if `date` is within `[period.start, period.end]`, inclusive (date-only). */
export function inPeriod(date: Date, period: Pick<BudgetPeriod, "startDate" | "endDate">): boolean {
  const k = utcDateKey(date);
  return k >= utcDateKey(period.startDate) && k <= utcDateKey(period.endDate);
}
