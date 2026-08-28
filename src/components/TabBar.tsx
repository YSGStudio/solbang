"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/share", label: "나눔", icon: "🎁" },
  { href: "/clubs", label: "모임", icon: "👥" },
  { href: "/board", label: "게시판", icon: "📋" },
  { href: "/schools", label: "학교정보", icon: "🏫" },
  { href: "/me", label: "내 설정", icon: "⚙️" },
];

/**
 * The five tabs. Bottom bar on phones, pill row from 720px up.
 * 소모임/번개모임 are sub-tabs inside /clubs rather than two entries here.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabs" aria-label="주요 메뉴">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
