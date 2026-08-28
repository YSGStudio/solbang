"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CATEGORIES_BY_LEVEL,
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  isSchoolLevel,
} from "@/lib/categories";
import { DISTANCE_OPTIONS_KM } from "@/lib/distance";

/**
 * R8. Level and category filters, held in the URL so a filtered list is
 * shareable and survives a refresh. No filter means everything.
 */
export function CategoryFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const level = params.get("level") ?? "";
  const category = params.get("category") ?? "";
  const distance = params.get("distance") ?? "10";
  const queryText = params.get("q") ?? "";
  const categories = isSchoolLevel(level)
    ? (CATEGORIES_BY_LEVEL[level] as readonly string[])
    : [];

  function update(next: { level?: string; category?: string; distance?: string }) {
    const query = new URLSearchParams(params.toString());

    if (next.level !== undefined) {
      if (next.level) query.set("level", next.level);
      else query.delete("level");
      // The old category almost certainly belongs to the other level.
      query.delete("category");
    }
    if (next.category !== undefined) {
      if (next.category) query.set("category", next.category);
      else query.delete("category");
    }
    if (next.distance !== undefined) query.set("distance", next.distance);

    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form className="card" method="get" style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="share-search">물건 검색</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="share-search" type="search" name="q" defaultValue={queryText} placeholder="예: 과학 실험 키트" />
          <button type="submit" className="btn-primary">검색</button>
        </div>
      </div>
      <div className="row">
      <select
        aria-label="학교급 필터"
        name="level"
        value={level}
        onChange={(event) => update({ level: event.target.value })}
        style={{ width: "auto", flex: "1 1 140px" }}
      >
        <option value="">학교급 전체</option>
        {SCHOOL_LEVELS.map((value) => (
          <option key={value} value={value}>
            {SCHOOL_LEVEL_LABELS[value]}
          </option>
        ))}
      </select>

      <select
        aria-label="거리 필터"
        name="distance"
        value={distance}
        onChange={(event) => update({ distance: event.target.value })}
        style={{ width: "auto", flex: "1 1 120px" }}
      >
        {DISTANCE_OPTIONS_KM.map((value) => (
          <option key={value} value={value}>내 학교에서 {value}km</option>
        ))}
      </select>

      <select
        aria-label="카테고리 필터"
        name="category"
        value={category}
        disabled={categories.length === 0}
        onChange={(event) => update({ category: event.target.value })}
        style={{ width: "auto", flex: "1 1 140px" }}
      >
        <option value="">
          {categories.length === 0 ? "학교급을 먼저 고르세요" : "카테고리 전체"}
        </option>
        {categories.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      {level || category || queryText ? (
        <button type="button" onClick={() => router.replace(`${pathname}?distance=${distance}`)}>
          필터 해제
        </button>
      ) : null}
      </div>
    </form>
  );
}
