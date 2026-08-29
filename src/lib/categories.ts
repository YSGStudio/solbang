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

/** 카테고리(라디오). '학급자료' 는 마이그레이션 14 에서 없어졌다. */
export const SHARE_CATEGORIES = ["학급경영", "수업교구", "교사용품"] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

/** 초등 + 수업교구 에서만 고른다. */
export const GRADE_BANDS = ["1-2학년", "3-4학년", "5-6학년"] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

/**
 * 중등 + 수업교구 에서만 고른다. '공통' 은 특정 교과에 매이지 않는 교구를
 * 위한 자리다.
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
  "정보",
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

export function isGradeBand(value: unknown): value is GradeBand {
  return GRADE_BANDS.includes(value as GradeBand);
}

export function isItemCondition(value: unknown): value is ItemCondition {
  return ITEM_CONDITIONS.includes(value as ItemCondition);
}

/** 학교급 + 카테고리 조합에 세부 항목이 붙는지. */
export type DetailAxis = "grade" | "subject" | "none";

export function detailAxisFor(
  level: unknown,
  category: unknown,
): DetailAxis {
  if (category !== "수업교구") return "none";
  if (level === "elementary") return "grade";
  if (level === "secondary") return "subject";
  return "none";
}

/**
 * R7. 마이그레이션 14 의 is_valid_share_taxonomy() 와 같은 규칙이다.
 * 둘을 함께 고쳐야 한다.
 */
export function isValidShareTaxonomy(
  level: unknown,
  category: unknown,
  subject: unknown,
  gradeBand: unknown,
): boolean {
  if (!isSchoolLevel(level) || !isShareCategory(category)) return false;

  switch (detailAxisFor(level, category)) {
    case "grade":
      return isGradeBand(gradeBand) && !subject;
    case "subject":
      return isSubject(subject) && !gradeBand;
    default:
      return !subject && !gradeBand;
  }
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
