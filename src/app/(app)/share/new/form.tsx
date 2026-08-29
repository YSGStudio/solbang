"use client";

import { useActionState } from "react";
import { createSharePost } from "../actions";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import { ITEM_CONDITIONS, MAX_SHARE_IMAGES } from "@/lib/categories";
import type { PickerItemType } from "@/components/CategoryPicker";

export function NewSharePostForm({
  itemTypes,
}: {
  itemTypes: PickerItemType[];
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

        <div className="field">
          <label htmlFor="usage_tips">활용 팁</label>
          <textarea
            id="usage_tips"
            name="usage_tips"
            placeholder="어떤 수업에서 어떻게 쓰면 좋은지 알려 주세요. (선택)"
          />
        </div>

        <div className="field">
          <label htmlFor="condition">물건 상태 *</label>
          <select id="condition" name="condition" defaultValue="" required>
            <option value="" disabled>선택해 주세요</option>
            {ITEM_CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <CategoryPicker itemTypes={itemTypes} />


        <ImageUploader max={MAX_SHARE_IMAGES} min={1} label="사진" />

        <SubmitButton className="btn-primary btn-block" pendingLabel="올리는 중…">
          나눔 글 올리기
        </SubmitButton>
      </form>
    </main>
  );
}
