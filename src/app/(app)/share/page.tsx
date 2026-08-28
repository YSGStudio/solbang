import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { isSchoolLevel, type ShareStatus } from "@/lib/categories";
import { CategoryFilter } from "@/components/CategoryFilter";
import { StatusTag } from "@/components/StatusTag";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { distanceKm, parseDistanceKm } from "@/lib/distance";
import { ShareMap, type ShareMapSchool } from "@/components/ShareMap";

export const dynamic = "force-dynamic";

/** T9 / R8, R11. Filterable list with the status tag on every card. (AC5) */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; category?: string; distance?: string; q?: string }>;
}) {
  const profile = await requireApprovedProfile();
  const { level, category, distance, q } = await searchParams;
  const radiusKm = parseDistanceKm(distance);
  const searchText = q?.trim().toLocaleLowerCase("ko") ?? "";
  const supabase = await createClient();

  const { data: mySchoolData } = profile.school_id
    ? await supabase.from("schools").select("id, name, lat, lng").eq("id", profile.school_id).maybeSingle()
    : { data: null };

  let query = supabase
    .from("share_posts")
    .select(
      "id, title, school_level, category, status, carbon_g, created_at, " +
        "author:author_id (nickname, school:school_id (id, name, lat, lng)), images:share_post_images (storage_path, sort_order)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // R8: no filter means everything.
  if (isSchoolLevel(level)) query = query.eq("school_level", level);
  if (category) query = query.eq("category", category);

  const { data: posts, error } = await query;

  type Row = {
    id: string;
    title: string;
    school_level: "elementary" | "secondary";
    category: string;
    status: ShareStatus;
    carbon_g: number;
    created_at: string;
    author: { nickname: string; school: { id: string; name: string; lat: number | null; lng: number | null } | null } | null;
    images: { storage_path: string; sort_order: number }[];
  };

  const allRows = (posts ?? []) as unknown as Row[];
  const mySchool = mySchoolData && mySchoolData.lat !== null && mySchoolData.lng !== null
    ? { name: mySchoolData.name, lat: mySchoolData.lat, lng: mySchoolData.lng }
    : null;
  const rows = allRows.filter((post) => {
    if (searchText && !`${post.title} ${post.category}`.toLocaleLowerCase("ko").includes(searchText)) return false;
    const school = post.author?.school;
    if (!mySchool || !school || school.lat === null || school.lng === null) return false;
    return distanceKm(mySchool, { lat: school.lat, lng: school.lng }) <= radiusKm;
  });

  const covers = rows.flatMap((post) => {
    const first = [...post.images].sort((a, b) => a.sort_order - b.sort_order)[0];
    return first ? [first.storage_path] : [];
  });
  const urls = await signedUrlsFor(supabase, "share-images", covers);

  const mapSchoolById = new Map<string, ShareMapSchool>();
  for (const post of rows) {
    const school = post.author?.school;
    if (!school || school.lat === null || school.lng === null) continue;
    const existing = mapSchoolById.get(school.id);
    if (existing) {
      existing.itemCount += 1;
      continue;
    }
    const first = [...post.images].sort((a, b) => a.sort_order - b.sort_order)[0];
    mapSchoolById.set(school.id, {
      id: school.id,
      name: school.name,
      lat: school.lat,
      lng: school.lng,
      imageUrl: first ? urls.get(first.storage_path) : undefined,
      postId: post.id,
      itemCount: 1,
    });
  }

  return (
    <main>
      <div className="spread">
        <h1>나눔</h1>
        <Link href="/share/new" className="btn btn-primary">
          나눔 글 쓰기
        </Link>
      </div>
      <p className="muted">쓰던 교육용 물건을 다른 선생님께 나눠 주세요.</p>

      <CategoryFilter />

      {!mySchool ? (
        <p className="notice notice-warn">
          거리별 나눔을 보려면 좌표가 등록된 나의 학교가 필요합니다. <Link href="/me"><u>내 정보에서 학교 설정하기</u></Link>
        </p>
      ) : (
        <>
          <div className="spread">
            <h2 style={{ marginTop: 4 }}>내 학교 주변 지도</h2>
            <span className="muted">{mySchool.name} 기준 {radiusKm}km</span>
          </div>
          <ShareMap center={mySchool} radiusKm={radiusKm} schools={[...mapSchoolById.values()]} />
        </>
      )}

      {error ? (
        <p className="notice notice-error">목록을 불러오지 못했습니다.</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="notice notice-info">
          조건에 맞는 나눔 글이 아직 없습니다.
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
                <Link href={`/share/${post.id}`} className="card" style={{ display: "block" }}>
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
                        <StatusTag status={post.status} />
                        <span className="tag tag-plain">{post.category}</span>
                      </div>
                      <h3>{post.title}</h3>
                      <p className="muted" style={{ margin: 0 }}>
                        {post.author?.nickname ?? "알 수 없음"} ·{" "}
                        {post.author?.school?.name ?? "학교 미설정"} · {formatDate(post.created_at)}
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
