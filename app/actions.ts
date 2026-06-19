"use server";

import { revalidatePath } from "next/cache";
import type { SettlementMethod } from "../src/domain/index.js";
import {
  createPerson,
  getMe,
  hardDeleteTransaction,
  restoreTransaction,
  softDeleteTransaction,
} from "../src/repository/ledger.js";
import {
  dollarsToCents,
  recordEqualSplitPurchase,
} from "../src/services/transactions.js";
import { recordSettlement } from "../src/services/settlements.js";

/**
 * Server Action: runs ONLY on the server. The browser never sees this code — it
 * just POSTs the form, and Next invokes this function. It is the UI's doorway
 * into the same repository the report script uses, so the write goes through the
 * exact same Prisma-aware layer (no duplicate DB logic).
 */
export async function addPerson(formData: FormData): Promise<void> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  await createPerson({ displayName });

  // Tell Next the dashboard data changed so it re-renders with the new person.
  revalidatePath("/");
}

/**
 * Server Action: record a purchase I paid for, split equally among the people
 * I checked. Parsing/validation happens at this boundary; the actual money math
 * and persistence live in the service + domain + repository underneath.
 */
export async function addPurchase(formData: FormData): Promise<void> {
  const me = await getMe();

  const amountCents = dollarsToCents(String(formData.get("amount") ?? ""));
  const merchant = String(formData.get("merchant") ?? "").trim() || undefined;
  const accountId = String(formData.get("paymentAccountId") ?? "");
  const dateStr = String(formData.get("expenseDate") ?? "");
  const expenseDate = dateStr
    ? new Date(`${dateStr}T00:00:00Z`)
    : new Date();

  // Checked participants; default to "just me" if none were selected.
  const participantIds = formData.getAll("participants").map(String);
  const ids = participantIds.length > 0 ? participantIds : [me.id];

  await recordEqualSplitPurchase({
    payerId: me.id,
    meId: me.id,
    amountCents,
    participantIds: ids,
    paymentAccountId: accountId || null,
    merchant,
    expenseDate,
  });

  revalidatePath("/");
}

/**
 * Server Action: record a repayment that clears (part of) a balance. Parsing
 * and direction-mapping happen here at the boundary; the service decides if the
 * repayment is valid and the repository persists it.
 */
export async function addSettlement(formData: FormData): Promise<void> {
  const me = await getMe();

  const personId = String(formData.get("personId") ?? "");
  if (!personId) return;

  const direction =
    String(formData.get("direction") ?? "they_paid_me") === "i_paid_them"
      ? "i_paid_them"
      : "they_paid_me";
  const amountCents = dollarsToCents(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "e_transfer") as SettlementMethod;
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const dateStr = String(formData.get("settlementDate") ?? "");
  const settlementDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date();

  await recordSettlement({
    meId: me.id,
    personId,
    direction,
    amountCents,
    method,
    settlementDate,
    note,
  });

  revalidatePath("/");
}

/**
 * Server Action: move a transaction to the Trash (soft delete). The row and its
 * allocations stay in the database but drop out of every projection, so the
 * budget and balances back the purchase out immediately. It can be restored
 * until the auto-purge removes it for good.
 */
export async function removeTransaction(formData: FormData): Promise<void> {
  const id = String(formData.get("transactionId") ?? "");
  if (!id) return;

  await softDeleteTransaction(id);

  revalidatePath("/");
}

/** Server Action: restore a transaction from the Trash. */
export async function undoRemoveTransaction(formData: FormData): Promise<void> {
  const id = String(formData.get("transactionId") ?? "");
  if (!id) return;

  await restoreTransaction(id);

  revalidatePath("/");
}

/** Server Action: permanently delete a trashed transaction ("Delete forever"). */
export async function destroyTransaction(formData: FormData): Promise<void> {
  const id = String(formData.get("transactionId") ?? "");
  if (!id) return;

  await hardDeleteTransaction(id);

  revalidatePath("/");
}

