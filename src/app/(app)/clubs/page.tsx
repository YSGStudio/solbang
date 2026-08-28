import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { isSchoolLevel } from "@/lib/categories";
import { CategoryFilter } from "@/components/CategoryFilter";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** T13 / R8, R18. */
export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; category?: string }>;
}) {
  await requireApprovedProfile();
  const { level, category } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("club_posts")
    .select(
      "id, title, category, created_at, author:author_id (nickname), " +
        "images:club_post_images (storage_path, sort_order)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (isSchoolLevel(level)) query = query.eq("school_level", level);
  if (category) query = query.eq("category", category);

  const { data } = await query;

  type Row = {
    id: string;
    title: string;
    category: string;
    created_at: string;
    author: { nickname: string } | null;
    images: { storage_path: string; sort_order: number }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  const covers = rows.flatMap((post) => {
    const first = [...post.images].sort((a, b) => a.sort_order - b.sort_order)[0];
    return first ? [first.storage_path] : [];
  });
  const urls = await signedUrlsFor(supabase, "club-images", covers);

  return (
    <main>
      <div className="spread">
        <h1>소모임</h1>
        <Link href="/clubs/new" className="btn btn-primary">
          소모임 열기
        </Link>
      </div>
      <p className="muted">함께할 선생님을 모아 보세요.</p>

      <CategoryFilter />

      {rows.length === 0 ? (
        <p className="notice notice-info">
          조건에 맞는 소모임 글이 아직 없습니다.
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
                      <span className="tag tag-plain">{post.category}</span>
                      <h3 style={{ marginTop: 4 }}>{post.title}</h3>
                      <p className="muted" style={{ margin: 0 }}>
                        {post.author?.nickname ?? "알 수 없음"} ·{" "}
                        {formatDate(post.created_at)}
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
