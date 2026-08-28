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

export const dynamic = "force-dynamic";

/**
 * T13 / R18. 소모임 and 번개모임 are one list split by `kind`. No taxonomy and
 * no search box — those belong to the share tab only.
 */
export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; deleted?: string }>;
}) {
  await requireApprovedProfile();
  const { kind: rawKind, deleted } = await searchParams;
  const kind: ClubKind = isClubKind(rawKind) ? rawKind : "club";
  const supabase = await createClient();

  const { data } = await supabase
    .from("club_posts")
    .select(
      "id, title, created_at, author:author_id (nickname), " +
        "images:club_post_images (storage_path, sort_order), " +
        "comments:club_comments (id)",
    )
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(50);

  type Row = {
    id: string;
    title: string;
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
    <main>
      <div className="spread">
        <h1>{label}</h1>
        <Link
          href={kind === "club" ? "/clubs/new" : `/clubs/new?kind=${kind}`}
          className="btn btn-primary"
        >
          {label} 열기
        </Link>
      </div>
      <p className="muted">{CLUB_KIND_BLURBS[kind]}</p>

      {deleted ? (
        <p className="notice notice-info">글을 삭제했습니다.</p>
      ) : null}

      <KindTabs active={kind} />

      {rows.length === 0 ? (
        <p className="notice notice-info">아직 {label} 글이 없습니다.</p>
      ) : (
        <ul className="list-reset">
          {rows.map((post) => {
            const first = [...post.images].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0];
            const cover = first ? urls.get(first.storage_path) : undefined;

            return (
              <li key={post.id}>
                <Link href={`/clubs/${post.id}`} className="card" style={{ display: "block" }}>
                  <div className="row" style={{ flexWrap: "nowrap", gap: 12 }}>
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={cover}
                        alt=""
                        className="thumb"
                        style={{ width: 96, flex: "0 0 96px" }}
                      />
                    ) : null}
                    <div className="grow">
                      <h3>{post.title}</h3>
                      <p className="muted" style={{ margin: 0 }}>
                        {post.author?.nickname ?? "알 수 없음"} ·{" "}
                        {formatDate(post.created_at)} · 댓글 {post.comments.length}개
                      </p>
                    </div>
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
