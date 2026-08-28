/**
 * School level -> detail category mapping. (R6, R7)
 *
 * This mapping also exists as a CHECK constraint in
 * supabase/migrations/0002_categories.sql. Change both together.
 */
export const SCHOOL_LEVELS = ["elementary", "secondary"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  elementary: "초등",
  secondary: "중등",
};

export const CATEGORIES_BY_LEVEL = {
  elementary: ["수업자료", "학급자료"],
  secondary: [
    "국어",
    "수학",
    "사회",
    "영어",
    "역사",
    "과학",
    "기술",
    "미술",
    "음악",
    "체육",
  ],
} as const satisfies Record<SchoolLevel, readonly string[]>;

export type Category =
  (typeof CATEGORIES_BY_LEVEL)[SchoolLevel][number];

export function isSchoolLevel(value: unknown): value is SchoolLevel {
  return SCHOOL_LEVELS.includes(value as SchoolLevel);
}

/** R7: a category is only valid inside its own school level. */
export function isValidPair(level: unknown, category: unknown): boolean {
  if (!isSchoolLevel(level)) return false;
  return (CATEGORIES_BY_LEVEL[level] as readonly string[]).includes(
    String(category),
  );
}

export const SHARE_STATUSES = ["available", "reserved", "completed"] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  available: "나눔중",
  reserved: "예약중",
  completed: "나눔완료",
};

export const MAX_SHARE_IMAGES = 4; // R10
export const MAX_CLUB_IMAGES = 2; // R19
