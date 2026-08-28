import "server-only";
import { serverEnv } from "@/lib/env";
import type { KakaoClient, KakaoPlace } from "@/lib/schoolSearch";

const KAKAO_KEYWORD_URL =
  "https://dapi.kakao.com/v2/local/search/keyword.json";

/** SC4 = 학교. (R21) */
const SCHOOL_CATEGORY_GROUP_CODE = "SC4";

interface KakaoDocument {
  id: string;
  place_name: string;
  road_address_name?: string;
  address_name?: string;
  x?: string; // longitude
  y?: string; // latitude
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The only place in the codebase that talks to Kakao.
 *
 * Reached exclusively from app/api/schools/search/route.ts, so the REST key
 * never reaches the browser (R21, AC12) and the call count stays countable
 * (AC18-AC20).
 */
export function createKakaoClient(): KakaoClient {
  return {
    async searchSchools(query: string): Promise<KakaoPlace[]> {
      const url = new URL(KAKAO_KEYWORD_URL);
      url.searchParams.set("query", query);
      url.searchParams.set("category_group_code", SCHOOL_CATEGORY_GROUP_CODE);
      url.searchParams.set("size", "15");

      const response = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${serverEnv.kakaoRestApiKey}`,
          // Kakao refuses the request without a KA header carrying an origin,
          // and that origin must be registered as a Web platform domain in the
          // developer console. Verified against the live API: omitting it gives
          // "KA Header is required but neither os nor origin field is given";
          // an unregistered origin gives "domain mismatched!".
          KA: `sdk/1.0.0 os/javascript origin/${serverEnv.kakaoOrigin}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        // Kakao explains itself in the body; without it a 401 is unreadable.
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Kakao local search failed: ${response.status} ${response.statusText} ${detail}`.trim(),
        );
      }

      const body = (await response.json()) as { documents?: KakaoDocument[] };

      // Keep only the six fields we store. Everything else is dropped.
      return (body.documents ?? []).map((d) => ({
        kakaoPlaceId: d.id,
        name: d.place_name,
        address: d.road_address_name || d.address_name || null,
        lat: toNumber(d.y),
        lng: toNumber(d.x),
      }));
    },
  };
}
