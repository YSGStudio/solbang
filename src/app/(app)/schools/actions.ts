"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";

/**
 * R24. One review per user per school; re-rating overwrites. (AC14)
 * The unique constraints in migration 5 are what guarantee it.
 */
export async function submitSchoolReview(formData: FormData): Promise<void> {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const schoolId = String(formData.get("school_id") ?? "");

  const scores: { questionId: string; score: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("q:")) continue;
    const score = Number(value);
    if (Number.isInteger(score) && score >= 1 && score <= 5) {
      scores.push({ questionId: key.slice(2), score });
    }
  }

  if (scores.length === 0) {
    redirect(`/schools/${schoolId}?error=empty`);
  }

  // Upsert the review row first so re-rating reuses it rather than adding one.
  const { data: review, error: reviewError } = await supabase
    .from("school_reviews")
    .upsert(
      { school_id: schoolId, user_id: profile.id },
      { onConflict: "school_id,user_id" },
    )
    .select("id")
    .single();

  if (reviewError || !review) {
    redirect(`/schools/${schoolId}?error=save`);
  }

  const { error: answerError } = await supabase
    .from("school_review_answers")
    .upsert(
      scores.map((entry) => ({
        review_id: review.id,
        question_id: entry.questionId,
        score: entry.score,
      })),
      { onConflict: "review_id,question_id" },
    );

  if (answerError) {
    redirect(`/schools/${schoolId}?error=save`);
  }

  revalidatePath(`/schools/${schoolId}`);
  redirect(`/schools/${schoolId}?saved=1`);
}
