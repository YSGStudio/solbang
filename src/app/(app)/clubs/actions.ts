"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { isClubKind, MAX_CLUB_IMAGES, type ClubKind } from "@/lib/categories";
import { uploadPostImages, removeImages, UploadError } from "@/lib/storage";

export type ActionState = { error?: string } | undefined;

/**
 * R18, R19. Photos are optional here, unlike share posts.
 *
 * 소모임 and 번개모임 are the same shape and live in one table, split by
 * `kind`. The club taxonomy is a later piece of work, so no 학교급/카테고리
 * is collected or stored. (migration 10)
 */
export async function createClubPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rawKind = String(formData.get("kind") ?? "club");
  const kind: ClubKind = isClubKind(rawKind) ? rawKind : "club";
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File)
    .filter((f) => f.size > 0);

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!description) return { error: "모임 설명을 입력해 주세요." };
  if (files.length > MAX_CLUB_IMAGES) {
    return { error: `사진은 최대 ${MAX_CLUB_IMAGES}장까지 첨부할 수 있습니다.` };
  }

  let uploaded: string[] = [];
  try {
    uploaded = await uploadPostImages(
      supabase,
      "club-images",
      profile.id,
      files,
      MAX_CLUB_IMAGES,
    );
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  const { data: post, error: postError } = await supabase
    .from("club_posts")
    .insert({
      author_id: profile.id,
      title,
      description,
      kind,
    })
    .select("id")
    .single();

  if (postError || !post) {
    await removeImages(supabase, "club-images", uploaded);
    return { error: `글 작성에 실패했습니다: ${postError?.message}` };
  }

  if (uploaded.length > 0) {
    const { error: imageError } = await supabase.from("club_post_images").insert(
      uploaded.map((path, index) => ({
        post_id: post.id,
        storage_path: path,
        sort_order: index,
      })),
    );
    if (imageError) {
      await supabase.from("club_posts").delete().eq("id", post.id);
      await removeImages(supabase, "club-images", uploaded);
      return { error: `사진 저장에 실패했습니다: ${imageError.message}` };
    }
  }

  revalidatePath("/clubs");
  redirect(`/clubs/${post.id}`);
}

/** R20. No status gate: club comments are never blocked. (AC11) */
export async function addClubComment(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) redirect(`/clubs/${postId}?error=empty-comment`);

  const { error } = await supabase.from("club_comments").insert({
    post_id: postId,
    author_id: profile.id,
    body,
  });

  if (error) redirect(`/clubs/${postId}?error=comment`);

  revalidatePath(`/clubs/${postId}`);
  redirect(`/clubs/${postId}`);
}
