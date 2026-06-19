// Use-case service: record a settlement (a debt repayment).
//
// This is the counterpart to recording a purchase. A purchase CREATES debt;
// a settlement CLEARS it. Like the purchase service, this seam touches no
// Prisma and re-implements no money rules. It:
//   1. asks the REPOSITORY for the current balance with this person,
//   2. asks the DOMAIN whether the repayment is valid (validateSettlement),
//   3. enforces the "overpayment needs a note" rule,
//   4. hands the finished settlement to the REPOSITORY to persist.

import {
  computeBalances,
  validateSettlement,
  type SettlementMethod,
} from "../domain/index.js";
import { createSettlement, loadLedger } from "../repository/ledger.js";

export interface RecordSettlementInput {
  /** The budget owner. Every balance is measured from this person's view. */
  meId: string;
  /** The other party in the repayment. */
  personId: string;
  /** Who is paying whom, from my perspective. */
  direction: "they_paid_me" | "i_paid_them";
  /** How much was repaid, in integer cents, strictly positive. */
  amountCents: number;
  method: SettlementMethod;
  settlementDate: Date;
  /** Required when the repayment overshoots the outstanding balance. */
  note?: string;
}

export async function recordSettlement(input: RecordSettlementInput) {
  if (input.amountCents <= 0) {
    throw new Error("Settlement amount must be greater than zero.");
  }
  if (input.personId === input.meId) {
    throw new Error("Pick someone other than yourself to settle up with.");
  }

  // 1. Current net balance with this person (positive = they owe me).
  const { transactions, allocations, settlements } = await loadLedger();
  const balances = computeBalances(transactions, allocations, settlements, input.meId);
  const net = balances.get(input.personId) ?? 0;

  // Translate "direction" into a from -> to settlement and the prior debt that
  // settlement is meant to repay (how much `from` owed `to` beforehand).
  const fromPersonId = input.direction === "they_paid_me" ? input.personId : input.meId;
  const toPersonId = input.direction === "they_paid_me" ? input.meId : input.personId;
  const priorOwedByFromToTo = input.direction === "they_paid_me" ? net : -net;

  // 2 + 3. DOMAIN verdict: positive amount, and a note if it overpays the debt.
  const verdict = validateSettlement(
    { amountCents: input.amountCents, note: input.note ?? null },
    priorOwedByFromToTo,
  );
  if (verdict.kind === "invalid") {
    throw new Error(verdict.reason);
  }
  if (verdict.kind === "requires_note") {
    throw new Error(
      "This repayment is larger than the outstanding balance. Add a note to explain the overpayment.",
    );
  }

  // 4. REPOSITORY persists the settlement; balances fold it in automatically.
  return createSettlement({
    fromPersonId,
    toPersonId,
    amountCents: input.amountCents,
    method: input.method,
    settlementDate: input.settlementDate,
    note: input.note ?? null,
  });
}
