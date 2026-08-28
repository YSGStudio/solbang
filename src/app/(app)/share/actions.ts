"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { isValidPair, MAX_SHARE_IMAGES } from "@/lib/categories";
import { uploadPostImages, removeImages, UploadError } from "@/lib/storage";

export type ActionState = { error?: string } | undefined;

/**
 * R9, R10, R16. Writes the post, snapshots the carbon coefficient, then the
 * images. Every rule here is repeated as a constraint or trigger in
 * migration 3, so a caller that skips this action still cannot break them.
 */
export async function createSharePost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const schoolLevel = String(formData.get("school_level") ?? "");
  const category = String(formData.get("category") ?? "");
  const itemTypeId = String(formData.get("item_type_id") ?? "").trim();
  const files = formData.getAll("images").filter((f): f is File => f instanceof File);

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!description) return { error: "물건 설명을 입력해 주세요." };
  if (!isValidPair(schoolLevel, category)) {
    return { error: "학교급과 카테고리 조합이 올바르지 않습니다." };
  }
  if (!itemTypeId) return { error: "품목 유형을 선택해 주세요." };

  const realFiles = files.filter((f) => f.size > 0);
  // R10: at least one, at most four.
  if (realFiles.length === 0) return { error: "사진을 1장 이상 첨부해 주세요." };
  if (realFiles.length > MAX_SHARE_IMAGES) {
    return { error: `사진은 최대 ${MAX_SHARE_IMAGES}장까지 첨부할 수 있습니다.` };
  }

  // R16: read the coefficient now and copy it onto the post. Later edits to
  // the table must not rewrite this post's value.
  const { data: itemType } = await supabase
    .from("item_types")
    .select("id, carbon_g")
    .eq("id", itemTypeId)
    .maybeSingle();

  if (!itemType) return { error: "품목 유형을 찾을 수 없습니다." };

  let uploaded: string[] = [];
  try {
    uploaded = await uploadPostImages(
      supabase,
      "share-images",
      profile.id,
      realFiles,
      MAX_SHARE_IMAGES,
    );
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  const { data: post, error: postError } = await supabase
    .from("share_posts")
    .insert({
      author_id: profile.id,
      title,
      description,
      school_level: schoolLevel as "elementary" | "secondary",
      category,
      item_type_id: itemType.id,
      carbon_g: itemType.carbon_g,
    })
    .select("id")
    .single();

  if (postError || !post) {
    await removeImages(supabase, "share-images", uploaded);
    return { error: `글 작성에 실패했습니다: ${postError?.message}` };
  }

  const { error: imageError } = await supabase.from("share_post_images").insert(
    uploaded.map((path, index) => ({
      post_id: post.id,
      storage_path: path,
      sort_order: index,
    })),
  );

  if (imageError) {
    // The image trigger rejected the batch; do not leave a photoless post.
    await supabase.from("share_posts").delete().eq("id", post.id);
    await removeImages(supabase, "share-images", uploaded);
    return { error: `사진 저장에 실패했습니다: ${imageError.message}` };
  }

  revalidatePath("/share");
  redirect(`/share/${post.id}`);
}

/** R12. The trigger rejects self-reservation and a second reserver. (AC7) */
export async function reserveSharePost(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const postId = String(formData.get("post_id") ?? "");

  const { data, error } = await supabase
    .from("share_posts")
    .update({ status: "reserved", reserved_by: profile.id })
    .eq("id", postId)
    .eq("status", "available")
    .select("id");

  // RLS filters an already-reserved post out of the UPDATE rather than
  // raising, so zero rows is the "someone got there first" case.
  if (error || !data || data.length === 0) {
    redirect(`/share/${postId}?error=reserve`);
  }

  revalidatePath(`/share/${postId}`);
  revalidatePath("/share");
  redirect(`/share/${postId}`);
}

/** R13. Either the reserver or the author may release it. */
export async function cancelReservation(formData: FormData): Promise<void> {
  await requireApprovedProfile();
  const supabase = await createClient();
  const postId = String(formData.get("post_id") ?? "");

  const { data, error } = await supabase
    .from("share_posts")
    .update({ status: "available", reserved_by: null })
    .eq("id", postId)
    .eq("status", "reserved")
    .select("id");

  if (error || !data || data.length === 0) {
    redirect(`/share/${postId}?error=cancel`);
  }

  revalidatePath(`/share/${postId}`);
  revalidatePath("/share");
  redirect(`/share/${postId}`);
}

/** R14. Author only, reserved -> completed, and it never comes back. (AC9) */
export async function completeSharePost(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const postId = String(formData.get("post_id") ?? "");

  const { data, error } = await supabase
    .from("share_posts")
    .update({ status: "completed" })
    .eq("id", postId)
    .eq("author_id", profile.id)
    .eq("status", "reserved")
    .select("id");

  if (error || !data || data.length === 0) {
    redirect(`/share/${postId}?error=complete`);
  }

  revalidatePath(`/share/${postId}`);
  revalidatePath("/share");
  revalidatePath("/me");
  redirect(`/share/${postId}`);
}

/** R15. Blocked while the post is reserved, by a trigger. (AC8) */
export async function addShareComment(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) redirect(`/share/${postId}?error=empty-comment`);

  const { error } = await supabase.from("share_comments").insert({
    post_id: postId,
    author_id: profile.id,
    body,
  });

  if (error) redirect(`/share/${postId}?error=comment`);

  revalidatePath(`/share/${postId}`);
  redirect(`/share/${postId}`);
}
