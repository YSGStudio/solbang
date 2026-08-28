import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { formatCarbon, formatDate } from "@/lib/format";
import { StatusTag } from "@/components/StatusTag";
import type { ShareStatus } from "@/lib/categories";
import { ProfileForm } from "./form";

export const dynamic = "force-dynamic";

/** T19 / R17, R27, R28, R29. */
export default async function MePage() {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();

  const [{ data: school }, { data: carbon }, { data: sharePosts }, { data: clubPosts }] =
    await Promise.all([
      profile.school_id
        ? supabase
            .from("schools")
            .select("id, name, address")
            .eq("id", profile.school_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // R17: completed posts only. Own row only — there is no leaderboard.
      supabase
        .from("user_carbon_totals")
        .select("total_carbon_g, completed_count")
        .eq("user_id", profile.id)
        .maybeSingle(),
      supabase
        .from("share_posts")
        .select("id, title, status, category, created_at")
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("club_posts")
        .select("id, title, category, created_at")
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false }),
    ]);

  const totalCarbon = carbon?.total_carbon_g ?? 0;
  const completedCount = carbon?.completed_count ?? 0;

  return (
    <main>
      <h1>내 설정</h1>

      <div className="card">
        <span className="muted">지금까지 아낀 탄소</span>
        <div className="big-number">{formatCarbon(Number(totalCarbon))}</div>
        <p className="muted" style={{ marginBottom: 0 }}>
          나눔 완료 {completedCount}건 기준입니다. 예약 중인 글은 아직 포함되지
          않습니다.
        </p>
      </div>

      <ProfileForm
        nickname={profile.nickname}
        fullName={profile.full_name}
        email={profile.email}
        school={school ?? null}
      />

      <h2>내가 쓴 나눔 글 ({sharePosts?.length ?? 0})</h2>
      {sharePosts && sharePosts.length > 0 ? (
        <ul className="list-reset">
          {sharePosts.map((post) => (
            <li key={post.id}>
              <Link href={`/share/${post.id}`} className="card" style={{ display: "block" }}>
                <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                  <StatusTag status={post.status as ShareStatus} />
                  <span className="tag tag-plain">{post.category}</span>
                </div>
                <h3>{post.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {formatDate(post.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">아직 쓴 나눔 글이 없습니다.</p>
      )}

      <h2>내가 쓴 소모임 글 ({clubPosts?.length ?? 0})</h2>
      {clubPosts && clubPosts.length > 0 ? (
        <ul className="list-reset">
          {clubPosts.map((post) => (
            <li key={post.id}>
              <Link href={`/clubs/${post.id}`} className="card" style={{ display: "block" }}>
                <span className="tag tag-plain">{post.category}</span>
                <h3 style={{ marginTop: 4 }}>{post.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {formatDate(post.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">아직 쓴 소모임 글이 없습니다.</p>
      )}
    </main>
  );
}
