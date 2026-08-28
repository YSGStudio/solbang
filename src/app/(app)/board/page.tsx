import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 게시판: a plain board. No taxonomy, no search box. (migration 10) */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireApprovedProfile();
  const { deleted } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("board_posts")
    .select(
      "id, title, created_at, author:author_id (nickname), " +
        "images:board_post_images (storage_path, sort_order), " +
        "comments:board_comments (id)",
    )
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
  const urls = await signedUrlsFor(supabase, "board-images", covers);

  return (
    <main>
      <div className="spread">
        <h1>게시판</h1>
        <Link href="/board/new" className="btn btn-primary">
          글쓰기
        </Link>
      </div>
      <p className="muted">선생님들과 자유롭게 이야기를 나눠 보세요.</p>

      {deleted ? (
        <p className="notice notice-info">글을 삭제했습니다.</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="notice notice-info">아직 올라온 글이 없습니다.</p>
      ) : (
        <ul className="list-reset">
          {rows.map((post) => {
            const first = [...post.images].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0];
            const cover = first ? urls.get(first.storage_path) : undefined;

            return (
              <li key={post.id}>
                <Link href={`/board/${post.id}`} className="card" style={{ display: "block" }}>
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
