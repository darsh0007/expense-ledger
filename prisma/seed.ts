// Database seed: the initial, real-world starting data for the ledger.
//
// Design choices worth understanding:
//  - IDEMPOTENT: every record is `upsert`ed by a STABLE, human-readable id
//    (e.g. "darshan", "acct-td-chequing"). Running this script twice does NOT
//    create duplicates, and it will NOT wipe transactions you later add through
//    the UI — it only touches these specific seed rows.
//  - We set explicit ids here so the upserts have a stable key. New rows created
//    later through the app still get auto-generated cuids; that's fine.
//  - Money is integer CENTS ($800 -> 80000). Dates for budget periods are stored
//    as calendar DATEs (no time/zone), so we build them with Date.UTC to avoid
//    an off-by-one-day shift.
import { AccountType } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/db.js";

const ME = "darshan";

// People: you (isMe) + the friends who show up in shared expenses.
// You can add more people anytime later from the UI — this is just the start.
const people: { id: string; displayName: string; isMe: boolean }[] = [
  { id: ME, displayName: "Darshan", isMe: true },
  { id: "logan", displayName: "Logan", isMe: false },
  { id: "theepan", displayName: "Theepan", isMe: false },
  { id: "bisrat", displayName: "Bisrat", isMe: false },
  { id: "hariesh", displayName: "Hariesh", isMe: false },
  { id: "anish", displayName: "Anish", isMe: false },
  { id: "vyshnav", displayName: "Vyshnav", isMe: false },
  { id: "alazar", displayName: "Alazar", isMe: false },
  { id: "gemechis", displayName: "Gemechis", isMe: false },
];

// Accounts you pay with. e-transfer is NOT here — it's a settlement METHOD
// (the money leaves your TD/Simplii chequing), handled when you record a payback.
const accounts: {
  id: string;
  name: string;
  type: AccountType;
  ownerPersonId: string;
}[] = [
  { id: "acct-simplii-cc", name: "Simplii Financial (Credit Card)", type: AccountType.credit_card, ownerPersonId: ME },
  { id: "acct-rogers-cc", name: "Rogers", type: AccountType.credit_card, ownerPersonId: ME },
  { id: "acct-simplii-chequing", name: "Simplii Financial (Chequing)", type: AccountType.debit_card, ownerPersonId: ME },
  { id: "acct-td-chequing", name: "TD Chequing", type: AccountType.debit_card, ownerPersonId: ME },
  { id: "acct-cash", name: "Cash", type: AccountType.cash, ownerPersonId: ME },
];

// First budget period: July 2026, $800 CAD limit.
const budget = {
  id: "budget-2026-07",
  startDate: new Date(Date.UTC(2026, 6, 1)), // month index 6 = July
  endDate: new Date(Date.UTC(2026, 6, 31)),
  limitCents: 80_000,
  currency: "CAD",
};

async function main() {
  for (const p of people) {
    await prisma.person.upsert({
      where: { id: p.id },
      create: p,
      update: { displayName: p.displayName, isMe: p.isMe },
    });
  }

  for (const a of accounts) {
    await prisma.account.upsert({
      where: { id: a.id },
      create: a,
      update: { name: a.name, type: a.type, ownerPersonId: a.ownerPersonId },
    });
  }

  await prisma.budgetPeriod.upsert({
    where: { id: budget.id },
    create: budget,
    update: { startDate: budget.startDate, endDate: budget.endDate, limitCents: budget.limitCents, currency: budget.currency },
  });

  console.log(
    `Seed complete: ${people.length} people, ${accounts.length} accounts, 1 budget period ($${budget.limitCents / 100} ${budget.currency}, July 2026).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
