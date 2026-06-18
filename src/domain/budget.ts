// Projection #1 — the $800 question.
//
// "How much have I PERSONALLY consumed this period?"
//
// Only allocations that are (a) mine, (b) flagged budget_impact, and (c) dated
// inside the period count. Everyone else's shares, transfers, and out-of-period
// items are excluded by construction. Negative allocations (refunds, S6) sum in
// naturally, so a refund cancels its original spend with no special case.

import { inPeriod } from "./period.js";
import type { Allocation, BudgetPeriod, BudgetResult } from "./types.js";

export function computeBudget(
  allocations: readonly Allocation[],
  meId: string,
  period: BudgetPeriod,
): BudgetResult {
  const spentCents = allocations.reduce((sum, a) => {
    const counts = a.personId === meId && a.budgetImpact && inPeriod(a.expenseDate, period);
    return counts ? sum + a.amountCents : sum;
  }, 0);

  return {
    spentCents,
    limitCents: period.limitCents,
    remainingCents: period.limitCents - spentCents,
  };
}
