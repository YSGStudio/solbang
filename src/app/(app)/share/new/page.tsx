import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { NewSharePostForm } from "./form";

export const dynamic = "force-dynamic";

/** T10 / R9, R10, R16. */
export default async function NewSharePostPage() {
  await requireApprovedProfile();
  const supabase = await createClient();

  const { data: itemTypes } = await supabase
    .from("item_types")
    .select("id, label, carbon_g, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  return <NewSharePostForm itemTypes={itemTypes ?? []} />;
}
