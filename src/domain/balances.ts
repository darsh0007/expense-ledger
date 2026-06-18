// Projection #2 — the "who owes whom" question.
//
// Returns a net balance per person, from MY perspective:
//   positive  => that person owes me
//   negative  => I owe that person
//
// It walks two event streams:
//   1. Allocations: for an allocation where person C consumed `a` on a
//      transaction PAID by K:
//        - I paid, someone else consumed   (K=me, C≠me) => C owes me  (+a)
//        - someone paid, I consumed         (K≠me, C=me) => I owe K    (−a)
//        - I paid, I consumed               (K=me, C=me) => no effect (my own expense)
//        - neither involves me                            => ignored
//   2. Settlements (repayments) reduce the debt:
//        - I paid them back  (from=me) => they owe me more / I owe less (+amount)
//        - they paid me back (to=me)   => they owe me less              (−amount)
//
// Offsets fall out for free: two opposite allocations on the same pair net
// automatically (S5). Balances that land on exactly 0 are pruned — a zero
// balance means "settled", so we show nothing.

import type { Allocation, Settlement, Transaction } from "./types.js";

export function computeBalances(
  transactions: readonly Transaction[],
  allocations: readonly Allocation[],
  settlements: readonly Settlement[],
  meId: string,
): Map<string, number> {
  const txById = new Map(transactions.map((t) => [t.id, t]));
  const balances = new Map<string, number>();

  const add = (personId: string, delta: number): void => {
    balances.set(personId, (balances.get(personId) ?? 0) + delta);
  };

  for (const a of allocations) {
    const tx = txById.get(a.transactionId);
    if (!tx) continue; // dangling allocation; ignore defensively

    const payer = tx.payerPersonId;
    const consumer = a.personId;

    if (payer === meId && consumer !== meId) add(consumer, a.amountCents);
    else if (payer !== meId && consumer === meId) add(payer, -a.amountCents);
    // (me,me) and (other,other) intentionally do nothing.
  }

  for (const s of settlements) {
    if (s.fromPersonId === meId) add(s.toPersonId, s.amountCents);
    else if (s.toPersonId === meId) add(s.fromPersonId, -s.amountCents);
  }

  for (const [personId, net] of balances) {
    if (net === 0) balances.delete(personId);
  }

  return balances;
}
