import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth";
import { signOut } from "../(auth)/actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdminProfile();

  return (
    <div className="shell">
      <header className="topbar">
        <strong>관리자</strong>
        <div className="row" style={{ gap: 6 }}>
          <span className="muted">{profile.nickname}</span>
          <form action={signOut}>
            <button type="submit" style={{ minHeight: 32, padding: "4px 10px" }}>
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <nav className="row" style={{ marginBottom: 16 }}>
        <Link href="/admin/approvals" className="btn">
          가입 승인
        </Link>
        <Link href="/admin/questions" className="btn">
          평가 질문
        </Link>
        <Link href="/share" className="btn">
          서비스로 돌아가기
        </Link>
      </nav>

      {children}
    </div>
  );
}
