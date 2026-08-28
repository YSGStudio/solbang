"use client";

import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  SHARE_CATEGORIES,
  SUBJECTS,
  type SchoolLevel,
} from "@/lib/categories";

/**
 * R6, R7. 학교급 -> 대분류 -> 과목. The three axes are independent, so this is
 * three plain selects; the CHECK constraint in migration 10 is what actually
 * guarantees the pair. (AC4)
 */
export function CategoryPicker({
  defaultLevel = "elementary",
  defaultCategory,
  defaultSubject,
}: {
  defaultLevel?: SchoolLevel;
  defaultCategory?: string;
  defaultSubject?: string;
}) {
  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <div className="field grow" style={{ marginBottom: 0 }}>
        <label htmlFor="school_level">학교급 *</label>
        <select id="school_level" name="school_level" defaultValue={defaultLevel}>
          {SCHOOL_LEVELS.map((value) => (
            <option key={value} value={value}>
              {SCHOOL_LEVEL_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field grow" style={{ marginBottom: 0 }}>
        <label htmlFor="category">분류 *</label>
        <select
          id="category"
          name="category"
          defaultValue={defaultCategory ?? SHARE_CATEGORIES[0]}
          required
        >
          {SHARE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="field grow" style={{ marginBottom: 0 }}>
        <label htmlFor="subject">과목 *</label>
        <select
          id="subject"
          name="subject"
          defaultValue={defaultSubject ?? SUBJECTS[0]}
          required
        >
          {SUBJECTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
