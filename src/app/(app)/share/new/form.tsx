"use client";

import { useActionState } from "react";
import { createSharePost } from "../actions";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_SHARE_IMAGES } from "@/lib/categories";
import { formatCarbon } from "@/lib/format";

export function NewSharePostForm({
  itemTypes,
}: {
  itemTypes: { id: string; label: string; carbon_g: number }[];
}) {
  const [state, action] = useActionState(createSharePost, undefined);

  return (
    <main>
      <h1>나눔 글 쓰기</h1>

      <form action={action} className="card">
        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input id="title" name="title" type="text" maxLength={120} required />
        </div>

        <div className="field">
          <label htmlFor="description">물건 설명 *</label>
          <textarea
            id="description"
            name="description"
            placeholder="상태, 수량, 받으러 오실 수 있는 시간 등을 적어 주세요."
            required
          />
        </div>

        <CategoryPicker />

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="item_type_id">품목 유형 *</label>
          {itemTypes.length === 0 ? (
            <p className="notice notice-warn">
              등록된 품목 유형이 없습니다. 운영자에게 문의해 주세요.
            </p>
          ) : (
            <>
              <select id="item_type_id" name="item_type_id" required>
                <option value="">선택해 주세요</option>
                {itemTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label} (약 {formatCarbon(type.carbon_g)} 절감)
                  </option>
                ))}
              </select>
              <p className="muted" style={{ marginTop: 6 }}>
                나눔이 완료되면 이 품목의 절감량이 내 누적 탄소량에 더해집니다.
              </p>
            </>
          )}
        </div>

        <ImageUploader max={MAX_SHARE_IMAGES} min={1} label="사진" />

        <SubmitButton className="btn-primary btn-block" pendingLabel="올리는 중…">
          나눔 글 올리기
        </SubmitButton>
      </form>
    </main>
  );
}
