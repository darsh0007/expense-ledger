// Projection #3 — the "blind spot" metric.
//
// "Of the money I paid this period, how much have I NOT yet decided the
// ownership of?" That unreviewed slice is real money I might be on the hook for
// (or owed) but haven't categorised. It is the gap between what a transaction
// cost and what its allocations so far account for, over my still-open
// transactions (`needs_review` or `partially_allocated`) dated in the period.

import { inPeriod } from "./period.js";
import type { Allocation, BudgetPeriod, Transaction } from "./types.js";

const OPEN_STATUSES = new Set(["needs_review", "partially_allocated"]);

export function computeUnreviewedExposure(
  transactions: readonly Transaction[],
  allocations: readonly Allocation[],
  meId: string,
  period: BudgetPeriod,
): number {
  const allocatedByTx = new Map<string, number>();
  for (const a of allocations) {
    allocatedByTx.set(a.transactionId, (allocatedByTx.get(a.transactionId) ?? 0) + a.amountCents);
  }

  let exposure = 0;
  for (const tx of transactions) {
    if (tx.payerPersonId !== meId) continue;
    if (!OPEN_STATUSES.has(tx.status)) continue;
    if (!inPeriod(tx.expenseDate, period)) continue;

    const allocated = allocatedByTx.get(tx.id) ?? 0;
    exposure += tx.amountCents - allocated;
  }

  return exposure;
}
