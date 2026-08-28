import { createClient } from "@/lib/supabase/server";
import { requireAdminProfile } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { addQuestion, toggleQuestion, updateQuestion } from "./actions";

export const dynamic = "force-dynamic";

/** T18 / R26. */
export default async function QuestionsPage() {
  await requireAdminProfile();
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("school_review_questions")
    .select("id, text, sort_order, is_active")
    .order("sort_order", { ascending: true });

  const rows = questions ?? [];

  return (
    <main>
      <h1>평가 질문 관리</h1>
      <p className="muted">
        전국 공통 질문 세트입니다. 비활성화한 질문은 새 평가 화면에서 사라지지만,
        이미 매겨진 점수와 평균은 학교 상세에 그대로 남습니다.
      </p>

      <form action={addQuestion} className="card">
        <h3>질문 추가</h3>
        <div className="field">
          <label htmlFor="text">질문 내용</label>
          <input id="text" name="text" type="text" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="sort_order">표시 순서</label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            defaultValue={rows.length + 1}
          />
        </div>
        <SubmitButton className="btn-primary" pendingLabel="추가 중…">
          추가
        </SubmitButton>
      </form>

      <h2>등록된 질문 ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="notice notice-info">
          등록된 질문이 없습니다. 질문이 하나도 없으면 교사가 학교를 평가할 수
          없습니다.
        </p>
      ) : (
        <ul className="list-reset">
          {rows.map((question) => (
            <li key={question.id} className="card">
              <form action={updateQuestion}>
                <input type="hidden" name="id" value={question.id} />
                <div className="row" style={{ marginBottom: 8 }}>
                  {question.is_active ? (
                    <span className="tag tag-available">활성</span>
                  ) : (
                    <span className="tag tag-plain">비활성</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor={`text-${question.id}`}>질문 내용</label>
                  <input
                    id={`text-${question.id}`}
                    name="text"
                    type="text"
                    defaultValue={question.text}
                    maxLength={200}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor={`order-${question.id}`}>표시 순서</label>
                  <input
                    id={`order-${question.id}`}
                    name="sort_order"
                    type="number"
                    defaultValue={question.sort_order}
                  />
                </div>
                <SubmitButton className="" pendingLabel="저장 중…">
                  수정 저장
                </SubmitButton>
              </form>

              <form action={toggleQuestion} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={question.id} />
                <input
                  type="hidden"
                  name="next_active"
                  value={question.is_active ? "false" : "true"}
                />
                <SubmitButton
                  className={question.is_active ? "btn-danger" : ""}
                  pendingLabel="처리 중…"
                >
                  {question.is_active ? "비활성화" : "다시 활성화"}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
