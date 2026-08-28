"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * R3. Runs with the service role, which is the one place the PRD allots it
 * besides the school search route. requireAdminProfile() is what authorises
 * the caller — the key by itself must never be reachable from a user path.
 */
async function setStatus(userId: string, status: "approved" | "rejected") {
  await requireAdminProfile();

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .eq("status", "pending"); // only ever act on a pending row

  if (error) throw new Error(`상태 변경에 실패했습니다: ${error.message}`);

  revalidatePath("/admin/approvals");
}

export async function approveUser(formData: FormData): Promise<void> {
  await setStatus(String(formData.get("user_id") ?? ""), "approved");
}

export async function rejectUser(formData: FormData): Promise<void> {
  await setStatus(String(formData.get("user_id") ?? ""), "rejected");
}
