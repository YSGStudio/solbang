"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createBoardPost } from "../actions";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_BOARD_IMAGES } from "@/lib/categories";

export default function NewBoardPostPage() {
  const [state, action] = useActionState(createBoardPost, undefined);

  return (
    <main>
      <p className="muted">
        <Link href="/board">← 게시판</Link>
      </p>

      <h1>글쓰기</h1>

      <form action={action} className="card">
        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input id="title" name="title" type="text" maxLength={120} required />
        </div>

        <div className="field">
          <label htmlFor="description">내용 *</label>
          <textarea
            id="description"
            name="description"
            placeholder="나누고 싶은 이야기를 적어 주세요."
            required
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <ImageUploader max={MAX_BOARD_IMAGES} label="사진 (선택)" />
        </div>

        <SubmitButton className="btn-primary btn-block" pendingLabel="올리는 중…">
          글 올리기
        </SubmitButton>
      </form>
    </main>
  );
}
