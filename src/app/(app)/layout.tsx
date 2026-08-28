import Link from "next/link";
import { requireApprovedProfile } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireApprovedProfile();

  return (
    <div className="shell">
      <header className="topbar">
        <strong>교사 나눔터</strong>
        <div className="row" style={{ gap: 6 }}>
          <span className="muted">{profile.nickname}</span>
          {profile.role === "admin" ? (
            <Link href="/admin/approvals" className="tag tag-plain">
              관리자
            </Link>
          ) : null}
          <form action={signOut}>
            <button type="submit" style={{ minHeight: 32, padding: "4px 10px" }}>
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <TabBar />
      {children}
    </div>
  );
}
