import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findUnit,
  MAX_SELECTED_STANDARDS,
  SECONDARY_INFORMATICS_UNITS,
  standardsAreInUnit,
  unitsFor,
} from "../src/lib/curriculum/secondaryInformatics.ts";

test("교육과정 자료가 온전하다", () => {
  assert.equal(SECONDARY_INFORMATICS_UNITS.length, 5);
  const codes = SECONDARY_INFORMATICS_UNITS.flatMap((u) =>
    u.standards.map((s) => s.code),
  );
  assert.equal(codes.length, 25);
  assert.equal(new Set(codes).size, 25, "코드가 중복되지 않는다");
  for (const code of codes) {
    assert.match(code, /^9정0[1-5]-\d{2}$/, `${code} 형식`);
  }
  for (const unit of SECONDARY_INFORMATICS_UNITS) {
    assert.ok(unit.standards.length > 0, `${unit.name} 에 성취기준이 있다`);
    for (const s of unit.standards) {
      assert.ok(s.text.trim().length > 10, `${s.code} 문장이 비어 있지 않다`);
    }
  }
});

test("단원은 중등 + 수업교구 + 준비된 교과목에서만 나온다", () => {
  assert.equal(unitsFor("secondary", "수업교구", "정보").length, 5);
  assert.equal(unitsFor("secondary", "수업교구", "과학").length, 0);
  assert.equal(unitsFor("elementary", "수업교구", "정보").length, 0);
  assert.equal(unitsFor("secondary", "교사용품", "정보").length, 0);
  assert.equal(unitsFor("secondary", "학급경영", "정보").length, 0);
  assert.equal(unitsFor("secondary", "수업교구", null).length, 0);
});

test("성취기준은 고른 단원 소속이어야 한다", () => {
  const unit = findUnit("secondary", "수업교구", "정보", "알고리즘과 프로그래밍");
  assert.ok(unit);
  assert.equal(unit.standards.length, 9);

  assert.ok(standardsAreInUnit(unit, ["9정03-05", "9정03-07"]));
  assert.ok(standardsAreInUnit(unit, []), "빈 선택은 허용된다");
  assert.ok(!standardsAreInUnit(unit, ["9정01-01"]), "다른 단원 코드는 거부");
  assert.ok(!standardsAreInUnit(unit, ["없는코드"]));
  assert.ok(!standardsAreInUnit(undefined, ["9정01-01"]), "단원 없이 코드만은 거부");
  assert.ok(standardsAreInUnit(undefined, []));
});

test("없는 단원은 찾히지 않는다", () => {
  assert.equal(findUnit("secondary", "수업교구", "정보", "없는단원"), undefined);
  assert.equal(findUnit("elementary", "수업교구", "정보", "데이터"), undefined);
});

test("선택 한도가 단원 최대 크기보다 넉넉하다", () => {
  const biggest = Math.max(
    ...SECONDARY_INFORMATICS_UNITS.map((u) => u.standards.length),
  );
  assert.ok(
    MAX_SELECTED_STANDARDS >= biggest,
    "한 단원의 성취기준을 모두 고를 수 있어야 한다",
  );
});
