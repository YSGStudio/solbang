"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminProfile } from "@/lib/auth";

/**
 * R26. Add, edit and deactivate. Writes go through the caller's own session:
 * the item_types / school_review_questions policies already restrict them to
 * is_admin(), so no service role is needed here.
 */
export async function addQuestion(formData: FormData): Promise<void> {
  await requireAdminProfile();
  const supabase = await createClient();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const sortOrder = Number(formData.get("sort_order") ?? 0);

  await supabase.from("school_review_questions").insert({
    text,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  });

  revalidatePath("/admin/questions");
}

export async function updateQuestion(formData: FormData): Promise<void> {
  await requireAdminProfile();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  if (!id || !text) return;

  await supabase
    .from("school_review_questions")
    .update({ text, sort_order: Number.isFinite(sortOrder) ? sortOrder : 0 })
    .eq("id", id);

  revalidatePath("/admin/questions");
}

/**
 * Deactivate rather than delete: existing answers and the averages built from
 * them have to survive. (AC15)
 */
export async function toggleQuestion(formData: FormData): Promise<void> {
  await requireAdminProfile();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!id) return;

  await supabase
    .from("school_review_questions")
    .update({ is_active: nextActive })
    .eq("id", id);

  revalidatePath("/admin/questions");
}
