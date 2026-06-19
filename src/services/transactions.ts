// Use-case service: record a purchase and split it fairly.
//
// This is the orchestration seam. It does NOT touch Prisma and it does NOT
// re-implement money math. It:
//   1. asks the DOMAIN how to split the money (distributeEqualSplit),
//   2. decides which slices hit MY $800 budget (only my own share),
//   3. asks the DOMAIN to confirm nothing was created or lost (conservation),
//   4. hands the finished shapes to the REPOSITORY to persist atomically.

import {
  distributeEqualSplit,
  validateConservation,
  type Allocation,
  type Transaction,
} from "../domain/index.js";
import {
  createTransactionWithAllocations,
  type NewAllocation,
} from "../repository/ledger.js";

export interface EqualSplitPurchaseInput {
  /** Who fronted the money (drives debt direction). Usually me. */
  payerId: string;
  /** The budget owner — only this person's share counts toward the $800. */
  meId: string;
  /** Total of the purchase, in integer cents, strictly positive. */
  amountCents: number;
  /** Everyone sharing the expense equally (must include at least one person). */
  participantIds: string[];
  paymentAccountId?: string | null;
  merchant?: string;
  expenseDate: Date;
  categoryId?: string | null;
}

/**
 * Parse a user-typed dollar amount ("12", "12.3", "$1,234.50") into integer
 * cents WITHOUT floating point. Rejects anything that isn't a clean positive
 * money value, so bad input fails loudly at the boundary instead of silently
 * corrupting the ledger.
 */
export function dollarsToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export async function recordEqualSplitPurchase(
  input: EqualSplitPurchaseInput,
): Promise<Transaction> {
  if (input.amountCents <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  if (input.participantIds.length === 0) {
    throw new Error("Pick at least one person to share this expense.");
  }

  // 1. DOMAIN decides the cents-exact shares (payer absorbs any rounding).
  const shares = distributeEqualSplit(
    input.amountCents,
    input.participantIds,
    input.payerId,
  );

  // 2. Build the allocations. Only MY slice flips budgetImpact on.
  const allocations: NewAllocation[] = [...shares.entries()].map(
    ([personId, amountCents]) => ({
      personId,
      amountCents,
      budgetImpact: personId === input.meId,
      categoryId: input.categoryId ?? null,
      expenseDate: input.expenseDate,
    }),
  );

  // 3. DOMAIN guard: the slices must account for every cent (no money lost).
  const draftTx: Transaction = {
    id: "draft",
    payerPersonId: input.payerId,
    amountCents: input.amountCents,
    expenseDate: input.expenseDate,
    status: "allocated",
    type: "purchase",
  };
  const draftAllocations: Allocation[] = allocations.map((a, i) => ({
    id: `draft-${i}`,
    transactionId: "draft",
    personId: a.personId,
    amountCents: a.amountCents,
    categoryId: a.categoryId,
    budgetImpact: a.budgetImpact,
    expenseDate: a.expenseDate,
  }));
  const check = validateConservation(draftTx, draftAllocations);
  if (!check.ok) {
    throw new Error(
      `Allocation mismatch: expected ${check.expectedCents}, got ${check.actualCents}.`,
    );
  }

  // 4. REPOSITORY persists the payment event + slices atomically.
  return createTransactionWithAllocations({
    payerPersonId: input.payerId,
    paymentAccountId: input.paymentAccountId ?? null,
    amountCents: input.amountCents,
    merchant: input.merchant ?? null,
    expenseDate: input.expenseDate,
    type: "purchase",
    status: "allocated",
    allocations,
  });
}

export interface CustomSplitShare {
  personId: string;
  amountCents: number;
}

export interface CustomSplitPurchaseInput {
  payerId: string;
  meId: string;
  /** Explicit per-person amounts. Their sum IS the transaction total. */
  shares: CustomSplitShare[];
  paymentAccountId?: string | null;
  merchant?: string;
  expenseDate: Date;
  categoryId?: string | null;
}

/**
 * Record a purchase split by EXPLICIT per-person amounts (not evenly). The total
 * is the sum of the shares, so conservation holds by construction; we still run
 * the domain guard as a belt-and-suspenders check. Only my own share counts
 * toward the budget; the rest become debts.
 */
export async function recordCustomSplitPurchase(
  input: CustomSplitPurchaseInput,
): Promise<Transaction> {
  const shares = input.shares.filter((s) => s.amountCents > 0);
  if (shares.length === 0) {
    throw new Error("Enter at least one person's share.");
  }
  const amountCents = shares.reduce((sum, s) => sum + s.amountCents, 0);

  const allocations: NewAllocation[] = shares.map((s) => ({
    personId: s.personId,
    amountCents: s.amountCents,
    budgetImpact: s.personId === input.meId,
    categoryId: input.categoryId ?? null,
    expenseDate: input.expenseDate,
  }));

  const draftTx: Transaction = {
    id: "draft",
    payerPersonId: input.payerId,
    amountCents,
    expenseDate: input.expenseDate,
    status: "allocated",
    type: "purchase",
  };
  const draftAllocations: Allocation[] = allocations.map((a, i) => ({
    id: `draft-${i}`,
    transactionId: "draft",
    personId: a.personId,
    amountCents: a.amountCents,
    categoryId: a.categoryId,
    budgetImpact: a.budgetImpact,
    expenseDate: a.expenseDate,
  }));
  const check = validateConservation(draftTx, draftAllocations);
  if (!check.ok) {
    throw new Error(
      `Allocation mismatch: expected ${check.expectedCents}, got ${check.actualCents}.`,
    );
  }

  return createTransactionWithAllocations({
    payerPersonId: input.payerId,
    paymentAccountId: input.paymentAccountId ?? null,
    amountCents,
    merchant: input.merchant ?? null,
    expenseDate: input.expenseDate,
    type: "purchase",
    status: "allocated",
    allocations,
  });
}
