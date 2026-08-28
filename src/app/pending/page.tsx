import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

/**
 * R2, R5. Shown to every account that is not approved.
 *
 * This screen reads the caller's own profile row, which is the single
 * deliberate exception to the is_approved() read policy. (AC1)
 */
export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string }>;
}) {
  const { signup } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, nickname, status, email")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const rejected = profile?.status === "rejected";

  return (
    <main className="center-page">
      <h1>{rejected ? "가입이 거절되었습니다" : "승인 대기 중입니다"}</h1>

      {signup === "1" ? (
        <p className="notice notice-info">
          가입 신청이 접수되었습니다. 이메일 확인 메일이 갔다면 먼저 확인해 주세요.
        </p>
      ) : null}

      <div className="card">
        {rejected ? (
          <>
            <p>
              운영자가 이 계정의 가입 신청을 거절했습니다. 나눔, 소모임, 학교정보의
              어떤 내용도 볼 수 없습니다.
            </p>
            <p className="muted">
              현직 교사가 맞는데 거절되었다면 학교명과 성함을 확인한 뒤 운영자에게
              문의해 주세요.
            </p>
          </>
        ) : (
          <>
            <p>
              {profile?.full_name
                ? `${profile.full_name} 선생님, 신청이 접수되었습니다.`
                : "신청이 접수되었습니다."}{" "}
              운영자가 현직 교사 여부를 확인한 뒤 승인합니다.
            </p>
            <p className="muted">
              승인되면 나눔, 소모임, 학교정보 탭을 모두 이용할 수 있습니다.
              승인 전에는 게시글을 읽을 수 없습니다.
            </p>
          </>
        )}

        <hr className="divider" />
        <p className="muted">
          계정: {profile?.email ?? user?.email ?? "-"}
          <br />
          상태: {rejected ? "거절됨" : "승인 대기"}
        </p>
      </div>

      <form action={signOut}>
        <button type="submit" className="btn-block">
          로그아웃
        </button>
      </form>
    </main>
  );
}
