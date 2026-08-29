"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BOARD_CAREER_STAGES, BOARD_TOPICS } from "@/lib/categories";

/**
 * 게시판 색인. 경력 단계와 주제를 URL 에 담아 두 축으로 걸러 본다.
 * 검색 상자는 없다 — 나눔 탭에만 둔다.
 */
export function BoardFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const stage = params.get("stage") ?? "";
  const topic = params.get("topic") ?? "";

  function update(next: { stage?: string; topic?: string }) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue;
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("deleted");
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row">
        <select
          aria-label="경력 단계 필터"
          value={stage}
          onChange={(event) => update({ stage: event.target.value })}
          style={{ width: "auto", flex: "1 1 150px" }}
        >
          <option value="">경력 단계 전체</option>
          {BOARD_CAREER_STAGES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          aria-label="주제 필터"
          value={topic}
          onChange={(event) => update({ topic: event.target.value })}
          style={{ width: "auto", flex: "1 1 150px" }}
        >
          <option value="">주제 전체</option>
          {BOARD_TOPICS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        {stage || topic ? (
          <button type="button" onClick={() => router.replace(pathname)}>
            필터 해제
          </button>
        ) : null}
      </div>
    </div>
  );
}
