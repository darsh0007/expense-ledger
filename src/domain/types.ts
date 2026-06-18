// Domain value objects — the *plain* shapes the pure functions operate on.
//
// These are intentionally DECOUPLED from Prisma. The database layer will map
// Prisma rows -> these objects later. Keeping the domain free of Prisma means:
//   - the money math can be unit-tested with no database and no generated code,
//   - the rules don't silently change if a column is renamed,
//   - "what the business means" lives in one place.
//
// All money is INTEGER CENTS. Never floats. $12.00 === 1200.

export type Cents = number;

// String-literal unions that MIRROR the Prisma enums (schema.prisma). The DB
// mapper will pass these strings straight through, so they must stay in sync.
export type TransactionStatus =
  | "imported"
  | "needs_review"
  | "partially_allocated"
  | "allocated"
  | "ignored"
  | "refunded"
  | "duplicate"
  | "reconciled";

export type TransactionType = "purchase" | "refund" | "transfer" | "manual";

export type SettlementMethod = "cash" | "e_transfer" | "card" | "offset" | "splitwise";

/** A stable identity. `isMe` marks the budget owner (Darshan). */
export interface Person {
  id: string;
  isMe: boolean;
}

/** A payment event: who PAID, how much, when. */
export interface Transaction {
  id: string;
  payerPersonId: string;
  paymentAccountId?: string | null;
  amountCents: Cents;
  expenseDate: Date;
  status: TransactionStatus;
  type: TransactionType;
  refundOfTransactionId?: string | null;
}

/**
 * Ownership of a slice of consumption: who CONSUMED `amountCents` of a
 * transaction. `expenseDate` is denormalized from the transaction at creation
 * (overridable) so `computeBudget` is a single-table scan.
 */
export interface Allocation {
  id: string;
  transactionId: string;
  personId: string;
  amountCents: Cents;
  categoryId?: string | null;
  budgetImpact: boolean;
  expenseDate: Date;
}

/** A debt-clearing event: money moving from one person to another. */
export interface Settlement {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  amountCents: Cents;
  settlementDate: Date;
  method: SettlementMethod;
  note?: string | null;
}

/** A budget window with a spending limit (e.g. one month, $800). */
export interface BudgetPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  limitCents: Cents;
}

/** Result of `computeBudget`: spent vs limit, with remaining (may be negative). */
export interface BudgetResult {
  spentCents: Cents;
  limitCents: Cents;
  remainingCents: Cents;
}
