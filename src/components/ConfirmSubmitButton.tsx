"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that asks first. Destructive actions only — the server
 * action re-checks ownership, so this is a courtesy, not a guard.
 */
export function ConfirmSubmitButton({
  children,
  message,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  message: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? (pendingLabel ?? "처리 중…") : children}
    </button>
  );
}
