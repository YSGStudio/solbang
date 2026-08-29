"use client";

import { useState } from "react";
import {
  detailAxisFor,
  GRADE_BANDS,
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  SHARE_CATEGORIES,
  SUBJECTS,
  type SchoolLevel,
  type ShareCategory,
} from "@/lib/categories";
import { formatCarbon } from "@/lib/format";

export type PickerItemType = {
  id: string;
  label: string;
  carbon_g: number;
  category: string | null;
};

/**
 * R6, R7. 학교급 · 카테고리는 라디오, 세부 항목은 조합에 따라 달라진다.
 *   초등 + 수업교구 -> 학년군
 *   중등 + 수업교구 -> 교과목
 *   그 외           -> 없음
 * 품목유형은 카테고리별 목록이라 여기서 함께 고른다. 규칙의 실제 보증은
 * 마이그레이션 14 의 is_valid_share_taxonomy() 다. (AC4)
 */
export function CategoryPicker({
  itemTypes,
  defaultLevel = "elementary",
  defaultCategory = "학급경영",
  defaultSubject,
  defaultGradeBand,
  defaultItemTypeId,
  lockedItemTypeLabel,
}: {
  itemTypes: PickerItemType[];
  defaultLevel?: SchoolLevel;
  defaultCategory?: ShareCategory;
  defaultSubject?: string;
  defaultGradeBand?: string;
  defaultItemTypeId?: string;
  /**
   * 수정 화면용. 마이그레이션 9 가 품목 유형과 탄소 계수를 작성 시점 값으로
   * 동결하므로, 고를 수 있는 것처럼 보여주면 안 된다.
   */
  lockedItemTypeLabel?: string;
}) {
  const [level, setLevel] = useState<SchoolLevel>(defaultLevel);
  const [category, setCategory] = useState<ShareCategory>(defaultCategory);

  const axis = detailAxisFor(level, category);
  const forCategory = itemTypes.filter((type) => type.category === category);

  return (
    <>
      <fieldset className="pick-group">
        <legend>학교급 *</legend>
        <div className="pick-row">
          {SCHOOL_LEVELS.map((value) => (
            <label key={value} className="pick-chip">
              <input
                type="radio"
                name="school_level"
                value={value}
                checked={level === value}
                onChange={() => setLevel(value)}
              />
              <span>{SCHOOL_LEVEL_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="pick-group">
        <legend>카테고리 *</legend>
        <div className="pick-row">
          {SHARE_CATEGORIES.map((value) => (
            <label key={value} className="pick-chip">
              <input
                type="radio"
                name="category"
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 조합이 바뀌면 이전 선택이 남지 않도록 key 로 새로 만든다. */}
      {axis === "grade" ? (
        <fieldset className="pick-group" key="grade">
          <legend>학년군 *</legend>
          <div className="pick-row">
            {GRADE_BANDS.map((value) => (
              <label key={value} className="pick-chip">
                <input
                  type="radio"
                  name="grade_band"
                  value={value}
                  defaultChecked={defaultGradeBand === value}
                  required
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {axis === "subject" ? (
        <div className="field" key="subject">
          <label htmlFor="subject">교과목 *</label>
          <select
            id="subject"
            name="subject"
            defaultValue={defaultSubject ?? ""}
            required
          >
            <option value="" disabled>선택해 주세요</option>
            {SUBJECTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="item_type_id">품목 유형 *</label>
        {lockedItemTypeLabel !== undefined ? (
          <p className="muted" style={{ margin: 0 }}>
            {lockedItemTypeLabel} · 탄소 절감량이 작성 시점 값으로 고정되어 있어
            품목 유형은 바꿀 수 없습니다.
          </p>
        ) : forCategory.length === 0 ? (
          <p className="notice notice-warn">
            이 카테고리에 등록된 품목 유형이 없습니다. 운영자에게 문의해 주세요.
          </p>
        ) : (
          <>
            <select
              id="item_type_id"
              name="item_type_id"
              key={category}
              defaultValue={
                forCategory.some((t) => t.id === defaultItemTypeId)
                  ? defaultItemTypeId
                  : ""
              }
              required
            >
              <option value="" disabled>선택해 주세요</option>
              {forCategory.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label} (약 {formatCarbon(type.carbon_g)} 절감)
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 6 }}>
              나눔이 완료되면 이 품목의 절감량이 내 누적 탄소량에 더해집니다.
            </p>
          </>
        )}
      </div>
    </>
  );
}
