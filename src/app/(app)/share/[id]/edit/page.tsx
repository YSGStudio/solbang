import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { signedUrlsFor } from "@/lib/storage";
import type { SchoolLevel, ShareCategory, ShareStatus } from "@/lib/categories";
import { EditSharePostForm } from "./form";

export const dynamic = "force-dynamic";

/** R9, R10. The author's own edit screen. */
export default async function EditSharePostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireApprovedProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("share_posts")
    .select(
      "id, title, description, usage_tips, condition, school_level, " +
        "category, subject, grade_band, unit, standards, item_type_id, status, author_id, " +
        "item_type:item_type_id (label), " +
        "images:share_post_images (storage_path, sort_order)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const post = data as unknown as {
    id: string;
    title: string;
    description: string;
    usage_tips: string;
    condition: string;
    school_level: SchoolLevel;
    category: ShareCategory;
    subject: string | null;
    grade_band: string | null;
    unit: string | null;
    standards: string[] | null;
    item_type_id: string | null;
    status: ShareStatus;
    author_id: string;
    item_type: { label: string } | null;
    images: { storage_path: string; sort_order: number }[];
  };

  // Reading is open to every approved user, editing is not. Send anyone else
  // back to the post rather than showing them a form that would be rejected.
  if (post.author_id !== profile.id) redirect(`/share/${post.id}`);
  if (post.status === "completed") redirect(`/share/${post.id}?error=edit-completed`);

  const { data: itemTypes } = await supabase
    .from("item_types")
    .select("id, label, carbon_g, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const images = [...post.images].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedUrlsFor(
    supabase,
    "share-images",
    images.map((image) => image.storage_path),
  );

  return (
    <EditSharePostForm
      post={{
        id: post.id,
        title: post.title,
        description: post.description,
        usageTips: post.usage_tips,
        condition: post.condition,
        schoolLevel: post.school_level,
        category: post.category,
        subject: post.subject,
        gradeBand: post.grade_band,
        unit: post.unit,
        standards: post.standards ?? [],
        itemTypeId: post.item_type_id,
        status: post.status,
        itemTypeLabel: post.item_type?.label ?? null,
      }}
      itemTypes={itemTypes ?? []}
      images={images.map((image) => ({
        path: image.storage_path,
        url: urls.get(image.storage_path),
      }))}
    />
  );
}
