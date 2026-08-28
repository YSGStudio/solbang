/**
 * Share taxonomy: 학교급 -> 대분류 -> 과목. (R6, R7)
 *
 * The 대분류/과목 pair also exists as a CHECK constraint in
 * supabase/migrations/0010_categories_boards.sql. Change both together.
 *
 * Both levels carry the same 대분류 and 과목 lists; the school level is a
 * separate axis rather than a parent of the category.
 */
export const SCHOOL_LEVELS = ["elementary", "secondary"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  elementary: "초등",
  secondary: "중등",
};

/** 대분류. */
export const SHARE_CATEGORIES = ["수업교구", "학급경영", "학급자료"] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

/**
 * 과목. '공통' leads because 학급경영/학급자료 items are usually not tied to a
 * single subject, and the subject is required.
 */
export const SUBJECTS = [
  "공통",
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
] as const;
export type Subject = (typeof SUBJECTS)[number];

/** 물건상태. Mirrored by share_posts_condition_valid. */
export const ITEM_CONDITIONS = [
  "미개봉/새것",
  "사용감 적음",
  "사용감 있음",
  "낡았지만 사용 가능",
] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export function isSchoolLevel(value: unknown): value is SchoolLevel {
  return SCHOOL_LEVELS.includes(value as SchoolLevel);
}

export function isShareCategory(value: unknown): value is ShareCategory {
  return SHARE_CATEGORIES.includes(value as ShareCategory);
}

export function isSubject(value: unknown): value is Subject {
  return SUBJECTS.includes(value as Subject);
}

export function isItemCondition(value: unknown): value is ItemCondition {
  return ITEM_CONDITIONS.includes(value as ItemCondition);
}

/** R7: both halves of the pair have to be known values. */
export function isValidShareCategory(
  category: unknown,
  subject: unknown,
): boolean {
  return isShareCategory(category) && isSubject(subject);
}

export const SHARE_STATUSES = ["available", "reserved", "completed"] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  available: "나눔중",
  reserved: "예약중",
  completed: "나눔완료",
};

/** 소모임 / 번개모임 share one table, split by `kind`. */
export const CLUB_KINDS = ["club", "flash"] as const;
export type ClubKind = (typeof CLUB_KINDS)[number];

export const CLUB_KIND_LABELS: Record<ClubKind, string> = {
  club: "소모임",
  flash: "번개모임",
};

export const CLUB_KIND_BLURBS: Record<ClubKind, string> = {
  club: "함께할 선생님을 모아 보세요.",
  flash: "오늘내일 바로 모이는 가벼운 만남을 올려 보세요.",
};

export function isClubKind(value: unknown): value is ClubKind {
  return CLUB_KINDS.includes(value as ClubKind);
}

export const MAX_SHARE_IMAGES = 4; // R10
export const MAX_CLUB_IMAGES = 2; // R19
export const MAX_BOARD_IMAGES = 2;
