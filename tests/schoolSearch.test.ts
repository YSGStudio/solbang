import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CACHE_TTL_DAYS,
  normalizeQuery,
  searchSchools,
  type KakaoPlace,
  type SchoolResult,
  type SchoolSearchStore,
} from "../src/lib/schoolSearch.ts";

/** In-memory stand-in for the three tables, plus a call counter for Kakao. */
function makeHarness(pages: Record<string, KakaoPlace[]>) {
  const schools = new Map<string, SchoolResult>(); // kakaoPlaceId -> row
  const cache = new Map<string, { id: string; fetchedAt: Date }>();
  const items = new Map<string, string[]>(); // cacheId -> ordered school ids
  let nextId = 1;
  let kakaoCalls = 0;
  const kakaoQueries: string[] = [];

  const store: SchoolSearchStore = {
    async findCache(queryKey) {
      return cache.get(queryKey) ?? null;
    },
    async readCachedSchools(cacheId) {
      const ids = items.get(cacheId) ?? [];
      const bySchoolId = new Map(
        [...schools.values()].map((s) => [s.id, s] as const),
      );
      return ids.flatMap((id) => {
        const row = bySchoolId.get(id);
        return row ? [row] : [];
      });
    },
    async upsertSchools(places) {
      return places.map((place) => {
        const existing = schools.get(place.kakaoPlaceId);
        const row: SchoolResult = existing
          ? { ...existing, ...place }
          : { id: `school-${nextId++}`, ...place };
        schools.set(place.kakaoPlaceId, row);
        return row;
      });
    },
    async writeCache(queryKey, schoolIdsInOrder) {
      const existing = cache.get(queryKey);
      const id = existing?.id ?? `cache-${nextId++}`;
      cache.set(queryKey, { id, fetchedAt: now() });
      items.set(id, [...schoolIdsInOrder]);
    },
  };

  const kakao = {
    async searchSchools(query: string) {
      kakaoCalls += 1;
      kakaoQueries.push(query);
      return pages[query] ?? [];
    },
  };

  let clock = new Date("2026-01-01T00:00:00Z");
  const now = () => clock;

  return {
    store,
    kakao,
    now,
    deps: { store, kakao, now },
    get kakaoCalls() {
      return kakaoCalls;
    },
    kakaoQueries,
    schoolCount: () => schools.size,
    cacheEntry: (key: string) => cache.get(key),
    advanceDays(days: number) {
      clock = new Date(clock.getTime() + days * 24 * 60 * 60 * 1000);
    },
    expireCache(key: string, daysAgo: number) {
      const entry = cache.get(key);
      assert.ok(entry, `no cache entry for ${key}`);
      entry.fetchedAt = new Date(
        clock.getTime() - daysAgo * 24 * 60 * 60 * 1000,
      );
    },
  };
}

const 언남 = (n: number): KakaoPlace => ({
  kakaoPlaceId: `k-${n}`,
  name: `언남학교${n}`,
  address: `주소 ${n}`,
  lat: 37 + n / 100,
  lng: 127 + n / 100,
});

const TEN_RESULTS = Array.from({ length: 10 }, (_, i) => 언남(i + 1));

test("R30: normalizeQuery trims, collapses whitespace and lowercases", () => {
  assert.equal(normalizeQuery("  언남  초 "), "언남 초");
  assert.equal(normalizeQuery("언남 초"), "언남 초");
  assert.equal(normalizeQuery("Eonnam   ELEM"), "eonnam elem");
  assert.equal(normalizeQuery("\t언남\n초\t"), "언남 초");
});

test("AC17/R22: every returned school is stored, selected or not", async () => {
  const h = makeHarness({ "언남": TEN_RESULTS });
  const outcome = await searchSchools(h.deps, "언남");

  assert.equal(outcome.results.length, 10);
  assert.equal(h.schoolCount(), 10, "all 10 results were written to schools");
  assert.equal(h.kakaoCalls, 1);
});

test("AC18: the same query twice calls Kakao once and returns the same list", async () => {
  const h = makeHarness({ "언남": TEN_RESULTS });

  const first = await searchSchools(h.deps, "언남");
  const second = await searchSchools(h.deps, "언남");

  assert.equal(h.kakaoCalls, 1, "kakao call counter must be 1");
  assert.equal(first.source, "kakao");
  assert.equal(second.source, "cache");
  assert.deepEqual(
    second.results.map((r) => r.kakaoPlaceId),
    first.results.map((r) => r.kakaoPlaceId),
  );
});

test("AC19: whitespace variants share one cache entry", async () => {
  const h = makeHarness({ "언남 초": TEN_RESULTS.slice(0, 3) });

  const first = await searchSchools(h.deps, "언남 초");
  const second = await searchSchools(h.deps, "  언남  초 ");

  assert.equal(h.kakaoCalls, 1, "kakao call counter must be 1");
  assert.equal(second.source, "cache");
  assert.equal(second.queryKey, first.queryKey);
  assert.deepEqual(
    second.results.map((r) => r.kakaoPlaceId),
    first.results.map((r) => r.kakaoPlaceId),
  );
});

test("AC21: cache-hit ordering matches the cache-miss ordering (R33)", async () => {
  const h = makeHarness({ "언남": TEN_RESULTS });

  const miss = await searchSchools(h.deps, "언남");
  const hit = await searchSchools(h.deps, "언남");

  assert.equal(miss.source, "kakao");
  assert.equal(hit.source, "cache");
  assert.deepEqual(
    hit.results.map((r) => r.kakaoPlaceId),
    ["k-1", "k-2", "k-3", "k-4", "k-5", "k-6", "k-7", "k-8", "k-9", "k-10"],
  );
  assert.deepEqual(hit.results, miss.results);
});

test("AC20: a 91-day-old entry is refetched and its timestamp refreshed (R32)", async () => {
  const h = makeHarness({ "언남": TEN_RESULTS });

  await searchSchools(h.deps, "언남");
  assert.equal(h.kakaoCalls, 1);

  const before = h.cacheEntry("언남")!.fetchedAt;
  h.expireCache("언남", CACHE_TTL_DAYS + 1);

  const refreshed = await searchSchools(h.deps, "언남");

  assert.equal(h.kakaoCalls, 2, "kakao call counter must be 2 after expiry");
  assert.equal(refreshed.source, "kakao");
  assert.ok(
    h.cacheEntry("언남")!.fetchedAt > new Date(before.getTime() - 1),
    "fetched_at was refreshed",
  );
  assert.equal(h.schoolCount(), 10, "no duplicate school rows on refetch");
});

test("R32: an entry one day short of the TTL still hits the cache", async () => {
  const h = makeHarness({ "언남": TEN_RESULTS });

  await searchSchools(h.deps, "언남");
  h.expireCache("언남", CACHE_TTL_DAYS - 1);

  const outcome = await searchSchools(h.deps, "언남");
  assert.equal(outcome.source, "cache");
  assert.equal(h.kakaoCalls, 1);
});

test("R30: Kakao receives the normalized query, so keys and calls agree", async () => {
  const h = makeHarness({ "언남 초": TEN_RESULTS.slice(0, 2) });
  await searchSchools(h.deps, "  언남  초 ");
  assert.deepEqual(h.kakaoQueries, ["언남 초"]);
});

test("an empty query never reaches Kakao", async () => {
  const h = makeHarness({});
  const outcome = await searchSchools(h.deps, "   ");
  assert.deepEqual(outcome.results, []);
  assert.equal(h.kakaoCalls, 0);
});
