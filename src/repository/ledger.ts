// Ledger repository — reads from Neon and returns DOMAIN objects.
//
// Callers (services, scripts, future API routes) never see a Prisma row; they
// get clean domain value objects ready to hand straight to the pure functions.
// This keeps the database an implementation detail behind a small, named API.

import type {
  Allocation,
  BudgetPeriod,
  Person,
  Settlement,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../domain/index.js";
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

/**
 * Add a new person to the ledger. The schema lets us do this any time — a person
 * is just a name we can attribute spending or debts to (a friend, a roommate,
 * a one-off). `isMe` is always false here; there is exactly one "me" (the seed).
 */
export async function createPerson(input: {
  displayName: string;
  email?: string;
}): Promise<Person & { displayName: string }> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("displayName is required");

  const row = await prisma.person.create({
    data: {
      displayName,
      isMe: false,
      email: input.email?.trim() ? input.email.trim() : null,
    },
  });
  return { ...toDomainPerson(row), displayName: row.displayName };
}

/** Active accounts (cards, cash, …) for the "paid with" dropdown. */
export async function listAccounts(): Promise<Array<{ id: string; name: string; type: string }>> {
  const rows = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

/** A lightweight read model for the activity feed (keeps merchant the domain drops). */
export interface TransactionListItem {
  id: string;
  merchant: string | null;
  amountCents: number;
  expenseDate: Date;
}

/** The most recent transactions, newest first, for the dashboard feed. */
export async function listRecentTransactions(limit = 10): Promise<TransactionListItem[]> {
  const rows = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    amountCents: r.amountCents,
    expenseDate: r.expenseDate,
  }));
}

/** A consumption slice to persist alongside a new transaction. */
export interface NewAllocation {
  personId: string;
  amountCents: number;
  budgetImpact: boolean;
  categoryId?: string | null;
  expenseDate: Date;
}

/** A new payment event plus the allocations that account for every cent of it. */
export interface NewTransaction {
  payerPersonId: string;
  paymentAccountId?: string | null;
  amountCents: number;
  merchant?: string | null;
  expenseDate: Date;
  type: TransactionType;
  status: TransactionStatus;
  allocations: NewAllocation[];
}

/**
 * Write a transaction and its allocations in ONE database transaction. Prisma's
 * nested `create` runs them atomically: either the payment event AND all of its
 * consumption slices land together, or nothing does. That is what keeps the
 * conservation invariant true on disk — we can never persist a transaction whose
 * allocations don't add up because a second write failed halfway.
 */
export async function createTransactionWithAllocations(
  input: NewTransaction,
): Promise<Transaction> {
  const row = await prisma.transaction.create({
    data: {
      payerPersonId: input.payerPersonId,
      paymentAccountId: input.paymentAccountId ?? null,
      amountCents: input.amountCents,
      merchant: input.merchant ?? null,
      expenseDate: input.expenseDate,
      type: input.type,
      status: input.status,
      source: "manual",
      allocations: {
        create: input.allocations.map((a) => ({
          personId: a.personId,
          amountCents: a.amountCents,
          budgetImpact: a.budgetImpact,
          categoryId: a.categoryId ?? null,
          expenseDate: a.expenseDate,
        })),
      },
    },
  });
  return toDomainTransaction(row);
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
