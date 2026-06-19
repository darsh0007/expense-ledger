// Row mappers — the translation layer between Prisma and the domain.
//
// This is the ONLY place (together with ledger.ts) that touches Prisma's
// generated row types. Each function takes a database row and returns a clean
// domain value object, dropping columns the math doesn't care about (merchant,
// currency, createdAt, …) and renaming where the domain uses a clearer name
// (e.g. refundOfId -> refundOfTransactionId).
//
// Why bother? Because the domain stays pure and Prisma-free. If a column is
// renamed or the ORM changes, only these mappers move — the proven math never
// does.

import type { Allocation, BudgetPeriod, Person, Settlement, Transaction } from "../domain/index.js";
import type {
  AllocationModel,
  BudgetPeriodModel,
  PersonModel,
  SettlementModel,
  TransactionModel,
} from "../generated/prisma/models.js";

export function toDomainPerson(row: PersonModel): Person {
  return { id: row.id, isMe: row.isMe };
}

export function toDomainTransaction(row: TransactionModel): Transaction {
  return {
    id: row.id,
    payerPersonId: row.payerPersonId,
    paymentAccountId: row.paymentAccountId,
    amountCents: row.amountCents,
    expenseDate: row.expenseDate,
    status: row.status,
    type: row.type,
    refundOfTransactionId: row.refundOfId,
  };
}

export function toDomainAllocation(row: AllocationModel): Allocation {
  return {
    id: row.id,
    transactionId: row.transactionId,
    personId: row.personId,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    budgetImpact: row.budgetImpact,
    expenseDate: row.expenseDate,
  };
}

export function toDomainSettlement(row: SettlementModel): Settlement {
  return {
    id: row.id,
    fromPersonId: row.fromPersonId,
    toPersonId: row.toPersonId,
    amountCents: row.amountCents,
    settlementDate: row.settlementDate,
    method: row.method,
    note: row.note,
  };
}

export function toDomainBudgetPeriod(row: BudgetPeriodModel): BudgetPeriod {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    limitCents: row.limitCents,
  };
}
