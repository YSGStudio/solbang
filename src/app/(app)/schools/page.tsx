import { requireApprovedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SchoolSearchPanel } from "./panel";

export const dynamic = "force-dynamic";

/** T14, T17 / R21. Search only — no map is rendered (Non-Goals). */
export default async function SchoolsPage() {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const { data: mySchool } = profile.school_id
    ? await supabase
        .from("schools")
        .select("id, name, address")
        .eq("id", profile.school_id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="school-detail-page school-directory-page">
      <header className="school-detail-hero school-directory-hero">
        <div className="school-detail-heading">
          <span className="school-detail-icon" aria-hidden="true">🏫</span>
          <div className="grow">
            <span className="school-eyebrow">SCHOOL INFORMATION</span>
            <h1>학교 정보</h1>
            <p>학교를 찾아 선생님들의 평가를 확인하고 내 경험도 나눠 보세요.</p>
          </div>
        </div>
      </header>

      {mySchool ? (
        <section className="school-home-section">
          <div className="school-home-section-heading">
            <div>
              <span className="school-eyebrow">MY SCHOOL</span>
              <h2>내 학교</h2>
            </div>
            <span className="school-mine-badge">등록 완료</span>
          </div>
          <a href={`/schools/${mySchool.id}`} className="school-my-card">
            <span className="school-my-card-icon" aria-hidden="true">📍</span>
            <span className="grow">
              <strong>{mySchool.name}</strong>
              <small>{mySchool.address ?? "주소 정보 없음"}</small>
            </span>
            <span className="school-card-arrow" aria-hidden="true">→</span>
          </a>
        </section>
      ) : (
        <section className="school-home-section school-empty-my-school">
          <span className="school-my-card-icon" aria-hidden="true">📍</span>
          <div className="grow">
            <strong>내 학교가 아직 등록되지 않았어요</strong>
            <p>학교를 설정하면 평가를 남길 수 있습니다.</p>
          </div>
          <a href="/me" className="btn">학교 설정</a>
        </section>
      )}

      <SchoolSearchPanel />
    </main>
  );
}
