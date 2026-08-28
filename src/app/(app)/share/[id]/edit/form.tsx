"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateSharePost } from "../../actions";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ImageUploader } from "@/components/ImageUploader";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ITEM_CONDITIONS,
  MAX_SHARE_IMAGES,
  type SchoolLevel,
  type ShareStatus,
} from "@/lib/categories";

type ExistingImage = { path: string; url: string | undefined };

export function EditSharePostForm({
  post,
  images,
}: {
  post: {
    id: string;
    title: string;
    description: string;
    usageTips: string;
    condition: string;
    schoolLevel: SchoolLevel;
    category: string;
    subject: string;
    status: ShareStatus;
    itemTypeLabel: string | null;
  };
  images: ExistingImage[];
}) {
  const [state, action] = useActionState(updateSharePost, undefined);
  const [removed, setRemoved] = useState<string[]>([]);

  const keptCount = images.length - removed.length;

  function toggle(path: string) {
    setRemoved((current) =>
      current.includes(path)
        ? current.filter((p) => p !== path)
        : [...current, path],
    );
  }

  return (
    <main>
      <p className="muted">
        <Link href={`/share/${post.id}`}>← 글로 돌아가기</Link>
      </p>

      <h1>나눔 글 수정</h1>

      <form action={action} className="card">
        <input type="hidden" name="post_id" value={post.id} />
        {removed.map((path) => (
          <input key={path} type="hidden" name="remove_images" value={path} />
        ))}

        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        {post.status === "reserved" ? (
          <p className="notice notice-warn">
            예약중인 글입니다. 예약한 선생님이 이미 내용을 보았으니, 크게 바뀌는
            내용이라면 댓글로 알려 주세요.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input
            id="title"
            name="title"
            type="text"
            maxLength={120}
            defaultValue={post.title}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="description">물건 설명 *</label>
          <textarea
            id="description"
            name="description"
            defaultValue={post.description}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="usage_tips">활용 팁</label>
          <textarea
            id="usage_tips"
            name="usage_tips"
            defaultValue={post.usageTips}
            placeholder="어떤 수업에서 어떻게 쓰면 좋은지 알려 주세요. (선택)"
          />
        </div>

        <div className="field">
          <label htmlFor="condition">물건 상태 *</label>
          <select
            id="condition"
            name="condition"
            defaultValue={post.condition}
            required
          >
            {ITEM_CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <CategoryPicker
          defaultLevel={post.schoolLevel}
          defaultCategory={post.category}
          defaultSubject={post.subject}
        />

        {/* R16: the carbon snapshot is frozen at write time, so the item type
            cannot move. Shown as a fact rather than hidden entirely. */}
        <div className="field" style={{ marginTop: 14 }}>
          <label>품목 유형</label>
          <p className="muted" style={{ margin: 0 }}>
            {post.itemTypeLabel ?? "알 수 없음"} · 탄소 절감량은 작성 시점 값으로
            고정되어 있어 품목 유형은 바꿀 수 없습니다.
          </p>
        </div>

        {images.length > 0 ? (
          <div className="field">
            <label>기존 사진 ({keptCount}장 유지)</label>
            <div className="thumb-grid">
              {images.map((image) => {
                const isRemoved = removed.includes(image.path);
                return (
                  <div key={image.path}>
                    {image.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={image.url}
                        alt=""
                        className="thumb"
                        style={{
                          aspectRatio: "1 / 1",
                          opacity: isRemoved ? 0.35 : 1,
                        }}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggle(image.path)}
                      style={{ width: "100%", marginTop: 4, minHeight: 32 }}
                    >
                      {isRemoved ? "되돌리기" : "삭제"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <ImageUploader
          max={MAX_SHARE_IMAGES}
          label="사진 추가 (선택)"
        />

        <p className="muted">
          사진은 1~{MAX_SHARE_IMAGES}장이어야 합니다. 지금 유지 {keptCount}장.
        </p>

        <SubmitButton className="btn-primary btn-block" pendingLabel="저장하는 중…">
          수정 저장
        </SubmitButton>
      </form>
    </main>
  );
}
