"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { signupErrorMessage } from "@/lib/authError";

export type AuthState = { error?: string } | undefined;

function readSignupForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    fullName: String(formData.get("full_name") ?? "").trim(),
    nickname: String(formData.get("nickname") ?? "").trim(),
    schoolId: String(formData.get("school_id") ?? "").trim(),
    schoolName: String(formData.get("school_name") ?? "").trim(),
  };
}

/**
 * R1, R2. The profile row itself is created by the on_auth_user_created
 * trigger from this metadata, so it always lands on status = 'pending' and a
 * caller cannot forge a role. (AC1)
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const form = readSignupForm(formData);

  if (!form.email || !form.password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }
  if (form.password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (!form.fullName) return { error: "성함을 입력해 주세요." };
  if (!form.nickname) return { error: "닉네임을 입력해 주세요." };
  if (!form.schoolId) {
    return { error: "학교를 검색해서 선택해 주세요." };
  }

  const supabase = await createClient();

  // R29: a friendly check up front. The unique index is the real guarantee,
  // and it is what the trigger below will hit if someone races us.
  const { data: available } = await supabase.rpc("nickname_available", {
    candidate: form.nickname,
  });

  if (available === false) {
    return { error: "이미 사용 중인 닉네임입니다." };
  }

  const { error } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: {
      data: {
        full_name: form.fullName,
        nickname: form.nickname,
        school_id: form.schoolId,
      },
    },
  });

  if (error) {
    return { error: signupErrorMessage(error) };
  }

  redirect("/pending?signup=1");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  revalidatePath("/", "layout");
  redirect("/share");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
