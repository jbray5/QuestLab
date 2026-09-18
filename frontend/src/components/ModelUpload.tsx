import { Component, lazy, type ReactNode, Suspense, useRef, useState } from "react";

import { tableApi } from "../api/table";

const FigurePreview = lazy(() => import("./FigurePreview"));

/**
 * The DM's drop zone for a rigged 3D figure (Plan 111): a `.glb` for a PC or
 * a monster, stored on the CDN and shown here idling and walking before it
 * ever reaches the table. A pasted URL works too. The file's header is
 * checked before the upload, so a `.gltf` or a picture is refused with a
 * reason rather than a 415.
 */
interface Props {
  currentUrl?: string | null;
  onUrlChange: (url: string | null) => void;
  /** How tall the figure will stand on the table, in feet. */
  heightFt: number;
  label?: string;
}

async function isGlb(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const magic = String.fromCharCode(...head.slice(0, 4));
  const version = head[4] | (head[5] << 8) | (head[6] << 16) | (head[7] << 24);
  return magic === "glTF" && version === 2;
}

class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || "couldn't load it" };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <p style={{ color: "var(--danger)", fontSize: "0.72rem", margin: 0, maxWidth: 240 }}>
          The table couldn't load this model: {this.state.error}
        </p>
      );
    return this.props.children;
  }
}

export default function ModelUpload({ currentUrl, onUrlChange, heightFt, label = "3D figure" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    if (!(await isGlb(file))) {
      setError("That isn't a binary glTF (.glb). Pack it with tools/figures first.");
      return;
    }
    setUploading(true);
    try {
      onUrlChange(await tableApi.uploadModel(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleUrlSet() {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onUrlChange(trimmed);
      setUrlInput("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onDragOver={(e) => e.preventDefault()}
        title={`Click or drag a .glb to set the ${label.toLowerCase()}`}
        style={{
          width: 240,
          padding: "0.5rem 0.6rem",
          borderRadius: "0.5rem",
          border: "2px dashed var(--border)",
          cursor: "pointer",
          background: "var(--surface2)",
          fontSize: "0.72rem",
          color: "var(--muted)",
          textAlign: "center",
        }}
      >
        {uploading ? "Uploading…" : currentUrl ? `⬡ Replace the ${label.toLowerCase()} (.glb)` : `⬡ Drop a .glb — the ${label.toLowerCase()} for the immersive table`}
      </div>
      <input ref={inputRef} type="file" accept=".glb,model/gltf-binary" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <div style={{ display: "flex", gap: "0.35rem", width: 240 }}>
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSet()}
          placeholder="or paste a .glb URL…"
          style={{ flex: 1, fontSize: "0.72rem", padding: "0.25rem 0.5rem", minWidth: 0 }}
        />
        <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", flexShrink: 0 }} onClick={handleUrlSet} disabled={!urlInput.trim()}>
          Set
        </button>
        {currentUrl && (
          <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", flexShrink: 0 }} onClick={() => onUrlChange(null)} title="Back to the placeholder">
            Remove
          </button>
        )}
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.72rem", margin: 0, maxWidth: 240 }}>{error}</p>}
      {currentUrl && (
        <PreviewBoundary resetKey={currentUrl}>
          <Suspense fallback={<small style={{ color: "var(--muted)", fontSize: "0.72rem" }}>Loading the figure…</small>}>
            <FigurePreview url={currentUrl} heightFt={heightFt} />
          </Suspense>
        </PreviewBoundary>
      )}
    </div>
  );
}
