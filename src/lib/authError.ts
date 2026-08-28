const EMAIL_RATE_LIMIT_MESSAGE =
  "확인 이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 운영자에게 문의해 주세요.";

/** Convert Supabase Auth errors that users can act on into Korean guidance. */
export function signupErrorMessage(error: { message: string; code?: string }): string {
  if (
    error.code === "over_email_send_rate_limit" ||
    /email.*rate limit|rate limit.*email/i.test(error.message)
  ) {
    return EMAIL_RATE_LIMIT_MESSAGE;
  }

  if (/duplicate key|profiles_nickname_key/i.test(error.message)) {
    return "이미 사용 중인 닉네임입니다.";
  }

  if (/already registered|already been registered/i.test(error.message)) {
    return "이미 가입된 이메일입니다.";
  }

  return `가입에 실패했습니다: ${error.message}`;
}
