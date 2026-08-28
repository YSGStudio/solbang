"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { MAX_BOARD_IMAGES } from "@/lib/categories";
import { uploadPostImages, removeImages, UploadError } from "@/lib/storage";

export type ActionState = { error?: string } | undefined;

/**
 * 게시판: the same post + comment shape as clubs, with no taxonomy at all.
 * Photos are optional. (migration 10)
 */
export async function createBoardPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File)
    .filter((f) => f.size > 0);

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!description) return { error: "내용을 입력해 주세요." };
  if (files.length > MAX_BOARD_IMAGES) {
    return { error: `사진은 최대 ${MAX_BOARD_IMAGES}장까지 첨부할 수 있습니다.` };
  }

  let uploaded: string[] = [];
  try {
    uploaded = await uploadPostImages(
      supabase,
      "board-images",
      profile.id,
      files,
      MAX_BOARD_IMAGES,
    );
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  const { data: post, error: postError } = await supabase
    .from("board_posts")
    .insert({ author_id: profile.id, title, description })
    .select("id")
    .single();

  if (postError || !post) {
    await removeImages(supabase, "board-images", uploaded);
    return { error: `글 작성에 실패했습니다: ${postError?.message}` };
  }

  if (uploaded.length > 0) {
    const { error: imageError } = await supabase.from("board_post_images").insert(
      uploaded.map((path, index) => ({
        post_id: post.id,
        storage_path: path,
        sort_order: index,
      })),
    );
    if (imageError) {
      await supabase.from("board_posts").delete().eq("id", post.id);
      await removeImages(supabase, "board-images", uploaded);
      return { error: `사진 저장에 실패했습니다: ${imageError.message}` };
    }
  }

  revalidatePath("/board");
  redirect(`/board/${post.id}`);
}

/** Comments are never gated here, same as clubs. */
export async function addBoardComment(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) redirect(`/board/${postId}?error=empty-comment`);

  const { error } = await supabase.from("board_comments").insert({
    post_id: postId,
    author_id: profile.id,
    body,
  });

  if (error) redirect(`/board/${postId}?error=comment`);

  revalidatePath(`/board/${postId}`);
  redirect(`/board/${postId}`);
}

/** The author, or an administrator. Enforced by board_posts_delete. */
export async function deleteBoardPost(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const postId = String(formData.get("post_id") ?? "").trim();

  if (!postId) redirect("/board");

  const { data: images } = await supabase
    .from("board_post_images")
    .select("storage_path")
    .eq("post_id", postId);

  const remove = supabase.from("board_posts").delete().eq("id", postId);
  const { data, error } = await (profile.role === "admin"
    ? remove
    : remove.eq("author_id", profile.id)
  ).select("id");

  if (error || !data || data.length === 0) {
    redirect(`/board/${postId}?error=delete`);
  }

  await removeImages(
    supabase,
    "board-images",
    (images ?? []).map((image) => image.storage_path),
  );

  revalidatePath("/board");
  redirect("/board?deleted=1");
}
