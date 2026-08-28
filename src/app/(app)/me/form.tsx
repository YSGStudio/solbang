"use client";

import { useActionState } from "react";
import { updateProfile } from "./actions";
import { SchoolSearchInput } from "@/components/SchoolSearchInput";
import { SubmitButton } from "@/components/SubmitButton";

/** R27, R29. */
export function ProfileForm({
  nickname,
  fullName,
  email,
  school,
}: {
  nickname: string;
  fullName: string;
  email: string;
  school: { id: string; name: string; address: string | null } | null;
}) {
  const [state, action] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="card">
      {state?.error ? <p className="notice notice-error">{state.error}</p> : null}
      {state?.ok ? <p className="notice notice-info">저장했습니다.</p> : null}

      <div className="field">
        <label htmlFor="nickname">닉네임 (게시글에 표시됩니다)</label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          defaultValue={nickname}
          maxLength={20}
          required
        />
      </div>

      <SchoolSearchInput
        label="소속 학교"
        initialSchool={
          school
            ? { id: school.id, name: school.name, address: school.address }
            : null
        }
      />

      <p className="muted">
        학교 위치: {school?.address ?? "학교를 선택하면 주소가 표시됩니다."}
      </p>

      <hr className="divider" />
      <p className="muted">
        성함 {fullName} · {email}
        <br />
        성함과 이메일은 운영자 승인 정보라 이 화면에서 바꿀 수 없습니다.
      </p>

      <SubmitButton className="btn-primary btn-block" pendingLabel="저장 중…">
        저장
      </SubmitButton>
    </form>
  );
}
