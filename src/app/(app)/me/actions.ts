"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";

export type ProfileState = { error?: string; ok?: boolean } | undefined;

/**
 * R27, R29. Nickname and school only. role and status are refused by the
 * guard trigger in migration 1, and the unique index is what makes the
 * nickname check binding. (AC16)
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const nickname = String(formData.get("nickname") ?? "").trim();
  const schoolId = String(formData.get("school_id") ?? "").trim();

  if (!nickname) return { error: "닉네임을 입력해 주세요." };
  if (nickname.length > 20) {
    return { error: "닉네임은 20자 이하로 입력해 주세요." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      nickname,
      school_id: schoolId || null,
    })
    .eq("id", profile.id);

  if (error) {
    if (/duplicate key|profiles_nickname_key/i.test(error.message)) {
      return { error: "이미 사용 중인 닉네임입니다." };
    }
    return { error: `저장에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/me");
  return { ok: true };
}
