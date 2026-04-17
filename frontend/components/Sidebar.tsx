"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/upload",
    label: "Upload",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M12 16V4" />
        <path d="M8 8l4-4 4 4" />
        <path d="M4 20h16" />
      </svg>
    ),
  },
  {
    href: "/flashcard",
    label: "Flashcards",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <rect x="5" y="7" width="11" height="8" rx="2" />
        <path d="M9 5h10v8" />
        <path d="M8.5 10.5h4" />
      </svg>
    ),
  },
  {
    href: "/studyguide",
    label: "Study Guide",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5" />
        <path d="M5.5 6.5V20" />
        <path d="M9.5 8h6" />
        <path d="M9.5 11h6" />
      </svg>
    ),
  },
  {
    href: "/podcast",
    label: "Podcast",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M4 13a8 8 0 0 1 16 0" />
        <rect x="4" y="13" width="3.5" height="6" rx="1.5" />
        <rect x="16.5" y="13" width="3.5" height="6" rx="1.5" />
        <path d="M7.5 19a4.5 4.5 0 0 0 9 0" />
      </svg>
    ),
  },
  {
    href: "/mockquiz",
    label: "Mock Quiz",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/voice-learning",
    label: "Voice Learning",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    href: "/discord",
    label: "Discord",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M20 4a16.5 16.5 0 0 0-4.1-1.3l-.2.4a15.3 15.3 0 0 0-3.7 0l-.2-.4A16.5 16.5 0 0 0 4 4C1.5 7.7.8 11.3 1 14.8a17 17 0 0 0 5.1 2.6l.5-.7a11 11 0 0 1-1.7-1 10.2 10.2 0 0 0 .4.3c1.7 1 3.6 1.6 5.7 1.6s4-.6 5.7-1.6l.4-.3a11 11 0 0 1-1.7 1l.5.7a17 17 0 0 0 5.1-2.6c.3-3.6-.4-7.1-2.1-10.9ZM8.5 12.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
      </svg>
    ),
  },
];

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, loading, signIn, signOut } = useAuth();

  const initials = user?.display_name
    ? user.display_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="pu-glass pu-sidebar">
      <div className="pu-brandRow">
        <Link href="/dashboard" className="pu-brand">PrepareUp</Link>
      </div>

      <div className="pu-sectionLabel">Navigation</div>
      <nav className="pu-sideNav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`pu-sideItem${isNavActive(item.href, pathname) ? " active" : ""}`}
          >
            <span className="pu-sideIcon" aria-hidden="true">{item.icon}</span>
            <span className="pu-sideLabel">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div className="pu-userSection">
        {loading ? (
          <div className="pu-userChipSmall">
            <div className="pu-avatar">…</div>
            <div className="pu-userHint">Loading…</div>
          </div>
        ) : user ? (
          <div className="pu-userChipSmall">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name || ""} className="pu-avatarImg" />
            ) : (
              <div className="pu-avatar">{initials}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pu-userName" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.display_name || user.email || "User"}
              </div>
              <div className="pu-userHint">{user.email || ""}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="pu-btn"
              style={{ fontSize: 10, height: 28, padding: "0 10px", flexShrink: 0 }}
              type="button"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button onClick={signIn} className="pu-btn pu-btnPrimary" type="button" style={{ width: "100%", justifyContent: "center" }}>
            Sign in with Google
          </button>
        )}
      </div>

      <style jsx>{`
        .pu-sidebar {
          padding: 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .pu-brandRow {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
        }
        .pu-brand {
          font-weight: 950;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, #5aa8ff, #5fe3ff);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: 15px;
          text-decoration: none;
        }
        .pu-sectionLabel {
          margin-top: 14px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.48);
        }
        .pu-sideNav {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow-y: auto;
        }
        .pu-sideItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(10,12,18,0.2);
          cursor: pointer;
          text-decoration: none;
          color: rgba(255,255,255,0.88);
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
          position: relative;
          overflow: hidden;
        }
        .pu-sideItem:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(95,227,255,0.18);
          transform: translateY(-1px);
        }
        .pu-sideItem.active {
          border-color: rgba(95,227,255,0.26);
          background: rgba(255,255,255,0.05);
        }
        .pu-sideItem.active::before {
          content: "";
          position: absolute;
          left: 10px;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, #5fe3ff, #5aa8ff);
        }
        .pu-sideIcon {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          color: rgba(255,255,255,0.72);
          flex-shrink: 0;
        }
        .pu-sideLabel {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.88);
        }
        .pu-userSection {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .pu-userChipSmall {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pu-avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          display: grid;
          place-items: center;
          font-weight: 950;
          font-size: 11px;
          color: rgba(255,255,255,0.92);
          flex-shrink: 0;
        }
        .pu-avatarImg {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .pu-userHint {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.5);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pu-userName {
          font-size: 11px;
          font-weight: 900;
          color: rgba(255,255,255,0.9);
        }
        .pu-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.92);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease;
          white-space: nowrap;
        }
        .pu-btn:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06);
          border-color: rgba(95,227,255,0.22);
        }
        .pu-btnPrimary {
          background: linear-gradient(90deg, rgba(90,168,255,0.9), rgba(95,227,255,0.9));
          color: rgba(0,0,0,0.9);
          border-color: transparent;
        }
      `}</style>
    </aside>
  );
}
