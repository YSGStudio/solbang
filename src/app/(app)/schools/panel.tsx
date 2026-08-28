"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface SchoolRow {
  id: string;
  name: string;
  address: string | null;
}

/** Debounced search against /api/schools/search. (R21) */
export function SchoolSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setMessage(null);
      setStatus("idle");
      return;
    }

    const seq = ++seqRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(
          `/api/schools/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const body = await res.json();
        if (seq !== seqRef.current) return;

        if (!res.ok) {
          setStatus("error");
          setMessage(body?.error ?? "학교 검색에 실패했습니다.");
          setResults([]);
          return;
        }
        setStatus("idle");
        setResults(body.results ?? []);
        setMessage(
          (body.results ?? []).length === 0 ? "검색 결과가 없습니다." : null,
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (seq !== seqRef.current) return;
        setStatus("error");
        setMessage("학교 검색에 실패했습니다.");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <section>
      <div className="field">
        <label htmlFor="school-query">학교 검색</label>
        <input
          id="school-query"
          type="search"
          autoComplete="off"
          placeholder="학교 이름을 두 글자 이상 입력하세요"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {status === "loading" ? <p className="muted">검색 중…</p> : null}
      {message ? (
        <p className={status === "error" ? "notice notice-error" : "muted"}>
          {message}
        </p>
      ) : null}

      <ul className="list-reset">
        {results.map((school) => (
          <li key={school.id}>
            <Link href={`/schools/${school.id}`} className="card" style={{ display: "block" }}>
              <h3>{school.name}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {school.address ?? "주소 정보 없음"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
