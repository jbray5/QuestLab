import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Link2, RotateCcw } from "lucide-react";

import { charactersApi } from "../../api/characters";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useIsCompact } from "../../hooks/useIsCompact";
import PhoneSheet from "../PhoneSheet";

interface Props {
  characterId: string;
  /** SEC-002 — the link's secret; the URL is /play/{playToken}. */
  playToken?: string | null;
  /** Used in the reset confirmation and the controls' names. */
  characterName?: string;
  /** Plan 139 — set once a player has this character; the party's list stops opening it. */
  claimedAt?: string | null;
  /** Compact icon-only variant for tight rows (HUD party panel). */
  compact?: boolean;
}

/**
 * "Share player link" button (Plan 00025).
 *
 * Builds the absolute URL to the PlayerView (/play/:pcId) and offers a
 * one-tap "Copy link" action so the DM can text it to a player. The URL
 * also sits in a read-only box for copying by hand when the clipboard API
 * isn't available.
 *
 * Plan 39 P3 — on a laptop the popover is rendered through a portal to
 * document.body. The character-sheet modal (.ql-modal-in) keeps a retained
 * `transform` from its animation, which turns it into the containing block
 * for any `position: fixed` descendant and clips it; portalling out is the
 * only reliable escape. It anchors to the button's left edge, clamped on
 * screen, and opens above the button when there's no room below.
 *
 * Plan 128 — on a phone it is a bottom sheet instead (the popover opened
 * below the fold and wouldn't close for Lena). Either way it takes focus
 * (Copy link), Escape closes it, and focus returns to the button
 * (useDialogFocus, shared with PhoneSheet).
 *
 * SEC-002 — the link carries the character's `play_token`, never its id.
 * "Reset link" gives the character a new one and kills the old at once (a
 * player left, or the link was posted somewhere public).
 *
 * Plan 139 — once a player has the character, the party's list won't open it,
 * so this link is how a player gets back on a new phone. A reset doesn't change
 * that. "Let someone pick it" reopens the list, for a new player or after the
 * DM's own look claimed it by mistake. "Open" adds ?peek=1 so a look doesn't.
 */
const POPOVER_W = 320;
/** About how tall the popover is, to open it above the button when there's no room below. */
const POPOVER_H = 330;

export default function PlayerLinkButton({ characterId, playToken, characterName, claimedAt, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(false);
  const claimed = !!claimedAt && !released;
  const qc = useQueryClient();
  const key = freshToken ?? playToken ?? characterId;
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const phone = useIsCompact(640);
  const dialogName = characterName ? `${characterName}'s player link` : "Player link";

  /** Where the popover goes: under the button, or above it near the bottom of the screen. */
  function measure(): { top: number; left: number } | null {
    if (!btnRef.current) return null;
    const r = btnRef.current.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - 16 - POPOVER_W);
    const below = r.bottom + 4;
    const top = below + POPOVER_H > window.innerHeight - 8 ? Math.max(8, r.top - 4 - POPOVER_H) : below;
    return { top, left: Math.max(8, Math.min(r.left, maxLeft)) };
  }

  function openLink() {
    setAnchor(measure());
    setOpen(true);
  }

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => btnRef.current?.focus());
  }

  useEffect(() => {
    if (!open || phone) return;
    // Laptop popover: follow the button as the page scrolls or resizes.
    const recompute = () => setAnchor(measure());
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open, phone]);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/play/${key}`
    : `/play/${key}`;

  async function handleReset() {
    const who = characterName || "this character";
    const ok = window.confirm(
      `Give ${who} a new player link?\n\nThe old link stops working right away, and whoever had it can't pick ` +
        "the character from the party's list. Send the new link to the player.",
    );
    if (!ok) return;
    setResetting(true);
    try {
      const res = await charactersApi.resetPlayLink(characterId);
      setFreshToken(res.play_key);
      setResetDone(true);
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ["characters"] });
    } finally {
      setResetting(false);
    }
  }

  async function handleRelease() {
    const who = characterName || "this character";
    const ok = window.confirm(
      `Let someone pick ${who} from the party's list?\n\nThe next phone to open it will have it. ` +
        "Use this for a new player, or if you opened the character by mistake.",
    );
    if (!ok) return;
    setReleasing(true);
    try {
      await charactersApi.releasePlayLink(characterId);
      setReleased(true);
      void qc.invalidateQueries({ queryKey: ["characters"] });
    } finally {
      setReleasing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the URL is still in the box to copy by hand.
      setCopied(false);
    }
  }

  const tap = phone ? 44 : undefined;
  const body = (
    <>
      <div style={{ fontSize: "0.875rem", color: "var(--text2)", marginBottom: "0.5rem", lineHeight: 1.45 }}>
        {resetDone
          ? "New link made. The old one no longer works, so send this one to the player."
          : "Send this link to the player. It opens their character only, with no sign-in."}
      </div>
      <input
        type="text"
        readOnly
        value={url}
        aria-label={dialogName}
        onFocus={(e) => e.currentTarget.select()}
        className="num"
        style={{
          width: "100%",
          padding: "0.4rem 0.5rem",
          fontSize: phone ? 16 : "0.8125rem",
          marginBottom: "0.55rem",
          minHeight: tap,
        }}
      />
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button
          data-autofocus
          onClick={handleCopy}
          className="btn btn-primary"
          style={{ flex: 1, fontSize: "0.875rem", padding: "0.4rem", minHeight: tap }}
        >
          {copied ? (
            <>
              <Check size={15} aria-hidden /> Copied
            </>
          ) : (
            "Copy link"
          )}
        </button>
        <a
          href={`${url}?peek=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{
            flex: 1,
            fontSize: "0.875rem",
            padding: "0.4rem",
            textAlign: "center",
            textDecoration: "none",
            minHeight: tap,
          }}
        >
          Open
        </a>
      </div>
      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={resetting}
        className="btn btn-ghost"
        title="Make a new link; the old one stops working"
        style={{
          marginTop: "0.5rem",
          width: "100%",
          fontSize: "0.8125rem",
          padding: "0.35rem",
          color: "var(--muted)",
          justifyContent: "center",
          minHeight: tap,
        }}
      >
        <RotateCcw size={14} aria-hidden /> {resetting ? "Making a new link…" : "Reset link"}
      </button>
      {claimed && (
        <>
          <div style={{ fontSize: "0.8125rem", color: "var(--text2)", marginTop: "0.5rem", lineHeight: 1.45 }}>
            A player has this character, so the party&rsquo;s list won&rsquo;t open it. This link still does.
          </div>
          <button
            type="button"
            onClick={() => void handleRelease()}
            disabled={releasing}
            className="btn btn-ghost"
            style={{
              marginTop: "0.25rem",
              width: "100%",
              fontSize: "0.8125rem",
              padding: "0.35rem",
              color: "var(--muted)",
              justifyContent: "center",
              minHeight: tap,
            }}
          >
            {releasing ? "Opening it up…" : "Let someone pick it from the list"}
          </button>
        </>
      )}
    </>
  );

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        // Phones (Plan 123): the full button is 44 px tall; the compact HUD icon is left alone.
        className={compact ? undefined : "ql-s6-tap"}
        onClick={() => (open ? close() : openLink())}
        title="Share this player's view link"
        aria-label={compact ? (characterName ? `Share ${characterName}'s player link` : "Share player link") : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
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
        <Link2 size={compact ? 13 : 14} aria-hidden />
        {compact ? null : "Share player link"}
      </button>
      {open && phone && (
        <PhoneSheet title={dialogName} onClose={close}>
          {body}
        </PhoneSheet>
      )}
      {open && !phone && anchor && (
        <LinkPopover anchor={anchor} label={dialogName} onClose={close}>
          {body}
        </LinkPopover>
      )}
    </span>
  );
}

/**
 * The laptop popover, portalled to <body>. Plan 128 — it takes focus (Copy
 * link), keeps Tab inside, closes on Escape and gives focus back to the button.
 */
function LinkPopover({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: { top: number; left: number };
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(boxRef, { onEscape: onClose });
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9600 }} />
      <div
        ref={boxRef}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
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
          outline: "none",
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
