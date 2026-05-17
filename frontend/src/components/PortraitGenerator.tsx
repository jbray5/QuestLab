import { useState } from "react";

interface Props {
  /** Current portrait URL, if any. */
  currentUrl: string | null;
  /** Callback that performs the actual API call. Resolves with the new URL. */
  onGenerate: (styleHints: string | undefined) => Promise<string>;
  /** Visual variant — "sheet" sits inside the PC sheet header, "card" sits inside the NPC modal. */
  variant?: "sheet" | "card";
}

/**
 * "🎨 Generate Portrait" UI (Plan 00034).
 *
 * - Shows the current portrait (or a placeholder) at modest size.
 * - Expands a small panel with an optional "style hints" input and a
 *   single Generate button.
 * - Disables the button + shows a spinning state during the ~10s
 *   round-trip.
 * - On success, swaps the image in immediately so the new portrait is
 *   visible without a reload.
 */
export default function PortraitGenerator({
  currentUrl,
  onGenerate,
  variant = "card",
}: Props) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(currentUrl);
  const [hints, setHints] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const newUrl = await onGenerate(hints.trim() || undefined);
      // cache-bust so the browser re-fetches even if the URL is the same
      setDisplayUrl(`${newUrl}?t=${Date.now()}`);
    } catch (e) {
      setError((e as Error)?.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const portraitSize = variant === "sheet" ? 56 : 96;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        padding: "0.5rem 0",
      }}
    >
      <div
        style={{
          width: portraitSize,
          height: portraitSize,
          borderRadius: 6,
          border: "1px solid var(--gold)",
          background: "var(--surface2)",
          flexShrink: 0,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt="Portrait"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: busy ? 0.4 : 1,
              transition: "opacity 200ms ease",
            }}
          />
        ) : (
          <span style={{ fontSize: portraitSize * 0.5, opacity: 0.5 }}>🎨</span>
        )}
        {busy && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.55)",
              color: "var(--gold)",
              fontSize: "0.7rem",
              letterSpacing: "0.08em",
              fontFamily: "Cinzel Decorative, serif",
              animation: "ql-fade-in 200ms ease-out both",
            }}
          >
            painting…
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <input
          type="text"
          value={hints}
          onChange={(e) => setHints(e.target.value)}
          placeholder="Optional style hints (anime, ink-wash, dark…)"
          disabled={busy}
          style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
        />
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={handleClick}
            disabled={busy}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}
          >
            {busy ? "Painting (~10s)…" : displayUrl ? "🎨 Re-generate" : "🎨 Generate Portrait"}
          </button>
          <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontStyle: "italic" }}>
            ~$0.04 per image · OpenAI gpt-image-1
          </span>
        </div>
        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--red)" }}>{error}</span>
        )}
      </div>
    </div>
  );
}
