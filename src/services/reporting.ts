// Reporting service — the use case that ties the repository to the domain.
//
// This is the "application layer": it ORCHESTRATES (load data, then run the
// pure functions) but contains no money rules of its own. All the arithmetic
// lives in the proven domain core; all the I/O lives in the repository. This
// thin seam is exactly what a future API route or UI loader will call.

import {
  computeBalances,
  computeBudget,
  computeUnreviewedExposure,
  type BudgetResult,
} from "../domain/index.js";
import { getBudgetPeriod, getMe, loadLedger } from "../repository/ledger.js";

export interface PeriodSummary {
  periodId: string;
  budget: BudgetResult;
  /** personId -> net cents; positive means that person owes me. */
  balances: Map<string, number>;
  unreviewedExposureCents: number;
}

/** Compute the full dashboard summary for one budget period, from live data. */
export async function computePeriodSummary(periodId: string): Promise<PeriodSummary> {
  const me = await getMe();
  const period = await getBudgetPeriod(periodId);
  const { transactions, allocations, settlements } = await loadLedger();

  return {
    periodId,
    budget: computeBudget(allocations, me.id, period),
    balances: computeBalances(transactions, allocations, settlements, me.id),
    unreviewedExposureCents: computeUnreviewedExposure(transactions, allocations, me.id, period),
  };
}
