"use server";

import { revalidatePath } from "next/cache";
import { createPerson } from "../src/repository/ledger.js";

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
