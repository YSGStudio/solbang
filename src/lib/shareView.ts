/**
 * 목록 / 지도 toggle for the share tab.
 *
 * Kept out of the ViewTabs component because the server page needs
 * `isShareView` to read the URL, and a "use client" module cannot be called
 * from the server.
 */
export const SHARE_VIEWS = ["list", "map"] as const;
export type ShareView = (typeof SHARE_VIEWS)[number];

export const SHARE_VIEW_LABELS: Record<ShareView, string> = {
  list: "목록으로 보기",
  map: "지도로 보기",
};

export function isShareView(value: unknown): value is ShareView {
  return SHARE_VIEWS.includes(value as ShareView);
}
