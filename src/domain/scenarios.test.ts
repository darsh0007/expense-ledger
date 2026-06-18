// Phase 0 acceptance suite — the cent-precise oracle (S1–S11).
//
// Each scenario is a self-contained world: its own transactions, allocations,
// and settlements. If these pass, the money math is PROVEN and frozen. We test
// the projections (budget / balances / exposure), the rounding helper, and the
// two invariants (conservation / settlement validity).

import { describe, expect, it } from "vitest";
import {
  computeBalances,
  computeBudget,
  computeUnreviewedExposure,
  distributeEqualSplit,
  validateConservation,
  validateSettlement,
  type Allocation,
  type BudgetPeriod,
  type SettlementMethod,
  type Settlement,
  type Transaction,
  type TransactionStatus,
  type TransactionType,
} from "./index.js";

// --- Fixtures ---------------------------------------------------------------
const ME = "me";
const LOGAN = "logan";
const RAHUL = "rahul";
const ANKIT = "ankit";

const CARD = "card";

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

const P_JAN: BudgetPeriod = { id: "P_JAN", startDate: d(2026, 1, 1), endDate: d(2026, 1, 31), limitCents: 80_000 };
const P_FEB: BudgetPeriod = { id: "P_FEB", startDate: d(2026, 2, 1), endDate: d(2026, 2, 28), limitCents: 80_000 };

// --- Tiny builders (sensible defaults; override only what matters) ----------
function makeTx(o: {
  id: string;
  payer: string;
  amountCents: number;
  date?: Date;
  status?: TransactionStatus;
  type?: TransactionType;
  account?: string | null;
  refundOf?: string | null;
}): Transaction {
  return {
    id: o.id,
    payerPersonId: o.payer,
    paymentAccountId: o.account === undefined ? CARD : o.account,
    amountCents: o.amountCents,
    expenseDate: o.date ?? d(2026, 2, 5),
    status: o.status ?? "allocated",
    type: o.type ?? "purchase",
    refundOfTransactionId: o.refundOf ?? null,
  };
}

function makeAlloc(o: {
  id: string;
  tx: string;
  person: string;
  amountCents: number;
  impact: boolean;
  date?: Date;
}): Allocation {
  return {
    id: o.id,
    transactionId: o.tx,
    personId: o.person,
    amountCents: o.amountCents,
    categoryId: null,
    budgetImpact: o.impact,
    expenseDate: o.date ?? d(2026, 2, 5),
  };
}

function makeSettlement(o: {
  id: string;
  from: string;
  to: string;
  amountCents: number;
  note?: string;
  date?: Date;
  method?: SettlementMethod;
}): Settlement {
  return {
    id: o.id,
    fromPersonId: o.from,
    toPersonId: o.to,
    amountCents: o.amountCents,
    settlementDate: o.date ?? d(2026, 2, 10),
    method: o.method ?? "cash",
    note: o.note ?? null,
  };
}

const balObj = (m: Map<string, number>): Record<string, number> => Object.fromEntries([...m.entries()]);

// ---------------------------------------------------------------------------
describe("S1 — pure personal expense", () => {
  const t1 = makeTx({ id: "T1", payer: ME, amountCents: 1200, date: d(2026, 2, 5) });
  const a1 = makeAlloc({ id: "A1", tx: "T1", person: ME, amountCents: 1200, impact: true });

  it("budget counts my personal $12", () => {
    expect(computeBudget([a1], ME, P_FEB).spentCents).toBe(1200);
  });
  it("no balances", () => {
    expect(balObj(computeBalances([t1], [a1], [], ME))).toEqual({});
  });
  it("conservation holds (1200 == 1200)", () => {
    expect(validateConservation(t1, [a1])).toEqual({ ok: true });
  });
});

describe("S2 — shared groceries, I paid", () => {
  const t2 = makeTx({ id: "T2", payer: ME, amountCents: 12_000 });
  const allocs = [
    makeAlloc({ id: "A2a", tx: "T2", person: ME, amountCents: 4500, impact: true }),
    makeAlloc({ id: "A2b", tx: "T2", person: LOGAN, amountCents: 4000, impact: false }),
    makeAlloc({ id: "A2c", tx: "T2", person: RAHUL, amountCents: 3500, impact: false }),
  ];

  it("only my $45 share hits the budget", () => {
    expect(computeBudget(allocs, ME, P_FEB).spentCents).toBe(4500);
  });
  it("Logan owes +4000, Rahul owes +3500", () => {
    expect(balObj(computeBalances([t2], allocs, [], ME))).toEqual({ [LOGAN]: 4000, [RAHUL]: 3500 });
  });
  it("conservation holds (12000)", () => {
    expect(validateConservation(t2, allocs)).toEqual({ ok: true });
  });
});

describe("S3 — someone else paid for me", () => {
  const t3 = makeTx({ id: "T3", payer: RAHUL, amountCents: 3200, account: null, date: d(2026, 2, 7) });
  const allocs = [
    makeAlloc({ id: "A3a", tx: "T3", person: ME, amountCents: 1600, impact: true, date: d(2026, 2, 7) }),
    makeAlloc({ id: "A3b", tx: "T3", person: RAHUL, amountCents: 1600, impact: false, date: d(2026, 2, 7) }),
  ];

  it("my $16 share still counts toward my budget", () => {
    expect(computeBudget(allocs, ME, P_FEB).spentCents).toBe(1600);
  });
  it("I owe Rahul −1600", () => {
    expect(balObj(computeBalances([t3], allocs, [], ME))).toEqual({ [RAHUL]: -1600 });
  });
});

describe("S4 — partial settlement", () => {
  const t4 = makeTx({ id: "T4", payer: ME, amountCents: 4000, date: d(2026, 2, 8) });
  const a4 = makeAlloc({ id: "A4", tx: "T4", person: LOGAN, amountCents: 4000, impact: false, date: d(2026, 2, 8) });
  const s4 = makeSettlement({ id: "S4", from: LOGAN, to: ME, amountCents: 2500 });

  it("nothing personal, so budget is 0", () => {
    expect(computeBudget([a4], ME, P_FEB).spentCents).toBe(0);
  });
  it("Logan still owes +1500 after paying back $25", () => {
    expect(balObj(computeBalances([t4], [a4], [s4], ME))).toEqual({ [LOGAN]: 1500 });
  });
  it("settlement within debt needs no note", () => {
    // Prior: Logan owed me 4000. This $25 repayment does not overshoot.
    expect(validateSettlement(s4, 4000)).toEqual({ kind: "ok" });
  });
});

describe("S5 — offset / net balance", () => {
  const t5a = makeTx({ id: "T5a", payer: ME, amountCents: 3000, date: d(2026, 2, 11) });
  const a5a = makeAlloc({ id: "A5a", tx: "T5a", person: ANKIT, amountCents: 3000, impact: false, date: d(2026, 2, 11) });
  const t5b = makeTx({ id: "T5b", payer: ANKIT, amountCents: 2000, account: null, date: d(2026, 2, 12) });
  const a5b = makeAlloc({ id: "A5b", tx: "T5b", person: ME, amountCents: 2000, impact: true, date: d(2026, 2, 12) });
  const txs = [t5a, t5b];
  const allocs = [a5a, a5b];

  it("Ankit paid for my $20 share → budget 2000", () => {
    expect(computeBudget(allocs, ME, P_FEB).spentCents).toBe(2000);
  });
  it("nets to Ankit owes me +1000", () => {
    expect(balObj(computeBalances(txs, allocs, [], ME))).toEqual({ [ANKIT]: 1000 });
  });
});

describe("S6 — refund (linked negative transaction)", () => {
  const t6 = makeTx({ id: "T6", payer: ME, amountCents: 5000, date: d(2026, 2, 14) });
  const a6 = makeAlloc({ id: "A6", tx: "T6", person: ME, amountCents: 5000, impact: true, date: d(2026, 2, 14) });
  const t6r = makeTx({ id: "T6r", payer: ME, amountCents: -5000, date: d(2026, 2, 20), status: "refunded", type: "refund", refundOf: "T6" });
  const a6r = makeAlloc({ id: "A6r", tx: "T6r", person: ME, amountCents: -5000, impact: true, date: d(2026, 2, 20) });

  it("full refund nets the budget back to 0", () => {
    expect(computeBudget([a6, a6r], ME, P_FEB).spentCents).toBe(0);
  });
  it("partial refund (−2000) leaves 3000", () => {
    const a6rPartial = makeAlloc({ id: "A6r2", tx: "T6r", person: ME, amountCents: -2000, impact: true, date: d(2026, 2, 20) });
    expect(computeBudget([a6, a6rPartial], ME, P_FEB).spentCents).toBe(3000);
  });
  it("no balances", () => {
    expect(balObj(computeBalances([t6, t6r], [a6, a6r], [], ME))).toEqual({});
  });
});

describe("S7 — rounding (payer absorbs the remainder cent)", () => {
  it("distributeEqualSplit: $10 / 3, payer ME gets the extra cent", () => {
    const shares = distributeEqualSplit(1000, [ME, LOGAN, RAHUL], ME);
    expect(balObj(shares)).toEqual({ [ME]: 334, [LOGAN]: 333, [RAHUL]: 333 });
    const total = [...shares.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(1000); // no cents created or lost
  });

  const t7 = makeTx({ id: "T7", payer: ME, amountCents: 1000, date: d(2026, 2, 15) });
  const allocs = [
    makeAlloc({ id: "A7a", tx: "T7", person: ME, amountCents: 334, impact: true, date: d(2026, 2, 15) }),
    makeAlloc({ id: "A7b", tx: "T7", person: LOGAN, amountCents: 333, impact: false, date: d(2026, 2, 15) }),
    makeAlloc({ id: "A7c", tx: "T7", person: RAHUL, amountCents: 333, impact: false, date: d(2026, 2, 15) }),
  ];

  it("budget = my $3.34", () => {
    expect(computeBudget(allocs, ME, P_FEB).spentCents).toBe(334);
  });
  it("Logan +333, Rahul +333", () => {
    expect(balObj(computeBalances([t7], allocs, [], ME))).toEqual({ [LOGAN]: 333, [RAHUL]: 333 });
  });
  it("conservation holds (1000)", () => {
    expect(validateConservation(t7, allocs)).toEqual({ ok: true });
  });
});

describe("S8 — back-dated across month boundary", () => {
  const jan28 = d(2026, 1, 28);
  const t8 = makeTx({ id: "T8", payer: ME, amountCents: 6000, date: jan28 });
  const a8 = makeAlloc({ id: "A8", tx: "T8", person: ME, amountCents: 6000, impact: true, date: jan28 });

  it("lands in January, not February", () => {
    expect(computeBudget([a8], ME, P_JAN).spentCents).toBe(6000);
    expect(computeBudget([a8], ME, P_FEB).spentCents).toBe(0);
  });
});

describe("S9 — overpayment settlement (sign flip requires a note)", () => {
  const t9 = makeTx({ id: "T9", payer: ME, amountCents: 4000, date: d(2026, 2, 16) });
  const a9 = makeAlloc({ id: "A9", tx: "T9", person: LOGAN, amountCents: 4000, impact: false, date: d(2026, 2, 16) });
  const s9 = makeSettlement({ id: "S9", from: LOGAN, to: ME, amountCents: 5000, date: d(2026, 2, 18), note: "Logan overpaid $10, applies to next outing" });

  it("balance flips: I now owe Logan −1000", () => {
    expect(balObj(computeBalances([t9], [a9], [s9], ME))).toEqual({ [LOGAN]: -1000 });
  });
  it("overpayment WITH a note is accepted", () => {
    expect(validateSettlement(s9, 4000)).toEqual({ kind: "ok" });
  });
  it("overpayment WITHOUT a note is flagged", () => {
    const noNote = makeSettlement({ id: "S9x", from: LOGAN, to: ME, amountCents: 5000 });
    expect(validateSettlement(noNote, 4000)).toEqual({ kind: "requires_note" });
  });
  it("a non-positive amount is invalid", () => {
    const bad = makeSettlement({ id: "S9y", from: LOGAN, to: ME, amountCents: 0 });
    expect(validateSettlement(bad, 4000)).toEqual({ kind: "invalid", reason: "settlement amount must be positive" });
  });
});

describe("S10 — self-transfer is never an expense", () => {
  const t10 = makeTx({ id: "T10", payer: ME, amountCents: 20_000, date: d(2026, 2, 19), type: "transfer" });
  const a10 = makeAlloc({ id: "A10", tx: "T10", person: ME, amountCents: 20_000, impact: false, date: d(2026, 2, 19) });

  it("transfer never touches the $800", () => {
    expect(computeBudget([a10], ME, P_FEB).spentCents).toBe(0);
  });
  it("no balances", () => {
    expect(balObj(computeBalances([t10], [a10], [], ME))).toEqual({});
  });
  it("conservation holds (20000)", () => {
    expect(validateConservation(t10, [a10])).toEqual({ ok: true });
  });
});

describe("S11 — partial allocation (unreviewed exposure)", () => {
  const t11 = makeTx({ id: "T11", payer: ME, amountCents: 12_000, date: d(2026, 2, 20), status: "partially_allocated" });
  const allocs = [
    makeAlloc({ id: "A11a", tx: "T11", person: ME, amountCents: 5000, impact: true, date: d(2026, 2, 20) }),
    makeAlloc({ id: "A11b", tx: "T11", person: LOGAN, amountCents: 3000, impact: false, date: d(2026, 2, 20) }),
  ];

  it("only my reviewed $50 hits the budget", () => {
    expect(computeBudget(allocs, ME, P_FEB).spentCents).toBe(5000);
  });
  it("Logan owes +3000", () => {
    expect(balObj(computeBalances([t11], allocs, [], ME))).toEqual({ [LOGAN]: 3000 });
  });
  it("$40 remains as unreviewed exposure", () => {
    expect(computeUnreviewedExposure([t11], allocs, ME, P_FEB)).toBe(4000);
  });
  it("partially_allocated is legally under-allocated (not an error)", () => {
    expect(validateConservation(t11, allocs)).toEqual({ ok: true });
  });
});
