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
    <main>
      <h1>학교 정보</h1>
      <p className="muted">
        학교를 검색해 다른 선생님들이 남긴 별점을 보고, 직접 평가할 수 있습니다.
      </p>

      {mySchool ? (
        <div className="card">
          <span className="tag tag-plain">내 학교</span>
          <h3 style={{ marginTop: 6 }}>
            <a href={`/schools/${mySchool.id}`}>
              <u>{mySchool.name}</u>
            </a>
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {mySchool.address ?? "주소 정보 없음"}
          </p>
        </div>
      ) : null}

      <SchoolSearchPanel />
    </main>
  );
}
