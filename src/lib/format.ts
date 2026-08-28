/**
 * R17 / human check: cumulative carbon has to read as a quantity a person can
 * feel, so grams roll up into kg and tonnes rather than printing "1350000g".
 */
export function formatCarbon(grams: number): string {
  if (grams < 1000) return `${grams.toLocaleString("ko-KR")}g`;
  if (grams < 1_000_000) {
    return `${(grams / 1000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}kg`;
  }
  return `${(grams / 1_000_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}t`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** R25: one decimal place, or "평가 없음" when nobody has rated yet. */
export function formatScore(
  score: number | string | null | undefined,
): string {
  if (score === null || score === undefined) return "평가 없음";
  // PostgREST can serialise `numeric` as a string, so never call toFixed blind.
  const value = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(value)) return "평가 없음";
  return value.toFixed(1);
}
