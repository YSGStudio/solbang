"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface SchoolOption {
  id: string;
  name: string;
  address: string | null;
}

/**
 * Debounced school picker. Talks only to /api/schools/search, which holds the
 * Kakao key server-side. (R21, AC12)
 *
 * Writes the chosen school into hidden inputs so the surrounding <form> can
 * post it with a Server Action.
 */
export function SchoolSearchInput({
  name = "school_id",
  initialSchool = null,
  label = "학교",
  required = false,
}: {
  name?: string;
  initialSchool?: SchoolOption | null;
  label?: string;
  required?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SchoolOption[]>([]);
  const [selected, setSelected] = useState<SchoolOption | null>(initialSchool);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      setState("idle");
      setMessage(null);
      return;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    // Debounce: one request per pause in typing, not one per keystroke.
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(
          `/api/schools/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const body = await res.json();
        if (seq !== requestSeq.current) return;

        if (!res.ok) {
          setState("error");
          setMessage(body?.error ?? "학교 검색에 실패했습니다.");
          setOptions([]);
          return;
        }
        setState("idle");
        setOptions(body.results ?? []);
        setMessage(
          (body.results ?? []).length === 0 ? "검색 결과가 없습니다." : null,
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (seq !== requestSeq.current) return;
        setState("error");
        setMessage("학교 검색에 실패했습니다.");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="field">
      <label htmlFor={listId}>
        {label}
        {required ? " *" : ""}
      </label>

      {selected ? (
        <div className="card" style={{ marginBottom: 8, padding: 12 }}>
          <div className="spread">
            <div className="grow">
              <strong>{selected.name}</strong>
              <div className="muted">{selected.address ?? "주소 정보 없음"}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setOptions([]);
              }}
            >
              변경
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            id={listId}
            type="search"
            autoComplete="off"
            placeholder="학교 이름을 두 글자 이상 입력하세요"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {state === "loading" ? (
            <p className="muted" style={{ marginTop: 6 }}>
              검색 중…
            </p>
          ) : null}
          {message ? (
            <p
              className={state === "error" ? "notice notice-error" : "muted"}
              style={{ marginTop: 6 }}
            >
              {message}
            </p>
          ) : null}
          {options.length > 0 ? (
            <ul className="list-reset" style={{ marginTop: 8 }}>
              {options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="btn-block"
                    style={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      marginBottom: 6,
                    }}
                    onClick={() => {
                      setSelected(option);
                      setOptions([]);
                      setMessage(null);
                    }}
                  >
                    <span className="grow">
                      <strong>{option.name}</strong>
                      <br />
                      <span className="muted">
                        {option.address ?? "주소 정보 없음"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input type="hidden" name="school_name" value={selected?.name ?? ""} />
    </div>
  );
}
