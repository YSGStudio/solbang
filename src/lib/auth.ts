import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.types";

/**
 * Every screen under (app) and /admin calls this. It is a convenience and a
 * redirect, not a security boundary — RLS is what actually withholds data.
 */
export async function requireApprovedProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "approved") redirect("/pending");
  return profile as Profile;
}

export async function requireAdminProfile(): Promise<Profile> {
  const profile = await requireApprovedProfile();
  if (profile.role !== "admin") redirect("/share");
  return profile;
}
