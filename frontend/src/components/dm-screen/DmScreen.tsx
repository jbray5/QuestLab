import { useEffect, useMemo, useRef, useState } from "react";

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
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-label="DM Screen">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Sticky header: title + search + close */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h2 style={titleStyle}>📖 DM Screen</h2>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rules (prone, shove, oa…)"
              style={searchStyle}
            />
            <button onClick={onClose} style={closeBtnStyle} title="Close (Esc)">
              ✕
            </button>
          </div>

          {/* Tabs (hidden during search) */}
          {!searching && (
            <div style={tabsStyle}>
              {DM_SCREEN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...tabBtnStyle,
                    background: tab.id === activeTab ? "var(--gold)" : "var(--surface2)",
                    color: tab.id === activeTab ? "var(--bg, #1a1a1a)" : "var(--text)",
                    borderColor:
                      tab.id === activeTab ? "var(--gold)" : "var(--border)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={bodyStyle}>
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
          <span
            style={{
              fontSize: "0.65rem",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
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
  background: "var(--bg, #1a1a1a)",
  border: "1px solid var(--gold)",
  borderRadius: 10,
  width: "100%",
  maxWidth: 880,
  maxHeight: "calc(100vh - 2rem)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "0.85rem 1rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface, #1f1f1f)",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  whiteSpace: "nowrap",
};

const searchStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.45rem 0.7rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  width: 32,
  height: 32,
  cursor: "pointer",
  fontSize: "1rem",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.3rem",
  marginTop: "0.65rem",
  flexWrap: "wrap",
};

const tabBtnStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  padding: "0.3rem 0.7rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem",
  overflowY: "auto",
  flex: 1,
};

const entriesStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.75rem 0.9rem",
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  letterSpacing: "0.03em",
};

const cardBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.86rem",
  lineHeight: 1.5,
  color: "var(--text)",
  whiteSpace: "pre-wrap",
};
