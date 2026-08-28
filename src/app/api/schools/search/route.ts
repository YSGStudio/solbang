import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createKakaoClient } from "@/lib/kakao";
import { createSchoolSearchStore } from "@/lib/schoolSearchStore";
import { searchSchools } from "@/lib/schoolSearch";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/schools/search?q=언남
 *
 * The client types into this; the Kakao REST key stays on the server. (R21, AC12)
 * Cache lookup, Kakao call and the writes to `schools` / the cache tables all
 * happen behind searchSchools(). (R22, R30-R34)
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  // R21 says approved teachers, but R1 has the signup form pick a school
  // before an account exists at all. So: a signed-in account is let straight
  // through, and an anonymous caller (the signup form) is allowed but rate
  // limited so it cannot be used as a free Kakao proxy. Cached queries never
  // reach Kakao either way. See "PRD와 달라진 점" in the report.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, retryAfterSeconds } = rateLimit(
      `schools-search:${ip}`,
      20,
      60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "retry-after": String(retryAfterSeconds) },
        },
      );
    }
  }

  try {
    const outcome = await searchSchools(
      {
        store: createSchoolSearchStore(createAdminClient()),
        kakao: createKakaoClient(),
      },
      query,
    );

    return NextResponse.json(
      { results: outcome.results },
      // `source` is a debugging aid; it never carries the key or the raw response.
      { headers: { "x-school-search-source": outcome.source } },
    );
  } catch (error) {
    console.error("[schools/search]", error);
    return NextResponse.json(
      { error: "학교 검색에 실패했습니다" },
      { status: 502 },
    );
  }
}
