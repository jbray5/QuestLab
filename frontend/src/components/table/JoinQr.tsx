import { useEffect, useState } from "react";
import { Check, QrCode } from "lucide-react";
import QRCode from "qrcode";

/**
 * JoinQr (Plan 63) — QR gateway to /join/{campaignId}.
 *
 * Default export: a quiet QR button in the projector's corner that flips
 * open a big scannable overlay. JoinQrOverlay is the overlay alone, so
 * the DM HUD can open the same code from a button (with a copy-link
 * affordance the projector doesn't need). JoinQrCode is just the code, for
 * the TV's turn-order view to show before the fight (Plan 128).
 */

const CSS = `
.qjqr-chip {
  position: fixed; bottom: 14px; left: 14px; z-index: 60;
  width: 44px; height: 44px; border-radius: 50%;
  border: 1px solid var(--border2); background: rgba(17,21,19,0.78);
  color: var(--text); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.55; transition: opacity 0.15s;
}
.qjqr-chip:hover, .qjqr-chip:focus-visible { opacity: 1; }
.qjqr-overlay {
  position: fixed; inset: 0; z-index: 100; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 16px; background: rgba(10,12,11,0.92);
}
.qjqr-overlay img {
  width: min(58vh, 78vw); border-radius: 18px;
}
.qjqr-overlay h2 {
  font-family: var(--font-ui); font-weight: 600; color: var(--text); margin: 0;
  font-size: clamp(1.5rem, 5vh, 2.6rem); text-align: center;
}
.qjqr-overlay p {
  color: var(--text2); margin: 0; font-family: var(--font-ui);
  font-size: clamp(1.125rem, 2.8vh, 1.5rem); text-align: center;
}
.qjqr-copy {
  border: 1px solid var(--border2); border-radius: 8px; min-height: 44px;
  background: var(--surface2); color: var(--text); cursor: pointer;
  padding: 8px 16px; font-size: 0.95rem; font-family: var(--font-ui);
  display: inline-flex; align-items: center; gap: 6px;
}
.qjqr-copy:hover { border-color: var(--accent-edge); }
`;

/** The join link's QR as a data URL (null until drawn, or if drawing fails). */
function useJoinQr(joinUrl: string): string | null {
  const [drawn, setDrawn] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(joinUrl, {
      width: 720,
      margin: 2,
      color: { dark: "#111513", light: "#ECE7DA" },
    })
      .then((data) => {
        if (live) setDrawn({ url: joinUrl, data });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [joinUrl]);
  return drawn && drawn.url === joinUrl ? drawn.data : null;
}

/** The join link for a campaign, on this site. */
function joinUrlFor(campaignId: string): string {
  return `${window.location.origin}/join/${campaignId}`;
}

/** Just the scannable code, sized by its container (the TV's turn-order view). */
export function JoinQrCode({ campaignId, className }: { campaignId: string; className?: string }) {
  const joinUrl = joinUrlFor(campaignId);
  const dataUrl = useJoinQr(joinUrl);
  if (!dataUrl) return <div className={className} aria-hidden="true" />;
  return <img className={className} src={dataUrl} alt={`QR code for ${joinUrl}`} />;
}

export function JoinQrOverlay({
  campaignId,
  onClose,
  showCopy = false,
}: {
  campaignId: string;
  onClose: () => void;
  showCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const joinUrl = joinUrlFor(campaignId);
  const dataUrl = useJoinQr(joinUrl);

  function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(joinUrl)
      .then(() => setCopied(true))
      .catch(() => {});
  }

  return (
    <div className="qjqr-overlay" onClick={onClose}>
      <style>{CSS}</style>
      <h2>Scan to open your character</h2>
      {dataUrl && <img src={dataUrl} alt={`QR code for ${joinUrl}`} />}
      <p>Point your phone camera at the code, then tap your character.</p>
      {showCopy && (
        <button className="qjqr-copy" onClick={copyLink}>
          {copied ? (
            <>
              <Check size={16} aria-hidden="true" /> Link copied
            </>
          ) : (
            "Copy join link"
          )}
        </button>
      )}
    </div>
  );
}

export default function JoinQr({
  campaignId,
  forcedOpen = false,
  hideButton = false,
}: {
  campaignId: string;
  /** DM summoned the QR from the HUD (Plan 69) — overrides the local chip. */
  forcedOpen?: boolean;
  /** The page already shows the code (the turn-order view before a fight). */
  hideButton?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{CSS}</style>
      {!hideButton && (
        <button
          className="qjqr-chip"
          title="Join QR: players scan it to open their character"
          aria-label="Show the join QR code"
          onClick={() => setOpen((v) => !v)}
        >
          <QrCode size={20} aria-hidden="true" />
        </button>
      )}
      {(open || forcedOpen) && (
        <JoinQrOverlay campaignId={campaignId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
