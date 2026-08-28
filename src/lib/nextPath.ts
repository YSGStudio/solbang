/**
 * Where to send someone after they sign in.
 *
 * The middleware puts the blocked path in `?next=`, which means the value is
 * attacker-controllable: anyone can hand out /login?next=<anything>. Only
 * same-site relative paths are honoured, because "//evil.example" and
 * "https://evil.example" are both absolute URLs to the browser and would make
 * this an open redirect.
 */
export const DEFAULT_AFTER_LOGIN = "/share";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeNextPath(value: unknown): string {
  const path = String(value ?? "");

  // Must be a rooted path, and not a protocol-relative URL.
  if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_AFTER_LOGIN;
  // Some browsers read "/\\evil.example" as protocol-relative too.
  if (path.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  // A newline would let the value split the Location header.
  if (CONTROL_CHARS.test(path)) return DEFAULT_AFTER_LOGIN;

  return path;
}
