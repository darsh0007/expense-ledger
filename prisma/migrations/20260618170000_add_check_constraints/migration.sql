-- Hand-written migration: database-level guarantees that Prisma Schema can't express.
--
-- These are CHECK constraints — the database itself will REJECT any row that
-- violates them, no matter what code (app bug, manual SQL, future import) tries
-- to insert. This is a safety net beneath the application logic.

-- 1) A settlement always moves a POSITIVE amount of money. Unlike transactions
--    and allocations (which can be negative for refunds), "paying someone back"
--    a negative amount is meaningless and would silently corrupt balances.
ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_amountCents_positive" CHECK ("amountCents" > 0);

-- 2) A settlement cannot be from a person to themselves. Paying yourself back
--    is a no-op that would only pollute the ledger.
ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_from_neq_to" CHECK ("fromPersonId" <> "toPersonId");
