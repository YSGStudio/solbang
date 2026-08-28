import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, DEFAULT_AFTER_LOGIN } from "../src/lib/nextPath.ts";

test("a normal in-app path is kept", () => {
  assert.equal(safeNextPath("/board"), "/board");
  assert.equal(safeNextPath("/share?view=map"), "/share?view=map");
  assert.equal(safeNextPath("/clubs/abc-123"), "/clubs/abc-123");
});

test("missing or empty falls back to the default", () => {
  assert.equal(safeNextPath(undefined), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath(null), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath(""), DEFAULT_AFTER_LOGIN);
});

test("an absolute URL is not an open redirect", () => {
  assert.equal(safeNextPath("https://evil.example"), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath("http://evil.example/x"), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath("javascript:alert(1)"), DEFAULT_AFTER_LOGIN);
});

test("a protocol-relative URL is not an open redirect", () => {
  assert.equal(safeNextPath("//evil.example"), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath("//evil.example/share"), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath("/\\evil.example"), DEFAULT_AFTER_LOGIN);
});

test("a header-splitting attempt is refused", () => {
  assert.equal(safeNextPath("/share\nLocation: https://evil.example"), DEFAULT_AFTER_LOGIN);
  assert.equal(safeNextPath("/share\r\nSet-Cookie: a=b"), DEFAULT_AFTER_LOGIN);
});
