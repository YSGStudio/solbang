"use client";

import { useActionState } from "react";
import { createClubPost } from "../actions";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_CLUB_IMAGES } from "@/lib/categories";

/** T13 / R18, R19. */
export default function NewClubPostPage() {
  const [state, action] = useActionState(createClubPost, undefined);

  return (
    <main>
      <h1>소모임 열기</h1>

      <form action={action} className="card">
        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input id="title" name="title" type="text" maxLength={120} required />
        </div>

        <div className="field">
          <label htmlFor="description">소모임 설명 *</label>
          <textarea
            id="description"
            name="description"
            placeholder="어떤 모임인지, 언제 어디서 모이는지 적어 주세요."
            required
          />
        </div>

        <CategoryPicker />

        <div style={{ marginTop: 14 }}>
          <ImageUploader max={MAX_CLUB_IMAGES} label="사진 (선택)" />
        </div>

        <SubmitButton className="btn-primary btn-block" pendingLabel="올리는 중…">
          소모임 글 올리기
        </SubmitButton>
      </form>
    </main>
  );
}
