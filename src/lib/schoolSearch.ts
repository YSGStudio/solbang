/**
 * School search with a 90-day cache. (R30, R31, R32, R33)
 *
 * The Kakao call itself lives in src/lib/kakao.ts and is reached only through
 * the `KakaoClient` port below, which is injected. That is what lets the tests
 * count calls (AC18, AC19, AC20) without a network or a database.
 */

export const CACHE_TTL_DAYS = 90; // R32

/**
 * R30: trim, collapse runs of whitespace to one space, lowercase.
 * `"  언남  초 "` and `"언남 초"` therefore share one cache entry. (AC19)
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface KakaoPlace {
  kakaoPlaceId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SchoolResult extends KakaoPlace {
  id: string;
}

export interface KakaoClient {
  /** Returns places in the order Kakao ranked them. (R33) */
  searchSchools(query: string): Promise<KakaoPlace[]>;
}

export interface SchoolSearchStore {
  findCache(queryKey: string): Promise<{ id: string; fetchedAt: Date } | null>;
  /** Cached schools, already ordered by rank. (R33) */
  readCachedSchools(cacheId: string): Promise<SchoolResult[]>;
  /** R22: every returned school is stored, selected or not. Keyed on kakaoPlaceId. */
  upsertSchools(places: KakaoPlace[]): Promise<SchoolResult[]>;
  /** R31, R32: upsert the header, replace the items, refresh fetched_at. */
  writeCache(queryKey: string, schoolIdsInOrder: string[]): Promise<void>;
}

export interface SearchDeps {
  store: SchoolSearchStore;
  kakao: KakaoClient;
  now?: () => Date;
}

export interface SearchOutcome {
  query: string;
  queryKey: string;
  /** "hit" means Kakao was not called. Surfaced for tests and logs. */
  source: "cache" | "kakao";
  results: SchoolResult[];
}

function isFresh(fetchedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - fetchedAt.getTime();
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function searchSchools(
  deps: SearchDeps,
  rawQuery: string,
): Promise<SearchOutcome> {
  const now = deps.now?.() ?? new Date();
  const queryKey = normalizeQuery(rawQuery);

  if (queryKey.length === 0) {
    return { query: rawQuery, queryKey, source: "cache", results: [] };
  }

  // R30: a fresh cache entry ends the request here. Kakao is not called.
  const cached = await deps.store.findCache(queryKey);
  if (cached && isFresh(cached.fetchedAt, now)) {
    return {
      query: rawQuery,
      queryKey,
      source: "cache",
      results: await deps.store.readCachedSchools(cached.id),
    };
  }

  // R31: missing or expired. Call Kakao, store everything, rewrite the cache.
  const places = await deps.kakao.searchSchools(queryKey);
  const schools = await deps.store.upsertSchools(places);
  await deps.store.writeCache(
    queryKey,
    schools.map((s) => s.id),
  );

  return { query: rawQuery, queryKey, source: "kakao", results: schools };
}
