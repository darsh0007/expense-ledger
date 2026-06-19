// Ledger repository — reads from Neon and returns DOMAIN objects.
//
// Callers (services, scripts, future API routes) never see a Prisma row; they
// get clean domain value objects ready to hand straight to the pure functions.
// This keeps the database an implementation detail behind a small, named API.

import type { Allocation, BudgetPeriod, Person, Settlement, Transaction } from "../domain/index.js";
import { prisma } from "../lib/db.js";
import {
  toDomainAllocation,
  toDomainBudgetPeriod,
  toDomainPerson,
  toDomainSettlement,
  toDomainTransaction,
} from "./mappers.js";

/** The single budget owner (isMe = true). Throws if the DB hasn't been seeded. */
export async function getMe(): Promise<Person> {
  const row = await prisma.person.findFirst({ where: { isMe: true } });
  if (!row) throw new Error("No person marked isMe=true — seed the database first.");
  return toDomainPerson(row);
}

/** One budget period by id, or throw if it doesn't exist. */
export async function getBudgetPeriod(id: string): Promise<BudgetPeriod> {
  const row = await prisma.budgetPeriod.findUnique({ where: { id } });
  if (!row) throw new Error(`Budget period not found: ${id}`);
  return toDomainBudgetPeriod(row);
}

/** All budget periods, oldest first. */
export async function listBudgetPeriods(): Promise<BudgetPeriod[]> {
  const rows = await prisma.budgetPeriod.findMany({ orderBy: { startDate: "asc" } });
  return rows.map(toDomainBudgetPeriod);
}

/** All people, for resolving ids to display names in reports/UI. */
export async function listPeople(): Promise<Array<Person & { displayName: string }>> {
  const rows = await prisma.person.findMany({ orderBy: { displayName: "asc" } });
  return rows.map((r) => ({ ...toDomainPerson(r), displayName: r.displayName }));
}

/** The three event streams the projections run over. */
export interface LedgerData {
  transactions: Transaction[];
  allocations: Allocation[];
  settlements: Settlement[];
}

/**
 * Load the whole ledger. Balances are all-time, and the budget/exposure
 * functions filter by period internally, so we load every row and let the pure
 * functions decide what counts. (When data grows, we can push date filters into
 * these queries without changing a single domain function.)
 */
export async function loadLedger(): Promise<LedgerData> {
  const [transactions, allocations, settlements] = await Promise.all([
    prisma.transaction.findMany(),
    prisma.allocation.findMany(),
    prisma.settlement.findMany(),
  ]);

  return {
    transactions: transactions.map(toDomainTransaction),
    allocations: allocations.map(toDomainAllocation),
    settlements: settlements.map(toDomainSettlement),
  };
}
