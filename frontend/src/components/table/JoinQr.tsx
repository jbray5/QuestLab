import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * JoinQr (Plan 63) — QR gateway to /join/{campaignId}.
 *
 * Default export: a quiet 📱 chip in the projector's corner that flips
 * open a big scannable overlay. JoinQrOverlay is the overlay alone, so
 * the DM HUD can open the same code from a button (with a copy-link
 * affordance the projector doesn't need).
 */

const CSS = `
.qjqr-chip {
  position: fixed; bottom: 14px; left: 14px; z-index: 60;
  width: 42px; height: 42px; border-radius: 50%;
  border: 1px solid rgba(240,230,200,0.25); background: rgba(10,8,16,0.72);
  color: #e6ddc8; font-size: 1.15rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px); opacity: 0.55; transition: opacity 0.15s;
}
.qjqr-chip:hover { opacity: 1; }
.qjqr-overlay {
  position: fixed; inset: 0; z-index: 100; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; background: rgba(6,5,10,0.9); backdrop-filter: blur(6px);
}
.qjqr-overlay img {
  width: min(58vh, 78vw); border-radius: 18px;
  box-shadow: 0 0 60px rgba(214,175,54,0.25);
}
.qjqr-overlay h2 {
  font-family: Cinzel, Georgia, serif; color: #f0e6c8; margin: 0;
  font-size: clamp(1.2rem, 3.5vw, 2rem); letter-spacing: 0.1em;
}
.qjqr-overlay p { color: #b3a789; font-style: italic; margin: 0; font-family: Georgia, serif; }
.qjqr-copy {
  border: 1px solid rgba(240,230,200,0.35); border-radius: 8px;
  background: rgba(20,16,30,0.85); color: #e6ddc8; cursor: pointer;
  padding: 8px 16px; font-size: 0.85rem; font-family: Georgia, serif;
}
.qjqr-copy:hover { border-color: #d6af36; color: #f0e6c8; }
`;

export function JoinQrOverlay({
  campaignId,
  onClose,
  showCopy = false,
}: {
  campaignId: string;
  onClose: () => void;
  showCopy?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}/join/${campaignId}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 720,
      margin: 2,
      color: { dark: "#0d0a16", light: "#f0e6c8" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [joinUrl]);

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
      <h2>Scan to join the party</h2>
      {dataUrl && <img src={dataUrl} alt={`QR code for ${joinUrl}`} />}
      <p>Point your phone camera at the code, then tap your character.</p>
      {showCopy && (
        <button className="qjqr-copy" onClick={copyLink}>
          {copied ? "✓ Link copied" : "Copy join link"}
        </button>
      )}
    </div>
  );
}

export default function JoinQr({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{CSS}</style>
      <button
        className="qjqr-chip"
        title="Join QR — players scan to open their sheet"
        onClick={() => setOpen((v) => !v)}
      >
        📱
      </button>
      {open && <JoinQrOverlay campaignId={campaignId} onClose={() => setOpen(false)} />}
    </>
  );
}
