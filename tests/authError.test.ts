import assert from "node:assert/strict";
import { test } from "node:test";
import { signupErrorMessage } from "../src/lib/authError.ts";

test("Supabase email rate-limit code is shown as actionable Korean guidance", () => {
  assert.equal(
    signupErrorMessage({
      code: "over_email_send_rate_limit",
      message: "Email rate limit exceeded",
    }),
    "확인 이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 운영자에게 문의해 주세요.",
  );
});

test("email rate-limit message is recognized without an error code", () => {
  assert.match(
    signupErrorMessage({ message: "email rate limit exceeded" }),
    /발송 한도/,
  );
});

test("existing signup error mappings are preserved", () => {
  assert.equal(
    signupErrorMessage({ message: "User already registered" }),
    "이미 가입된 이메일입니다.",
  );
  assert.equal(
    signupErrorMessage({ message: "duplicate key profiles_nickname_key" }),
    "이미 사용 중인 닉네임입니다.",
  );
});
