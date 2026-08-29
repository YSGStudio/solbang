import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import {
  CLUB_KIND_BLURBS,
  CLUB_KIND_LABELS,
  isClubKind,
  type ClubKind,
} from "@/lib/categories";
import { KindTabs } from "@/components/KindTabs";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { FlashCalendar } from "@/components/FlashCalendar";
import {
  dayKey,
  formatMeetAt,
  monthKey,
  monthRange,
} from "@/lib/meetTime";

export const dynamic = "force-dynamic";

/**
 * T13 / R18. 소모임 and 번개모임 are one list split by `kind`. No taxonomy and
 * no search box — those belong to the share tab only.
 */
export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; month?: string; deleted?: string }>;
}) {
  await requireApprovedProfile();
  const { kind: rawKind, month: rawMonth, deleted } = await searchParams;
  const kind: ClubKind = isClubKind(rawKind) ? rawKind : "club";
  const supabase = await createClient();

  // 번개모임은 달력이 보고 있는 달만, 만나는 시각 순서로 본다.
  // 소모임은 예전처럼 최신순 전체.
  const isFlash = kind === "flash";
  const now = new Date();
  const month = rawMonth && monthRange(rawMonth) ? rawMonth : monthKey(now);
  const range = monthRange(month);

  let query = supabase
    .from("club_posts")
    .select(
      "id, title, meet_at, created_at, author:author_id (nickname), " +
        "images:club_post_images (storage_path, sort_order), " +
        "comments:club_comments (id)",
    )
    .eq("kind", kind)
    .limit(50);

  if (isFlash && range) {
    query = query
      .gte("meet_at", range.start)
      .lt("meet_at", range.end)
      .order("meet_at", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data } = await query;

  type Row = {
    id: string;
    title: string;
    meet_at: string | null;
    created_at: string;
    author: { nickname: string } | null;
    images: { storage_path: string; sort_order: number }[];
    comments: { id: string }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  const covers = rows.flatMap((post) => {
    const first = [...post.images].sort((a, b) => a.sort_order - b.sort_order)[0];
    return first ? [first.storage_path] : [];
  });
  const urls = await signedUrlsFor(supabase, "club-images", covers);

  const label = CLUB_KIND_LABELS[kind];

  return (
    <main className={`clubs-page clubs-page-${kind}`}>
      <header className="clubs-list-hero">
        <div className="clubs-list-heading">
          <span className="clubs-list-icon" aria-hidden="true">{isFlash ? "⚡" : "👥"}</span>
          <div>
            <span className="clubs-list-eyebrow">{isFlash ? "QUICK MEETUP" : "TEACHER GROUP"}</span>
            <h1>{label}</h1>
            <p>{CLUB_KIND_BLURBS[kind]}</p>
          </div>
        </div>
        <Link
          href={kind === "club" ? "/clubs/new" : `/clubs/new?kind=${kind}`}
          className="btn btn-primary"
        >
          <span aria-hidden="true">＋</span> {label} 열기
        </Link>
      </header>

      {deleted ? (
        <p className="notice notice-info">글을 삭제했습니다.</p>
      ) : null}

      <KindTabs active={kind} />

      {isFlash ? (
        <FlashCalendar
          month={month}
          today={dayKey(now)}
          meetings={rows.flatMap((post) =>
            post.meet_at
              ? [{ id: post.id, title: post.title, meet_at: post.meet_at }]
              : [],
          )}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="notice notice-info">
          {isFlash
            ? "이 달에 잡힌 번개모임이 없습니다."
            : `아직 ${label} 글이 없습니다.`}
        </p>
      ) : (
        <ul className="list-reset club-post-list">
          {rows.map((post) => {
            const first = [...post.images].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0];
            const cover = first ? urls.get(first.storage_path) : undefined;

            return (
              <li key={post.id}>
                <Link href={`/clubs/${post.id}`} className="club-list-card">
                  <div className="club-list-card-body">
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={cover}
                        alt=""
                        className="club-list-cover"
                      />
                    ) : (
                      <span className="club-list-placeholder" aria-hidden="true">{isFlash ? "⚡" : "👥"}</span>
                    )}
                    <div className="grow club-list-copy">
                      {post.meet_at ? (
                        <span className="club-meet-badge">
                          <span aria-hidden="true">🗓</span> {formatMeetAt(post.meet_at)}
                        </span>
                      ) : <span className="club-type-badge">함께할 선생님 모집 중</span>}
                      <h3>{post.title}</h3>
                      <div className="club-card-meta">
                        <span>👤 {post.author?.nickname ?? "알 수 없음"}</span>
                        <span>📅 {formatDate(post.created_at)}</span>
                        <span>💬 {post.comments.length}</span>
                      </div>
                    </div>
                    <span className="club-list-arrow" aria-hidden="true">→</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
