import Link from "next/link";
import { CLUB_KINDS, CLUB_KIND_LABELS, type ClubKind } from "@/lib/categories";

/** 소모임 / 번개모임 sub-tabs inside the clubs tab. */
export function KindTabs({ active }: { active: ClubKind }) {
  return (
    <nav className="subtabs" aria-label="모임 종류">
      {CLUB_KINDS.map((kind) => (
        <Link
          key={kind}
          href={kind === "club" ? "/clubs" : `/clubs?kind=${kind}`}
          aria-current={kind === active ? "page" : undefined}
        >
          {CLUB_KIND_LABELS[kind]}
        </Link>
      ))}
    </nav>
  );
}
