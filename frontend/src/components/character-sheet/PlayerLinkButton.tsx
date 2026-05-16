import { useState } from "react";

interface Props {
  characterId: string;
  /** Compact icon-only variant for tight rows (HUD party panel). */
  compact?: boolean;
}

/**
 * "Share player link" button (Plan 00025).
 *
 * Builds the absolute URL to the PlayerView (/play/:pcId) and offers a
 * one-tap "Copy link" action so the DM can text it to a player. Falls
 * back to displaying the URL in a textbox if the clipboard API isn't
 * available (e.g. older browsers / non-secure contexts).
 */
export default function PlayerLinkButton({ characterId, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/play/${characterId}`
    : `/play/${characterId}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; popover still shows the URL for manual copy.
      setCopied(false);
    }
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Share this player's view link"
        style={{
          padding: compact ? "0.15rem 0.4rem" : "0.3rem 0.6rem",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--gold)",
          fontSize: compact ? "0.7rem" : "0.78rem",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        🔗 {compact ? "" : "Share"}
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 200 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 201,
              width: 320,
              maxWidth: "90vw",
              background: "var(--surface, #1f1f1f)",
              border: "1px solid var(--gold)",
              borderRadius: 6,
              padding: "0.75rem",
              boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--muted)",
                marginBottom: "0.4rem",
                lineHeight: 1.4,
              }}
            >
              Send this URL to the player. Their character only.
              They don't need to log in.
            </div>
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text)",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                marginBottom: "0.5rem",
              }}
            />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                onClick={handleCopy}
                className="btn btn-primary"
                style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem" }}
              >
                {copied ? "✓ Copied" : "Copy link"}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "0.8rem",
                  padding: "0.4rem",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Open
              </a>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
