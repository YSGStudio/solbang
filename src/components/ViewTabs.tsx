"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SHARE_VIEWS,
  SHARE_VIEW_LABELS,
  type ShareView,
} from "@/lib/shareView";

/**
 * 목록 / 지도 toggle for the share tab. Held in the URL alongside the filters
 * so a filtered map stays a filtered map on refresh and on share.
 */
export function ViewTabs({ active }: { active: ShareView }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(view: ShareView) {
    const query = new URLSearchParams(params.toString());
    if (view === "list") query.delete("view");
    else query.set("view", view);
    const qs = query.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav className="subtabs" aria-label="보기 방식">
      {SHARE_VIEWS.map((view) => (
        <Link
          key={view}
          href={hrefFor(view)}
          aria-current={view === active ? "page" : undefined}
        >
          {SHARE_VIEW_LABELS[view]}
        </Link>
      ))}
    </nav>
  );
}
