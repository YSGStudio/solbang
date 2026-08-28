import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type {
  KakaoPlace,
  SchoolResult,
  SchoolSearchStore,
} from "@/lib/schoolSearch";

/**
 * Supabase-backed implementation of the search store.
 *
 * Must be handed a service-role client: `schools`, `school_search_cache` and
 * `school_search_cache_items` have no write policies at all, so a user session
 * cannot write here. (R34, AC22)
 */
export function createSchoolSearchStore(
  admin: SupabaseClient<Database>,
): SchoolSearchStore {
  return {
    async findCache(queryKey) {
      const { data, error } = await admin
        .from("school_search_cache")
        .select("id, fetched_at")
        .eq("query_key", queryKey)
        .maybeSingle();

      if (error) throw new Error(`cache lookup failed: ${error.message}`);
      if (!data) return null;
      return { id: data.id, fetchedAt: new Date(data.fetched_at) };
    },

    async readCachedSchools(cacheId) {
      // R33: rank preserves the order Kakao returned.
      const { data, error } = await admin
        .from("school_search_cache_items")
        .select(
          "rank, schools:school_id (id, kakao_place_id, name, address, lat, lng)",
        )
        .eq("cache_id", cacheId)
        .order("rank", { ascending: true });

      if (error) throw new Error(`cache read failed: ${error.message}`);

      type Row = {
        rank: number;
        schools: {
          id: string;
          kakao_place_id: string;
          name: string;
          address: string | null;
          lat: number | null;
          lng: number | null;
        } | null;
      };

      return ((data ?? []) as unknown as Row[])
        .filter((row): row is Row & { schools: NonNullable<Row["schools"]> } =>
          row.schools !== null,
        )
        .map((row) => ({
          id: row.schools.id,
          kakaoPlaceId: row.schools.kakao_place_id,
          name: row.schools.name,
          address: row.schools.address,
          lat: row.schools.lat,
          lng: row.schools.lng,
        }));
    },

    async upsertSchools(places: KakaoPlace[]): Promise<SchoolResult[]> {
      if (places.length === 0) return [];

      // Postgres refuses to touch the same conflict target twice in one
      // statement, and Kakao can repeat a place across a response.
      const unique: KakaoPlace[] = [];
      const seen = new Set<string>();
      for (const place of places) {
        if (seen.has(place.kakaoPlaceId)) continue;
        seen.add(place.kakaoPlaceId);
        unique.push(place);
      }

      // R22: every result is stored whether or not anyone picks it.
      const { data, error } = await admin
        .from("schools")
        .upsert(
          unique.map((p) => ({
            kakao_place_id: p.kakaoPlaceId,
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
          })),
          { onConflict: "kakao_place_id" },
        )
        .select("id, kakao_place_id, name, address, lat, lng");

      if (error) throw new Error(`school upsert failed: ${error.message}`);

      // Upsert does not promise input order back, so re-key and re-order.
      const byPlaceId = new Map(
        (data ?? []).map((row) => [row.kakao_place_id, row]),
      );

      return unique.flatMap((place) => {
        const row = byPlaceId.get(place.kakaoPlaceId);
        if (!row) return [];
        return [
          {
            id: row.id,
            kakaoPlaceId: row.kakao_place_id,
            name: row.name,
            address: row.address,
            lat: row.lat,
            lng: row.lng,
          },
        ];
      });
    },

    async writeCache(queryKey, schoolIdsInOrder) {
      // R32: expired entries are overwritten, never deleted.
      const { data: header, error: headerError } = await admin
        .from("school_search_cache")
        .upsert(
          { query_key: queryKey, fetched_at: new Date().toISOString() },
          { onConflict: "query_key" },
        )
        .select("id")
        .single();

      if (headerError || !header) {
        throw new Error(`cache write failed: ${headerError?.message}`);
      }

      const { error: clearError } = await admin
        .from("school_search_cache_items")
        .delete()
        .eq("cache_id", header.id);
      if (clearError) throw new Error(`cache clear failed: ${clearError.message}`);

      if (schoolIdsInOrder.length === 0) return;

      const { error: insertError } = await admin
        .from("school_search_cache_items")
        .insert(
          schoolIdsInOrder.map((schoolId, index) => ({
            cache_id: header.id,
            school_id: schoolId,
            rank: index,
          })),
        );
      if (insertError) {
        throw new Error(`cache item write failed: ${insertError.message}`);
      }
    },
  };
}
