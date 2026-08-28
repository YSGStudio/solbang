"use client";

import { useState } from "react";
import {
  CATEGORIES_BY_LEVEL,
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  type SchoolLevel,
} from "@/lib/categories";

/**
 * R6, R7. The category list is derived from the chosen level, so an invalid
 * pair cannot be submitted from the form. The CHECK constraint in migration 2
 * is what actually guarantees it. (AC4)
 */
export function CategoryPicker({
  defaultLevel = "elementary",
  defaultCategory,
}: {
  defaultLevel?: SchoolLevel;
  defaultCategory?: string;
}) {
  const [level, setLevel] = useState<SchoolLevel>(defaultLevel);
  const categories = CATEGORIES_BY_LEVEL[level] as readonly string[];
  const selected =
    defaultCategory && categories.includes(defaultCategory)
      ? defaultCategory
      : undefined;

  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <div className="field grow" style={{ marginBottom: 0 }}>
        <label htmlFor="school_level">학교급 *</label>
        <select
          id="school_level"
          name="school_level"
          value={level}
          onChange={(event) => setLevel(event.target.value as SchoolLevel)}
        >
          {SCHOOL_LEVELS.map((value) => (
            <option key={value} value={value}>
              {SCHOOL_LEVEL_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field grow" style={{ marginBottom: 0 }}>
        <label htmlFor="category">세부 카테고리 *</label>
        <select
          id="category"
          name="category"
          key={level}
          defaultValue={selected}
          required
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
