/**
 * 번개모임 일시. 한국 학교에서 쓰는 앱이라 입력한 날짜·시간은 항상 KST 로
 * 읽는다. 서버가 어느 시간대에서 돌든 같은 값이 되도록 오프셋을 직접 붙인다.
 */
const KST_OFFSET = "+09:00";

/** 달력 격자와 목록에 쓰는 월 키. 예: "2026-09" */
export function monthKey(date: Date): string {
  const parts = kstParts(date);
  return `${parts.year}-${parts.month}`;
}

/** KST 기준의 연·월·일·시·분을 두 자리 문자열로 얻는다. */
export function kstParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  // Intl 은 자정을 "24" 로 줄 때가 있다.
  if (found.hour === "24") found.hour = "00";
  return {
    year: found.year,
    month: found.month,
    day: found.day,
    hour: found.hour,
    minute: found.minute,
  };
}

/** "2026-09-01" 형태의 KST 날짜 키. */
export function dayKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const p = kstParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 폼의 date + time 을 하나의 시각으로. 잘못된 입력이면 null. */
export function combineKst(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const iso = `${date}T${time}:00${KST_OFFSET}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 수정 화면의 <input type="date"> / <input type="time"> 기본값. */
export function splitKst(value: string | null): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const p = kstParts(new Date(value));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

/** "2026-09" 를 그 달의 KST 시작·끝(다음 달 시작)으로. */
export function monthRange(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;

  const start = new Date(`${match[1]}-${match[2]}-01T00:00:00${KST_OFFSET}`);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const end = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00${KST_OFFSET}`,
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

export function shiftMonth(month: string, by: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + by;
  const year = Math.floor(total / 12);
  const monthNumber = (total % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/**
 * 달력 격자. 그 달 1일이 속한 주의 일요일부터 6주(42칸)를 채운다.
 * 칸마다 KST 날짜 키를 준다.
 */
export function calendarGrid(month: string): { key: string; inMonth: boolean }[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  // UTC 로 날짜만 다루면 시간대에 흔들리지 않는다.
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    return { key, inMonth: day.getUTCMonth() === monthNumber - 1 };
  });
}

export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${match[1]}년 ${Number(match[2])}월` : month;
}

/** 목록·상세에 쓰는 "9월 4일 (금) 오후 7:00". */
export function formatMeetAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
