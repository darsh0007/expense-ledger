// Helper — split a total into equal integer-cent shares with NO cents lost.
//
// Integer division leaves a remainder (e.g. $10.00 / 3 = 333,333,333 = 999,
// one cent short). Our locked rule: the PAYER absorbs the leftover cent(s)
// (fallback: the first participant, if the payer isn't one of them). This keeps
// the split reproducible and guarantees `Σ shares === totalCents`.

export function distributeEqualSplit(
  totalCents: number,
  participantIds: readonly string[],
  payerId: string,
): Map<string, number> {
  const n = participantIds.length;
  if (n === 0) throw new Error("distributeEqualSplit: need at least one participant");

  const base = Math.floor(totalCents / n);
  const shares = new Map<string, number>();
  for (const id of participantIds) shares.set(id, base);

  const remainder = totalCents - base * n;
  if (remainder !== 0) {
    const target = participantIds.includes(payerId) ? payerId : participantIds[0]!;
    shares.set(target, (shares.get(target) ?? 0) + remainder);
  }

  return shares;
}
