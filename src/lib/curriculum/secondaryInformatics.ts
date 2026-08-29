/**
 * 2022 개정 교육과정 · 중학교 정보과 성취기준.
 *
 * 데이터베이스에 넣지 않고 이 파일에 둔다. 교육과정 문서에서 온 고정 자료라
 * 사용자가 추가하거나 고치는 값이 아니고, 개정될 때 이 파일만 갈아끼우면 된다.
 * 나눔글에는 고른 코드만 저장한다.
 *
 * 출처: 교육부·한국교육과정평가원, 「2022 개정 교육과정에 따른 중학교 정보과
 *       성취수준」 Ⅲ장 1절 성취기준별 성취수준 (중 1~3학년군)
 *
 * 지금은 중등 · 수업교구 · 정보 조합에서만 쓴다. 다른 교과를 넣을 때는 같은
 * 모양의 파일을 만들어 CURRICULUM_BY_SUBJECT 에 더하면 된다.
 */

export type CurriculumStandard = {
  /** 예: "9정01-01" */
  code: string;
  text: string;
};

export type CurriculumUnit = {
  /** 영역 이름. 단원 드롭다운에 그대로 쓴다. */
  name: string;
  standards: CurriculumStandard[];
};

export const SECONDARY_INFORMATICS_UNITS: CurriculumUnit[] = [
  {
    name: "컴퓨팅 시스템",
    standards: [
      {
        code: "9정01-01",
        text: "컴퓨팅 시스템의 구성요소와 동작 원리를 이해하고, 운영 체제의 기능을 분석한다.",
      },
      {
        code: "9정01-02",
        text: "피지컬 컴퓨팅의 개념을 이해하고, 생활 속에서 적용된 사례 조사를 통해 컴퓨팅 시스템의 필요성과 가치를 판단한다.",
      },
      {
        code: "9정01-03",
        text: "문제 해결 목적에 맞는 피지컬 컴퓨팅 구성요소를 선택하여 시스템을 구상한다.",
      },
    ],
  },
  {
    name: "데이터",
    standards: [
      {
        code: "9정02-01",
        text: "실생활의 데이터가 디지털 형태로 변환되어 활용되는 긍정적 가치를 탐색하고, 다양한 데이터를 디지털 형태로 표현한다.",
      },
      {
        code: "9정02-02",
        text: "문제 해결에 적합한 데이터를 수집하고, 목적에 맞게 구분하여 관리한다.",
      },
      {
        code: "9정02-03",
        text: "실생활의 데이터를 표, 다이어그램 등 다양한 형태로 구조화한다.",
      },
      {
        code: "9정02-04",
        text: "사례를 중심으로 데이터 간의 관계를 파악하고, 데이터에 기반하여 의미를 해석한다.",
      },
      {
        code: "9정02-05",
        text: "여러 학문 분야의 사례를 중심으로 데이터를 수집·분석하여 융합적으로 문제를 해결한다.",
      },
    ],
  },
  {
    name: "알고리즘과 프로그래밍",
    standards: [
      {
        code: "9정03-01",
        text: "문제의 상태를 정의하고 수행 가능한 형태로 구조화한다.",
      },
      {
        code: "9정03-02",
        text: "문제 해결을 위한 추상화의 중요성을 이해하고, 핵심요소를 중심으로 알고리즘을 표현한다.",
      },
      {
        code: "9정03-03",
        text: "알고리즘의 중요성을 이해하고, 문제를 해결하는 다양한 알고리즘을 비교·분석한다.",
      },
      {
        code: "9정03-04",
        text: "사례를 중심으로 문제 해결에 적합한 전략을 선택하여 알고리즘을 설계한다.",
      },
      {
        code: "9정03-05",
        text: "데이터를 순차적으로 저장할 수 있는 구조를 활용하여 문제 해결 프로그램을 작성한다.",
      },
      {
        code: "9정03-06",
        text: "논리 연산과 중첩 제어 구조를 활용하여 문제를 해결하는 프로그램을 작성한다.",
      },
      {
        code: "9정03-07",
        text: "프로그램 작성에서 함수를 활용하고, 프로그램 수행 결과를 디버거로 분석하여 오류를 수정한다.",
      },
      {
        code: "9정03-08",
        text: "실생활의 문제를 탐색하여 발견하고, 프로그래밍을 통해 해결한다.",
      },
      {
        code: "9정03-09",
        text: "다양한 학문 분야의 문제 해결을 위해 협력하여 소프트웨어를 개발한다.",
      },
    ],
  },
  {
    name: "인공지능",
    standards: [
      {
        code: "9정04-01",
        text: "인공지능의 개념과 특성을 설명하고 인공지능 소프트웨어를 구별한다.",
      },
      {
        code: "9정04-02",
        text: "인공지능 학습에서 데이터의 중요성을 이해하고, 학습에 필요한 데이터를 수집하여 분류한다.",
      },
      {
        code: "9정04-03",
        text: "다양한 데이터를 활용하여 인공지능 시스템을 구성하고 적용한다.",
      },
      {
        code: "9정04-04",
        text: "인공지능 시스템으로 해결 가능한 문제를 발견하고, 문제 해결에 적합한 인공지능 시스템을 적용한다.",
      },
      {
        code: "9정04-05",
        text: "인공지능 학습에 필요한 데이터의 수집과 활용에서 발생하는 윤리적인 문제의 해결 방안을 구상한다.",
      },
    ],
  },
  {
    name: "디지털 문화",
    standards: [
      {
        code: "9정05-01",
        text: "디지털 사회의 특성을 탐구하고, 사회 변화에 따른 직업의 변화를 탐구한다.",
      },
      {
        code: "9정05-02",
        text: "디지털 사회의 구성원으로서 편리하고 안전한 생활을 위한 규칙에 대해 민주적으로 논의하고 실천 방안을 수립한다.",
      },
      {
        code: "9정05-03",
        text: "사례를 중심으로 디지털 공간에서 함께 살아가기 위해 개인 정보 및 권리와 저작권을 보호하는 실천 방법을 탐구한다.",
      },
    ],
  },
];

/**
 * 교과목 이름 -> 단원 목록. 지금은 '정보' 하나뿐이다. 여기에 없는 교과목은
 * 단원·성취기준 선택이 나타나지 않는다.
 */
export const CURRICULUM_BY_SUBJECT: Record<string, CurriculumUnit[]> = {
  정보: SECONDARY_INFORMATICS_UNITS,
};

/** 중등 + 수업교구 + 해당 교과목일 때만 단원·성취기준을 고른다. */
export function unitsFor(
  level: unknown,
  category: unknown,
  subject: unknown,
): CurriculumUnit[] {
  if (level !== "secondary" || category !== "수업교구") return [];
  if (typeof subject !== "string") return [];
  return CURRICULUM_BY_SUBJECT[subject] ?? [];
}

export function findUnit(
  level: unknown,
  category: unknown,
  subject: unknown,
  unitName: unknown,
): CurriculumUnit | undefined {
  return unitsFor(level, category, subject).find((u) => u.name === unitName);
}

/** 고른 코드가 그 단원에 실제로 있는 것인지. 앱이 보증하는 부분이다. */
export function standardsAreInUnit(
  unit: CurriculumUnit | undefined,
  codes: string[],
): boolean {
  if (!unit) return codes.length === 0;
  const known = new Set(unit.standards.map((s) => s.code));
  return codes.every((code) => known.has(code));
}

export const MAX_SELECTED_STANDARDS = 12;
