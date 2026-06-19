"use server";

import { revalidatePath } from "next/cache";
import { createPerson, getMe } from "../src/repository/ledger.js";
import {
  dollarsToCents,
  recordEqualSplitPurchase,
} from "../src/services/transactions.js";

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

