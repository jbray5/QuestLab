import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";

import { useIsCompact } from "../../hooks/useIsCompact";
import { DM_SCREEN_TABS, type RulesEntry } from "./dm-screen-content";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * DM Screen — full-screen rules reference modal (Plan 00027).
 *
 * Tabs across the top (Action Economy, Conditions, Damage, Cover, etc.)
 * with a search box that filters across all tabs. Designed for the DM
 * to pull up at the table when a new player asks "what does that do?"
 * and the DM doesn't want to flip through the PHB.
 *
 * Mobile-friendly: tabs wrap, content scrolls. ESC and click-outside
 * dismiss.
 */
export default function DmScreen({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState(DM_SCREEN_TABS[0].id);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Plan 123 — a phone gets the whole screen: title and close on top, the search
  // on its own row, the tabs in one sideways-scrolling row.
  const phone = useIsCompact(640);

  // ESC dismisses + autofocus search on open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const matches = useMemo(() => {
    if (!searching) return null;
    const all: Array<{ tabLabel: string; entry: RulesEntry }> = [];
    for (const tab of DM_SCREEN_TABS) {
      for (const entry of tab.entries) {
        const haystack = [
          entry.title,
          entry.body,
          ...(entry.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(q)) {
          all.push({ tabLabel: tab.label, entry });
        }
      }
    }
    return all;
  }, [q, searching]);

  if (!open) return null;

  const activeTabData = DM_SCREEN_TABS.find((t) => t.id === activeTab);

  return (
    // On a phone it covers the dice button too (it has its own close); sheets stay above.
    <div style={phone ? { ...overlayStyle, padding: 0, zIndex: 8500 } : overlayStyle} onClick={onClose} role="dialog" aria-label="DM Screen">
      <div
        className="ql-modal-in"
        style={phone ? { ...modalStyle, height: "100dvh", maxHeight: "100dvh", borderRadius: 0, border: "none" } : modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header: title + search + close */}
        <div style={phone ? { ...headerStyle, padding: "0.6rem 0.75rem 0.5rem" } : headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: phone ? "0.5rem" : "0.75rem", flexWrap: phone ? "wrap" : undefined }}>
            <h2 style={titleStyle}>
              <BookOpen size={18} aria-hidden style={{ color: "var(--muted)" }} />
              DM screen
            </h2>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rules (prone, shove, oa…)"
              aria-label="Search the rules"
              style={phone ? { ...searchStyle, order: 3, flexBasis: "100%", minHeight: 44, fontSize: 16 } : searchStyle}
            />
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={phone ? { ...closeBtnStyle, width: 44, minHeight: 44, marginLeft: "auto" } : closeBtnStyle}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* Tabs (hidden during search) */}
          {!searching && (
            <div
              className={phone ? "ql-scroll-x" : undefined}
              style={phone ? { ...tabsStyle, flexWrap: "nowrap", gap: "0.4rem", margin: "0.5rem -0.75rem 0", padding: "0 0.75rem" } : tabsStyle}
            >
              {DM_SCREEN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className="btn btn-ghost"
                  aria-pressed={tab.id === activeTab}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...tabBtnStyle,
                    ...(phone ? { minHeight: 44, fontSize: "0.875rem" } : {}),
                    ...(tab.id === activeTab
                      ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
                      : {}),
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={phone ? { ...bodyStyle, padding: "0.75rem 0.75rem calc(1rem + env(safe-area-inset-bottom, 0px))" } : bodyStyle}>
          {searching ? (
            <SearchResults matches={matches ?? []} query={q} />
          ) : (
            activeTabData && (
              <div style={entriesStyle}>
                {activeTabData.entries.map((entry) => (
                  <EntryCard key={entry.title} entry={entry} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  matches,
  query,
}: {
  matches: Array<{ tabLabel: string; entry: RulesEntry }>;
  query: string;
}) {
  if (matches.length === 0) {
    return (
      <p
        style={{
          color: "var(--muted)",
          textAlign: "center",
          padding: "2rem 1rem",
          fontSize: "0.9rem",
        }}
      >
        No matches for <strong>"{query}"</strong>. Try a shorter term — e.g.
        "oa" for opportunity attack, "dc" for the DC table, "rest" for rest
        mechanics.
      </p>
    );
  }
  return (
    <div style={entriesStyle}>
      {matches.map(({ tabLabel, entry }) => (
        <EntryCard key={`${tabLabel}-${entry.title}`} entry={entry} tabLabel={tabLabel} />
      ))}
    </div>
  );
}

function EntryCard({ entry, tabLabel }: { entry: RulesEntry; tabLabel?: string }) {
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.35rem",
        }}
      >
        <h3 style={cardTitleStyle}>{entry.title}</h3>
        {tabLabel && (
          <span className="pill" style={{ fontSize: "0.75rem", padding: "0 0.5rem" }}>
            {tabLabel}
          </span>
        )}
      </div>
      <p style={cardBodyStyle}>{entry.body}</p>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.78)",
  zIndex: 400,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 12,
  width: "100%",
  maxWidth: 880,
  maxHeight: "calc(100dvh - 2rem)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
};

const headerStyle: React.CSSProperties = {
  padding: "0.85rem 1rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  color: "var(--text)",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
};

const searchStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.45rem 0.7rem",
  fontSize: "0.9375rem",
};

const closeBtnStyle: React.CSSProperties = {
  width: 36,
  minHeight: 36,
  padding: 0,
  flex: "none",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.3rem",
  marginTop: "0.65rem",
  flexWrap: "wrap",
};

const tabBtnStyle: React.CSSProperties = {
  minHeight: 30,
  fontSize: "0.8125rem",
  padding: "0.2rem 0.7rem",
  color: "var(--text2)",
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem",
  overflowY: "auto",
  flex: 1,
  // Flex children don't shrink below content without minHeight 0 — on a
  // phone the body clipped instead of scrolling (Plan 73b).
  minHeight: 0,
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
};

const entriesStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "0.75rem 0.9rem",
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.9875rem",
  fontWeight: 600,
  color: "var(--text)",
};

const cardBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  lineHeight: 1.55,
  color: "var(--text2)",
  whiteSpace: "pre-wrap",
};
