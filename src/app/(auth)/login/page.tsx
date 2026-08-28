"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

export default function LoginPage() {
  const [state, action] = useActionState(signIn, undefined);

  return (
    <main className="center-page">
      <h1>교사 나눔터</h1>
      <p className="muted">승인된 현직 교사만 이용하는 공간입니다.</p>

      <form action={action} className="card" style={{ marginTop: 20 }}>
        {state?.error ? (
          <p className="notice notice-error">{state.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <SubmitButton className="btn-primary btn-block" pendingLabel="로그인 중…">
          로그인
        </SubmitButton>
      </form>

      <p className="muted" style={{ textAlign: "center" }}>
        아직 계정이 없으신가요? <Link href="/signup"><u>가입 신청</u></Link>
      </p>
    </main>
  );
}
