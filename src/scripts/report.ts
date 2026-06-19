// Runnable demo — prove the whole pipeline end-to-end against LIVE Neon data.
//
//   Repository (reads Neon) -> Service (orchestrates) -> Domain (the math)
//
// Run it:  npm run report            (defaults to the seeded July 2026 period)
//          npm run report <periodId>
//
// NOTE: this connects to Postgres (port 5432), so it must run on a network that
// allows that (hotspot / home Wi-Fi), not the gov network.

import { listPeople } from "../repository/ledger.js";
import { computePeriodSummary } from "../services/reporting.js";
import { prisma } from "../lib/db.js";

const fmt = (cents: number): string =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

async function main(): Promise<void> {
  const periodId = process.argv[2] ?? "budget-2026-07";

  const summary = await computePeriodSummary(periodId);
  const people = await listPeople();
  const nameById = new Map(people.map((p) => [p.id, p.displayName]));

  console.log(`\n=== Budget period: ${summary.periodId} ===`);
  console.log(`  Personal spend     : ${fmt(summary.budget.spentCents)}`);
  console.log(`  Budget limit       : ${fmt(summary.budget.limitCents)}`);
  console.log(`  Remaining          : ${fmt(summary.budget.remainingCents)}`);
  console.log(`  Unreviewed exposure: ${fmt(summary.unreviewedExposureCents)}`);

  console.log(`\n  Balances (positive = they owe me):`);
  if (summary.balances.size === 0) {
    console.log("    (no outstanding balances — everyone is settled)");
  } else {
    for (const [personId, cents] of summary.balances) {
      const name = nameById.get(personId) ?? personId;
      const line = cents > 0 ? `${name} owes me ${fmt(cents)}` : `I owe ${name} ${fmt(-cents)}`;
      console.log(`    ${line}`);
    }
  }
  console.log();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
