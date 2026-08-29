import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import {
  isGradeBand,
  isSchoolLevel,
  isShareCategory,
  isSubject,
  type ShareStatus,
} from "@/lib/categories";
import { CategoryFilter } from "@/components/CategoryFilter";
import { StatusTag } from "@/components/StatusTag";
import { signedUrlsFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { distanceKm, parseDistanceKm } from "@/lib/distance";
import { ShareMap, type ShareMapSchool } from "@/components/ShareMap";
import { ViewTabs } from "@/components/ViewTabs";
import { isShareView, type ShareView } from "@/lib/shareView";

export const dynamic = "force-dynamic";

/** T9 / R8, R11. Filterable list with the status tag on every card. (AC5) */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{
    level?: string;
    category?: string;
    subject?: string;
    grade?: string;
    distance?: string;
    q?: string;
    school?: string;
    view?: string;
    deleted?: string;
  }>;
}) {
  const profile = await requireApprovedProfile();
  const { level, category, subject, grade, distance, q, school, view, deleted } =
    await searchParams;
  const schoolFilter = school?.trim() ?? "";
  const activeView: ShareView = isShareView(view) ? view : "list";
  const radiusKm = parseDistanceKm(distance);
  const searchText = q?.trim().toLocaleLowerCase("ko") ?? "";
  const supabase = await createClient();

  const { data: mySchoolData } = profile.school_id
    ? await supabase.from("schools").select("id, name, lat, lng").eq("id", profile.school_id).maybeSingle()
    : { data: null };

  let query = supabase
    .from("share_posts")
    .select(
      "id, title, school_level, category, subject, grade_band, condition, status, carbon_g, created_at, " +
        "author:author_id (nickname, school:school_id (id, name, lat, lng)), images:share_post_images (storage_path, sort_order)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // R8: no filter means everything. Level, 대분류 and 과목 are independent axes.
  if (isSchoolLevel(level)) query = query.eq("school_level", level);
  if (isShareCategory(category)) query = query.eq("category", category);
  if (isSubject(subject)) query = query.eq("subject", subject);
  if (isGradeBand(grade)) query = query.eq("grade_band", grade);

  const { data: posts, error } = await query;

  type Row = {
    id: string;
    title: string;
    school_level: "elementary" | "secondary";
    category: string;
    subject: string | null;
    grade_band: string | null;
    condition: string;
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
    // The search box matches the taxonomy as well as the title, so typing
    // "과학" finds subject-tagged posts without touching the dropdowns.
    const haystack = `${post.title} ${post.category} ${post.subject ?? ""} ${post.grade_band ?? ""}`
      .toLocaleLowerCase("ko");
    if (searchText && !haystack.includes(searchText)) return false;
    const postSchool = post.author?.school;
    if (!mySchool || !postSchool || postSchool.lat === null || postSchool.lng === null) {
      return false;
    }
    // Set by a map marker: show just that school's items.
    if (schoolFilter && postSchool.id !== schoolFilter) return false;
    return distanceKm(mySchool, { lat: postSchool.lat, lng: postSchool.lng }) <= radiusKm;
  });

  const covers = rows.flatMap((post) => {
    const first = [...post.images].sort((a, b) => a.sort_order - b.sort_order)[0];
    return first ? [first.storage_path] : [];
  });
  const urls = await signedUrlsFor(supabase, "share-images", covers);

  function schoolHref(schoolId: string): string {
    const query = new URLSearchParams();
    if (isSchoolLevel(level)) query.set("level", level);
    if (isShareCategory(category)) query.set("category", category);
    if (isSubject(subject)) query.set("subject", subject);
    if (isGradeBand(grade)) query.set("grade", grade);
    query.set("distance", String(radiusKm));
    if (q?.trim()) query.set("q", q.trim());
    query.set("school", schoolId);
    // No `view`: the point of the click is to leave the map for the list.
    return `/share?${query.toString()}`;
  }

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
      href: schoolHref(school.id),
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

      {deleted ? (
        <p className="notice notice-info">나눔 글을 삭제했습니다.</p>
      ) : null}

      <CategoryFilter />

      <ViewTabs active={activeView} />

      {schoolFilter ? (
        <p className="notice notice-info">
          {rows[0]?.author?.school?.name ?? "선택한 학교"}의 나눔 글만 보고
          있습니다 ({rows.length}개).{" "}
          <Link href={`/share?distance=${radiusKm}`}><u>전체 보기</u></Link>
        </p>
      ) : null}

      {!mySchool ? (
        <p className="notice notice-warn">
          거리별 나눔을 보려면 좌표가 등록된 나의 학교가 필요합니다. <Link href="/me"><u>내 정보에서 학교 설정하기</u></Link>
        </p>
      ) : null}

      {error ? (
        <p className="notice notice-error">목록을 불러오지 못했습니다.</p>
      ) : null}

      {activeView === "map" ? (
        mySchool ? (
          <>
            <div className="spread">
              <h2 style={{ marginTop: 4 }}>내 학교 주변 지도</h2>
              <span className="muted">{mySchool.name} 기준 {radiusKm}km</span>
            </div>
            <ShareMap
              center={mySchool}
              radiusKm={radiusKm}
              schools={[...mapSchoolById.values()]}
            />
            <p className="muted">
              지도에 표시된 학교 {mapSchoolById.size}곳 · 나눔 글 {rows.length}개
            </p>
          </>
        ) : null
      ) : rows.length === 0 ? (
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
                        {post.subject || post.grade_band ? (
                          <span className="tag tag-plain">
                            {post.subject ?? post.grade_band}
                          </span>
                        ) : null}
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
