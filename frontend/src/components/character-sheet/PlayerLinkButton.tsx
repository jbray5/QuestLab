import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2 } from "lucide-react";

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
 *
 * Plan 39 P3 — the popover is rendered through a portal to document.body.
 * The character-sheet modal (.ql-modal-in) keeps a retained `transform`
 * from its `both` fill-mode animation, which turns it into the containing
 * block for any `position: fixed` descendant AND clips it via the sheet's
 * `overflow: hidden`. Portalling out of that subtree is the only reliable
 * escape; the viewport-coordinate anchor below is already correct for it.
 *
 * Anchor left-to-left (not right-to-right): the Share button sits on the
 * LEFT side of the sheet header, so anchoring the popover's right edge to
 * the button's right edge pushed a 320px popover off-screen to the left.
 * Anchor left = button's left edge, clamped to keep the popover on-screen.
 */
const POPOVER_W = 320;

export default function PlayerLinkButton({ characterId, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function recompute() {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - 16 - POPOVER_W);
      setAnchor({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, maxLeft)),
      });
    }
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open]);

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
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Share this player's view link"
        aria-label={compact ? "Share player link" : undefined}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: compact ? "0.2rem 0.35rem" : "0.3rem 0.65rem",
          background: "transparent",
          border: "1px solid var(--border2)",
          borderRadius: 6,
          color: "var(--text2)",
          fontSize: compact ? "0.75rem" : "0.8125rem",
          cursor: "pointer",
          fontFamily: "inherit",
          lineHeight: 1.2,
        }}
      >
        <Link2 size={compact ? 13 : 14} />
        {compact ? null : "Share player link"}
      </button>
      {open && anchor && createPortal(
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9600 }}
          />
          <div
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              zIndex: 9601,
              width: POPOVER_W,
              maxWidth: "calc(100vw - 16px)",
              background: "var(--surface)",
              border: "1px solid var(--border2)",
              borderRadius: 10,
              padding: "0.8rem",
              boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--text2)",
                marginBottom: "0.5rem",
                lineHeight: 1.45,
              }}
            >
              Send this link to the player. It opens their character only — no sign-in needed.
            </div>
            <input
              type="text"
              readOnly
              value={url}
              aria-label="Player link"
              onFocus={(e) => e.currentTarget.select()}
              className="num"
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                fontSize: "0.8125rem",
                marginBottom: "0.55rem",
              }}
            />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                onClick={handleCopy}
                className="btn btn-primary"
                style={{ flex: 1, fontSize: "0.875rem", padding: "0.4rem" }}
              >
                {copied ? (
                  <>
                    <Check size={15} /> Copied
                  </>
                ) : (
                  "Copy link"
                )}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{
                  flex: 1,
                  fontSize: "0.875rem",
                  padding: "0.4rem",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Open
              </a>
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
