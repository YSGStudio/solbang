import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarGrid,
  combineKst,
  dayKey,
  formatMonthLabel,
  monthRange,
  shiftMonth,
  splitKst,
} from "../src/lib/meetTime.ts";

test("입력한 날짜·시간은 KST 로 읽힌다", () => {
  // 2026-09-01 07:00 KST == 2026-08-31 22:00 UTC
  assert.equal(combineKst("2026-09-01", "07:00"), "2026-08-31T22:00:00.000Z");
  assert.equal(combineKst("2026-01-01", "00:00"), "2025-12-31T15:00:00.000Z");
});

test("잘못된 입력은 null 이다", () => {
  assert.equal(combineKst("", "07:00"), null);
  assert.equal(combineKst("2026-09-01", ""), null);
  assert.equal(combineKst("2026-9-1", "07:00"), null);
  assert.equal(combineKst("2026-09-01", "7:00"), null);
});

test("저장된 값을 다시 폼으로 되돌린다", () => {
  const iso = combineKst("2026-09-04", "19:30");
  assert.ok(iso);
  assert.deepEqual(splitKst(iso), { date: "2026-09-04", time: "19:30" });
  assert.deepEqual(splitKst(null), { date: "", time: "" });
});

test("자정 직전·직후도 KST 날짜가 맞다", () => {
  const late = combineKst("2026-09-01", "23:30");
  const early = combineKst("2026-09-02", "00:30");
  assert.equal(dayKey(late!), "2026-09-01");
  assert.equal(dayKey(early!), "2026-09-02");
});

test("월 범위는 KST 기준 그 달만 담는다", () => {
  const range = monthRange("2026-09");
  assert.ok(range);
  assert.equal(range.start, "2026-08-31T15:00:00.000Z");
  assert.equal(range.end, "2026-09-30T15:00:00.000Z");

  const first = combineKst("2026-09-01", "00:00")!;
  const last = combineKst("2026-09-30", "23:59")!;
  const before = combineKst("2026-08-31", "23:59")!;
  const after = combineKst("2026-10-01", "00:00")!;
  assert.ok(first >= range.start && first < range.end, "1일 포함");
  assert.ok(last >= range.start && last < range.end, "말일 포함");
  assert.ok(before < range.start, "전달 제외");
  assert.ok(after >= range.end, "다음달 제외");
});

test("월 이동은 연도를 넘는다", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-09", 1), "2026-10");
});

test("달력 격자는 42칸이고 일요일에서 시작한다", () => {
  const grid = calendarGrid("2026-09");
  assert.equal(grid.length, 42);
  assert.equal(new Date(grid[0].key + "T00:00:00Z").getUTCDay(), 0);
  const inMonth = grid.filter((c) => c.inMonth);
  assert.equal(inMonth.length, 30, "9월은 30일");
  assert.equal(inMonth[0].key, "2026-09-01");
  assert.equal(inMonth.at(-1)!.key, "2026-09-30");
});

test("2월과 윤달도 칸 수가 맞다", () => {
  assert.equal(calendarGrid("2027-02").filter((c) => c.inMonth).length, 28);
  assert.equal(calendarGrid("2028-02").filter((c) => c.inMonth).length, 29);
});

test("월 이름 표기", () => {
  assert.equal(formatMonthLabel("2026-09"), "2026년 9월");
  assert.equal(formatMonthLabel("2026-12"), "2026년 12월");
});
