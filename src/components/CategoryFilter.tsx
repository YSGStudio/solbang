"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  SHARE_CATEGORIES,
  SUBJECTS,
} from "@/lib/categories";
import { DISTANCE_OPTIONS_KM } from "@/lib/distance";

/**
 * R8. Level, 대분류, 과목 and distance filters, held in the URL so a filtered
 * list is shareable and survives a refresh. No filter means everything.
 *
 * Share only — the other tabs have no taxonomy and no search box.
 */
export function CategoryFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const level = params.get("level") ?? "";
  const category = params.get("category") ?? "";
  const subject = params.get("subject") ?? "";
  const distance = params.get("distance") ?? "10";
  const queryText = params.get("q") ?? "";
  const school = params.get("school") ?? "";

  function update(next: {
    level?: string;
    category?: string;
    subject?: string;
    distance?: string;
  }) {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue;
      if (value) query.set(key, value);
      else query.delete(key);
    }

    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form className="card" method="get" style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="share-search">물건 검색</label>
        <div className="search-row">
          <input
            id="share-search"
            type="search"
            name="q"
            defaultValue={queryText}
            placeholder="예: 과학 실험 키트"
          />
          <button type="submit" className="btn-primary">검색</button>
        </div>
      </div>

      {/* The selects drive the URL through router.replace rather than being
          submitted, so pressing 검색 would otherwise drop every one of them.
          Mirror the live values as hidden fields. */}
      <input type="hidden" name="distance" value={distance} />
      {level ? <input type="hidden" name="level" value={level} /> : null}
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {subject ? <input type="hidden" name="subject" value={subject} /> : null}
      {school ? <input type="hidden" name="school" value={school} /> : null}

      <div className="row">
        <select
          aria-label="학교급 필터"
          value={level}
          onChange={(event) => update({ level: event.target.value })}
          style={{ width: "auto", flex: "1 1 120px" }}
        >
          <option value="">학교급 전체</option>
          {SCHOOL_LEVELS.map((value) => (
            <option key={value} value={value}>
              {SCHOOL_LEVEL_LABELS[value]}
            </option>
          ))}
        </select>

        <select
          aria-label="분류 필터"
          value={category}
          onChange={(event) => update({ category: event.target.value })}
          style={{ width: "auto", flex: "1 1 130px" }}
        >
          <option value="">분류 전체</option>
          {SHARE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          aria-label="과목 필터"
          value={subject}
          onChange={(event) => update({ subject: event.target.value })}
          style={{ width: "auto", flex: "1 1 120px" }}
        >
          <option value="">과목 전체</option>
          {SUBJECTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          aria-label="거리 필터"
          value={distance}
          onChange={(event) => update({ distance: event.target.value })}
          style={{ width: "auto", flex: "1 1 140px" }}
        >
          {DISTANCE_OPTIONS_KM.map((value) => (
            <option key={value} value={value}>내 학교에서 {value}km</option>
          ))}
        </select>

        {level || category || subject || queryText ? (
          <button
            type="button"
            onClick={() => router.replace(`${pathname}?distance=${distance}`)}
          >
            필터 해제
          </button>
        ) : null}
      </div>
    </form>
  );
}
