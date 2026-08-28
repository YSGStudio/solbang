"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { SchoolSearchInput } from "@/components/SchoolSearchInput";

export default function SignupPage() {
  const [state, action] = useActionState(signUp, undefined);

  return (
    <main className="center-page">
      <div className="brand-hero">
        <Image src="/logo.png" alt="" width={77} height={104} priority />
        <h1 style={{ margin: 0 }}>가입 신청</h1>
      </div>
      <p className="muted">
        가입 후 운영자 승인을 받아야 나눔·소모임·학교정보를 이용할 수 있습니다.
      </p>

      <form action={action} className="card" style={{ marginTop: 20 }}>
        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="email">이메일 *</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="field">
          <label htmlFor="password">비밀번호 * (8자 이상)</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="full_name">성함 *</label>
          <input id="full_name" name="full_name" type="text" required />
        </div>

        <div className="field">
          <label htmlFor="nickname">닉네임 * (게시글에 표시됩니다)</label>
          <input id="nickname" name="nickname" type="text" required />
        </div>

        <SchoolSearchInput label="소속 학교" required />

        <SubmitButton className="btn-primary btn-block" pendingLabel="신청 중…">
          가입 신청
        </SubmitButton>
      </form>

      <p className="muted" style={{ textAlign: "center" }}>
        이미 계정이 있으신가요? <Link href="/login"><u>로그인</u></Link>
      </p>
    </main>
  );
}
