"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createClubPost } from "../actions";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CLUB_KIND_LABELS,
  MAX_CLUB_IMAGES,
  type ClubKind,
} from "@/lib/categories";
import { combineKst, formatMeetAt, kstParts } from "@/lib/meetTime";

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function defaultFlashTime() {
  const now = kstParts(new Date());
  const today = `${now.year}-${now.month}-${now.day}`;
  const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
  const rounded = Math.ceil((currentMinutes + 30) / 30) * 30;
  const dayOffset = Math.floor(rounded / (24 * 60));
  const timeMinutes = rounded % (24 * 60);
  return {
    today,
    date: shiftDate(today, dayOffset),
    time: `${String(Math.floor(timeMinutes / 60)).padStart(2, "0")}:${String(timeMinutes % 60).padStart(2, "0")}`,
  };
}

/** T13 / R18, R19. No taxonomy yet — see migration 10. */
export function NewClubPostForm({ kind }: { kind: ClubKind }) {
  const [state, action] = useActionState(createClubPost, undefined);
  const label = CLUB_KIND_LABELS[kind];
  const defaults = defaultFlashTime();
  const [meetDate, setMeetDate] = useState(defaults.date);
  const [meetTime, setMeetTime] = useState(defaults.time);
  const preview = combineKst(meetDate, meetTime);

  return (
    <main className={kind === "flash" ? "club-create-page flash-create-page" : "club-create-page"}>
      <Link href={kind === "club" ? "/clubs" : `/clubs?kind=${kind}`} className="club-create-back">
        ← {label} 목록으로
      </Link>

      <header className="club-create-hero">
        <span className="club-create-icon" aria-hidden="true">{kind === "flash" ? "⚡" : "👥"}</span>
        <div>
          <span className="club-create-eyebrow">{kind === "flash" ? "QUICK MEETUP" : "NEW GROUP"}</span>
          <h1>{label} 열기</h1>
          <p>{kind === "flash" ? "가볍게 만날 날짜와 시간을 먼저 정해 보세요." : "함께할 선생님을 위한 모임을 소개해 주세요."}</p>
        </div>
      </header>

      <form action={action} className="card club-create-form">
        <input type="hidden" name="kind" value={kind} />

        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        {kind === "flash" ? (
          <section className="flash-schedule-card">
            <div className="flash-schedule-heading">
              <span className="flash-schedule-icon" aria-hidden="true">🗓️</span>
              <div>
                <span>STEP 1</span>
                <h2>언제 만날까요?</h2>
                <p>날짜와 시간을 선택하면 달력에 일정이 표시돼요.</p>
              </div>
            </div>

            <div className="flash-quick-row" aria-label="날짜 빠른 선택">
              <span>빠른 날짜</span>
              <div>
                {[
                  { label: "오늘", value: defaults.today },
                  { label: "내일", value: shiftDate(defaults.today, 1) },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={meetDate === option.value ? "is-selected" : ""}
                    onClick={() => setMeetDate(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flash-datetime-grid">
              <div className="field">
                <label htmlFor="meet_date"><span aria-hidden="true">📅</span> 만나는 날짜</label>
                <input
                  id="meet_date"
                  name="meet_date"
                  type="date"
                  min={defaults.today}
                  value={meetDate}
                  onChange={(event) => setMeetDate(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="meet_time"><span aria-hidden="true">🕐</span> 만나는 시간</label>
                <input
                  id="meet_time"
                  name="meet_time"
                  type="time"
                  value={meetTime}
                  onChange={(event) => setMeetTime(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flash-quick-row" aria-label="시간 빠른 선택">
              <span>자주 쓰는 시간</span>
              <div>
                {[{ label: "오후 4시", value: "16:00" }, { label: "오후 6시", value: "18:00" }, { label: "오후 7시", value: "19:00" }].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={meetTime === option.value ? "is-selected" : ""}
                    onClick={() => setMeetTime(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flash-schedule-preview" aria-live="polite">
              <span aria-hidden="true">⚡</span>
              <div>
                <small>선택한 모임 일정</small>
                <strong>{preview ? formatMeetAt(preview) : "날짜와 시간을 선택해 주세요"}</strong>
              </div>
            </div>
          </section>
        ) : null}

        <div className="club-form-section-title">
          <span>{kind === "flash" ? "STEP 2" : "모임 정보"}</span>
          <h2>어떤 모임인가요?</h2>
        </div>

        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input id="title" name="title" type="text" maxLength={120} required />
        </div>

        <div className="field">
          <label htmlFor="description">
            {kind === "flash" ? "번개모임 설명 *" : "소모임 설명 *"}
          </label>
          <textarea
            id="description"
            name="description"
            placeholder={
              kind === "flash"
                ? "언제 어디서 만나는지, 몇 분까지 받는지 적어 주세요."
                : "어떤 모임인지, 언제 어디서 모이는지 적어 주세요."
            }
            required
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <ImageUploader max={MAX_CLUB_IMAGES} label="사진 (선택)" />
        </div>

        <SubmitButton className="btn-primary btn-block" pendingLabel="올리는 중…">
          {label} 글 올리기
        </SubmitButton>
      </form>
    </main>
  );
}
