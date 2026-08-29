import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { isBoardCareerStage, isBoardTopic } from "@/lib/categories";
import { BoardFilter } from "@/components/BoardFilter";

export const dynamic = "force-dynamic";

/** 게시판: a plain board. No taxonomy, no search box. (migration 10) */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; topic?: string; deleted?: string }>;
}) {
  await requireApprovedProfile();
  const { stage, topic, deleted } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("board_posts")
    .select(
      "id, title, career_stage, topic, created_at, author:author_id (nickname), " +
        "images:board_post_images (storage_path, sort_order), " +
        "comments:board_comments (id)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // 색인: 두 축은 서로 독립이라 각각 걸 수 있다.
  if (isBoardCareerStage(stage)) query = query.eq("career_stage", stage);
  if (isBoardTopic(topic)) query = query.eq("topic", topic);

  const { data } = await query;

  type Row = {
    id: string;
    title: string;
    career_stage: string;
    topic: string;
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

      <BoardFilter />

      {isBoardCareerStage(stage) || isBoardTopic(topic) ? (
        <p className="muted">
          {[stage, topic].filter(Boolean).join(" · ")} · {rows.length}개
        </p>
      ) : null}

      {deleted ? (
        <p className="notice notice-info">글을 삭제했습니다.</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="notice notice-info">
          {isBoardCareerStage(stage) || isBoardTopic(topic)
            ? "조건에 맞는 글이 아직 없습니다."
            : "아직 올라온 글이 없습니다."}
        </p>
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
                      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                        <span className="tag tag-plain">{post.career_stage}</span>
                        <span className="tag tag-plain">{post.topic}</span>
                      </div>
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
