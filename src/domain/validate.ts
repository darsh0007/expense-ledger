// Invariants — the rules that keep the ledger honest.
//
// These don't *compute* anything for the dashboard; they GUARD the data so the
// projections can be trusted. They are pure: given an object and its context,
// they return a verdict, never throw for business-rule violations.

import type { Allocation, Settlement, Transaction } from "./types.js";

// --- Conservation -----------------------------------------------------------
// A fully `allocated` transaction must have its allocations sum EXACTLY to its
// amount (no money created or lost). `partially_allocated` is the legal
// in-between: strictly less is allocated than the total. Other statuses carry
// no conservation requirement here.

export type ConservationResult =
  | { ok: true }
  | { ok: false; reason: string; expectedCents: number; actualCents: number };

export function validateConservation(
  transaction: Transaction,
  allocations: readonly Allocation[],
): ConservationResult {
  const actualCents = allocations
    .filter((a) => a.transactionId === transaction.id)
    .reduce((sum, a) => sum + a.amountCents, 0);
  const expectedCents = transaction.amountCents;

  if (transaction.status === "allocated") {
    return actualCents === expectedCents
      ? { ok: true }
      : { ok: false, reason: "allocated transaction must be fully allocated", expectedCents, actualCents };
  }

  if (transaction.status === "partially_allocated") {
    return actualCents < expectedCents
      ? { ok: true }
      : {
          ok: false,
          reason: "partially_allocated transaction must be strictly under-allocated",
          expectedCents,
          actualCents,
        };
  }

  return { ok: true };
}

// --- Settlement validity ----------------------------------------------------
// A settlement amount is always positive — direction is carried by from/to,
// never a negative number. If a repayment OVERSHOOTS the existing debt (drives
// the pair balance past zero, i.e. an overpayment), it must carry a note so the
// surplus is explained; otherwise it's flagged for a note.
//
// `priorOwedByFromToTo` = how much `fromPersonId` owed `toPersonId` BEFORE this
// settlement (positive = a real debt being repaid). The caller derives this
// from `computeBalances` for the specific pair.

export type SettlementValidation =
  | { kind: "ok" }
  | { kind: "requires_note" }
  | { kind: "invalid"; reason: string };

export function validateSettlement(
  settlement: Pick<Settlement, "amountCents" | "note">,
  priorOwedByFromToTo: number,
): SettlementValidation {
  if (settlement.amountCents <= 0) {
    return { kind: "invalid", reason: "settlement amount must be positive" };
  }

  const after = priorOwedByFromToTo - settlement.amountCents;
  const flipsPastZero = priorOwedByFromToTo > 0 && after < 0;
  const hasNote = (settlement.note ?? "").trim().length > 0;

  if (flipsPastZero && !hasNote) return { kind: "requires_note" };
  return { kind: "ok" };
}
