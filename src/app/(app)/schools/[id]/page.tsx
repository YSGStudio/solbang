import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { StarRating } from "@/components/StarRating";
import { SubmitButton } from "@/components/SubmitButton";
import { formatScore } from "@/lib/format";
import { submitSchoolReview } from "../actions";

export const dynamic = "force-dynamic";

/** T17 / R23, R24, R25. */
export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await requireApprovedProfile();
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const { data: school } = await supabase
    .from("schools")
    .select("id, name, address")
    .eq("id", id)
    .maybeSingle();

  if (!school) notFound();

  const [{ data: summaryRows }, { data: questions }, { data: myReview }] =
    await Promise.all([
      supabase
        .from("school_rating_summary")
        .select("*")
        .eq("school_id", id),
      // R26: only active questions appear on the form.
      supabase
        .from("school_review_questions")
        .select("id, text, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("school_reviews")
        .select("id, answers:school_review_answers (question_id, score)")
        .eq("school_id", id)
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]);

  type Summary = {
    question_id: string | null;
    question_text: string | null;
    question_sort_order: number | null;
    question_is_active: boolean | null;
    average_score: number | null;
    answer_count: number;
    reviewer_count: number;
  };

  const rows = (summaryRows ?? []) as unknown as Summary[];
  const overall = rows.find((row) => row.question_id === null);
  // AC15: keeps retired questions that still carry answers.
  const perQuestion = rows
    .filter((row) => row.question_id !== null)
    .sort(
      (a, b) => (a.question_sort_order ?? 999) - (b.question_sort_order ?? 999),
    );

  const myScores = new Map(
    (
      (myReview?.answers ?? []) as unknown as {
        question_id: string;
        score: number;
      }[]
    ).map((a) => [a.question_id, a.score]),
  );

  return (
    <main>
      <p className="muted">
        <Link href="/schools">← 학교 검색</Link>
      </p>

      <h1>{school.name}</h1>
      <p className="muted">{school.address ?? "주소 정보 없음"}</p>

      {saved ? <p className="notice notice-info">평가를 저장했습니다.</p> : null}
      {error ? (
        <p className="notice notice-error">
          {error === "empty"
            ? "별점을 하나 이상 선택해 주세요."
            : "평가를 저장하지 못했습니다."}
        </p>
      ) : null}

      <div className="card">
        <div className="spread">
          <div>
            <span className="muted">전체 평균</span>
            <div className="big-number">
              {formatScore(overall?.average_score ?? null)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="muted">참여자</span>
            <div className="big-number">{overall?.reviewer_count ?? 0}명</div>
          </div>
        </div>
      </div>

      <h2>질문별 평균</h2>
      {perQuestion.length === 0 ? (
        <p className="notice notice-info">
          아직 평가가 없습니다. 첫 평가를 남겨 주세요.
        </p>
      ) : (
        <ul className="list-reset">
          {perQuestion.map((row) => (
            <li key={row.question_id} className="card">
              <div className="spread">
                <div className="grow">
                  <strong>{row.question_text ?? "삭제된 질문"}</strong>
                  {row.question_is_active === false ? (
                    <span className="tag tag-plain" style={{ marginLeft: 6 }}>
                      비활성
                    </span>
                  ) : null}
                  <div className="muted">{row.answer_count}명 응답</div>
                </div>
                <strong style={{ fontSize: "1.25rem" }}>
                  {formatScore(row.average_score)}
                </strong>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>{myReview ? "내 평가 수정" : "이 학교 평가하기"}</h2>
      {questions && questions.length > 0 ? (
        <form action={submitSchoolReview}>
          <input type="hidden" name="school_id" value={school.id} />
          {questions.map((question) => (
            <StarRating
              key={question.id}
              name={`q:${question.id}`}
              label={question.text}
              defaultValue={myScores.get(question.id) ?? 0}
            />
          ))}
          <p className="muted">
            한 학교에는 평가를 하나만 남길 수 있습니다. 다시 제출하면 이전 평가를
            덮어씁니다.
          </p>
          <SubmitButton className="btn-primary btn-block" pendingLabel="저장 중…">
            {myReview ? "평가 수정하기" : "평가 남기기"}
          </SubmitButton>
        </form>
      ) : (
        <p className="notice notice-warn">
          등록된 평가 질문이 없습니다. 운영자가 질문을 등록하면 평가할 수 있습니다.
        </p>
      )}
    </main>
  );
}
