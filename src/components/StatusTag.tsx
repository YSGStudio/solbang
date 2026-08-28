import { SHARE_STATUS_LABELS, type ShareStatus } from "@/lib/categories";

/** R11. Status tag shown on both the list and the detail screen. */
export function StatusTag({ status }: { status: ShareStatus }) {
  return (
    <span className={`tag tag-${status}`}>{SHARE_STATUS_LABELS[status]}</span>
  );
}
