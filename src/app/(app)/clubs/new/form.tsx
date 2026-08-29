"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClubPost } from "../actions";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CLUB_KIND_LABELS,
  MAX_CLUB_IMAGES,
  type ClubKind,
} from "@/lib/categories";

/** T13 / R18, R19. No taxonomy yet — see migration 10. */
export function NewClubPostForm({ kind }: { kind: ClubKind }) {
  const [state, action] = useActionState(createClubPost, undefined);
  const label = CLUB_KIND_LABELS[kind];

  return (
    <main>
      <p className="muted">
        <Link href={kind === "club" ? "/clubs" : `/clubs?kind=${kind}`}>
          ← {label} 목록
        </Link>
      </p>

      <h1>{label} 열기</h1>

      <form action={action} className="card">
        <input type="hidden" name="kind" value={kind} />

        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        {kind === "flash" ? (
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div className="field grow">
              <label htmlFor="meet_date">만나는 날짜 *</label>
              <input id="meet_date" name="meet_date" type="date" required />
            </div>
            <div className="field grow">
              <label htmlFor="meet_time">만나는 시간 *</label>
              <input id="meet_time" name="meet_time" type="time" required />
            </div>
          </div>
        ) : null}

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
