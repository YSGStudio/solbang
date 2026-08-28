import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { approveUser, rejectUser } from "./actions";

export const dynamic = "force-dynamic";

/** T5 / R3. Email, name, school and applied-at for every pending account. (AC2) */
export default async function ApprovalsPage() {
  await requireAdminProfile();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, nickname, created_at, school:school_id (name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  type Row = {
    id: string;
    email: string;
    full_name: string;
    nickname: string;
    created_at: string;
    school: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main>
      <h1>가입 승인</h1>
      <p className="muted">
        승인하면 즉시 나눔·소모임·학교정보를 이용할 수 있습니다. 거절하면 어떤
        데이터에도 접근하지 못합니다.
      </p>

      {error ? (
        <p className="notice notice-error">목록을 불러오지 못했습니다.</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="notice notice-info">대기 중인 가입 신청이 없습니다.</p>
      ) : (
        <ul className="list-reset">
          {rows.map((row) => (
            <li key={row.id} className="card">
              <h3>
                {row.full_name}{" "}
                <span className="muted">({row.nickname})</span>
              </h3>
              <p className="muted" style={{ marginTop: 0 }}>
                {row.email}
                <br />
                {row.school?.name ?? "학교 미선택"}
                <br />
                신청일 {formatDateTime(row.created_at)}
              </p>

              <div className="row">
                <form action={approveUser}>
                  <input type="hidden" name="user_id" value={row.id} />
                  <SubmitButton className="btn-primary" pendingLabel="승인 중…">
                    승인
                  </SubmitButton>
                </form>
                <form action={rejectUser}>
                  <input type="hidden" name="user_id" value={row.id} />
                  <SubmitButton className="btn-danger" pendingLabel="거절 중…">
                    거절
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
