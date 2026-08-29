"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import {
  detailAxisFor,
  isItemCondition,
  isSchoolLevel,
  isValidShareTaxonomy,
  MAX_SHARE_IMAGES,
  type ShareStatus,
} from "@/lib/categories";
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
  const usageTips = String(formData.get("usage_tips") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  const schoolLevel = String(formData.get("school_level") ?? "");
  const category = String(formData.get("category") ?? "");
  // 세부 항목은 조합에 따라 하나만 쓰인다. 화면이 감춘 값이 남아 넘어와도
  // 조합에 맞지 않으면 버린다.
  const axis = detailAxisFor(schoolLevel, category);
  const subject = axis === "subject" ? String(formData.get("subject") ?? "") : null;
  const gradeBand = axis === "grade" ? String(formData.get("grade_band") ?? "") : null;
  const itemTypeId = String(formData.get("item_type_id") ?? "").trim();
  const files = formData.getAll("images").filter((f): f is File => f instanceof File);

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!description) return { error: "물건 설명을 입력해 주세요." };
  if (!isSchoolLevel(schoolLevel)) return { error: "학교급을 선택해 주세요." };
  if (!isValidShareTaxonomy(schoolLevel, category, subject, gradeBand)) {
    return {
      error:
        axis === "grade"
          ? "학년군을 선택해 주세요."
          : axis === "subject"
            ? "교과목을 선택해 주세요."
            : "카테고리를 올바르게 선택해 주세요.",
    };
  }
  if (!isItemCondition(condition)) {
    return { error: "물건 상태를 선택해 주세요." };
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
      usage_tips: usageTips,
      condition,
      school_level: schoolLevel,
      category,
      subject,
      grade_band: gradeBand,
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

/**
 * Fields the author is allowed to change after the fact. `item_type_id` and
 * `carbon_g` are deliberately absent: migration 9 freezes the carbon snapshot
 * and rejects any update that touches either one. (R16)
 */
export async function updateSharePost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const postId = String(formData.get("post_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const usageTips = String(formData.get("usage_tips") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  const schoolLevel = String(formData.get("school_level") ?? "");
  const category = String(formData.get("category") ?? "");
  const axis = detailAxisFor(schoolLevel, category);
  const subject = axis === "subject" ? String(formData.get("subject") ?? "") : null;
  const gradeBand = axis === "grade" ? String(formData.get("grade_band") ?? "") : null;
  const removePaths = formData
    .getAll("remove_images")
    .map((value) => String(value))
    .filter(Boolean);
  const files = formData.getAll("images").filter((f): f is File => f instanceof File);

  if (!postId) return { error: "잘못된 요청입니다." };
  if (!title) return { error: "제목을 입력해 주세요." };
  if (!description) return { error: "물건 설명을 입력해 주세요." };
  if (!isSchoolLevel(schoolLevel)) return { error: "학교급을 선택해 주세요." };
  if (!isValidShareTaxonomy(schoolLevel, category, subject, gradeBand)) {
    return {
      error:
        axis === "grade"
          ? "학년군을 선택해 주세요."
          : axis === "subject"
            ? "교과목을 선택해 주세요."
            : "카테고리를 올바르게 선택해 주세요.",
    };
  }
  if (!isItemCondition(condition)) {
    return { error: "물건 상태를 선택해 주세요." };
  }

  const { data: existing } = await supabase
    .from("share_posts")
    .select("id, author_id, status, images:share_post_images (storage_path)")
    .eq("id", postId)
    .maybeSingle();

  if (!existing) return { error: "글을 찾을 수 없습니다." };

  const current = existing as unknown as {
    id: string;
    author_id: string;
    status: ShareStatus;
    images: { storage_path: string }[];
  };

  // The RLS policy and the transition trigger both say the same thing; this
  // is only so the author sees a sentence instead of a database error.
  if (current.author_id !== profile.id) {
    return { error: "글쓴이만 수정할 수 있습니다." };
  }
  if (current.status === "completed") {
    return { error: "나눔이 완료된 글은 수정할 수 없습니다." };
  }

  const currentPaths = current.images.map((image) => image.storage_path);
  const toRemove = removePaths.filter((path) => currentPaths.includes(path));
  const realFiles = files.filter((file) => file.size > 0);
  const finalCount = currentPaths.length - toRemove.length + realFiles.length;

  // R10: the post must keep at least one photo and never exceed four.
  if (finalCount < 1) return { error: "사진을 1장 이상 남겨 주세요." };
  if (finalCount > MAX_SHARE_IMAGES) {
    return { error: `사진은 최대 ${MAX_SHARE_IMAGES}장까지 첨부할 수 있습니다.` };
  }

  let uploaded: string[] = [];
  if (realFiles.length > 0) {
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
  }

  const { error: updateError } = await supabase
    .from("share_posts")
    .update({
      title,
      description,
      usage_tips: usageTips,
      condition,
      school_level: schoolLevel,
      category,
      subject,
      grade_band: gradeBand,
    })
    .eq("id", postId)
    .eq("author_id", profile.id);

  if (updateError) {
    await removeImages(supabase, "share-images", uploaded);
    return { error: `수정에 실패했습니다: ${updateError.message}` };
  }

  // The image-limit trigger counts rows already present, so the two writes can
  // only be ordered insert-first when the total stays under the cap. Otherwise
  // the old rows have to go first to make room.
  const insertFirst = currentPaths.length + uploaded.length <= MAX_SHARE_IMAGES;

  const insertRows = async () => {
    if (uploaded.length === 0) return null;
    const base = Date.now();
    const { error } = await supabase.from("share_post_images").insert(
      uploaded.map((path, index) => ({
        post_id: postId,
        storage_path: path,
        sort_order: base + index,
      })),
    );
    return error;
  };

  const deleteRows = async () => {
    if (toRemove.length === 0) return null;
    const { error } = await supabase
      .from("share_post_images")
      .delete()
      .eq("post_id", postId)
      .in("storage_path", toRemove);
    return error;
  };

  const first = insertFirst ? await insertRows() : await deleteRows();
  if (first) {
    await removeImages(supabase, "share-images", uploaded);
    return { error: `사진 변경에 실패했습니다: ${first.message}` };
  }

  const second = insertFirst ? await deleteRows() : await insertRows();
  if (second) {
    return { error: `사진 변경에 실패했습니다: ${second.message}` };
  }

  // Only once the rows are gone is it safe to drop the objects themselves.
  await removeImages(supabase, "share-images", toRemove);

  revalidatePath("/share");
  revalidatePath(`/share/${postId}`);
  redirect(`/share/${postId}`);
}

/**
 * The author, or an administrator moderating. Enforced by the
 * share_posts_delete policy (migration 12); the filter below only decides
 * which rows we ask for. Comments and image rows go with it through
 * `on delete cascade`; the stored objects do not, so they are removed here.
 */
export async function deleteSharePost(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const postId = String(formData.get("post_id") ?? "").trim();

  if (!postId) redirect("/share");

  const { data: images } = await supabase
    .from("share_post_images")
    .select("storage_path")
    .eq("post_id", postId);

  const remove = supabase.from("share_posts").delete().eq("id", postId);
  // An admin deletes any post; everyone else only ever their own.
  const { data, error } = await (profile.role === "admin"
    ? remove
    : remove.eq("author_id", profile.id)
  ).select("id");

  if (error || !data || data.length === 0) {
    redirect(`/share/${postId}?error=delete`);
  }

  await removeImages(
    supabase,
    "share-images",
    (images ?? []).map((image) => image.storage_path),
  );

  revalidatePath("/share");
  revalidatePath("/me");
  redirect("/share?deleted=1");
}
