import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { apiBase, authHeaders } from "../api/client";

interface Props {
  currentUrl?: string | null;
  onUrlChange: (url: string) => void;
  label?: string;
  size?: number; // preview size in px
}

export default function ImageUpload({
  currentUrl,
  onUrlChange,
  label = "Image",
  size = 120,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${apiBase()}/uploads`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body?.detail ?? res.statusText);
      }
      const { url } = await res.json();
      onUrlChange(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleUrlSet() {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onUrlChange(trimmed);
      setUrlInput("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {/* Preview */}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: "1px dashed var(--border2)",
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface2)",
          flexShrink: 0,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--muted)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)")
        }
        title={`Click or drag to upload ${label.toLowerCase()}`}
      >
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--muted)",
              textAlign: "center",
              padding: "0.4rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.25rem",
              lineHeight: 1.2,
            }}
          >
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                <ImagePlus size={size < 64 ? 16 : 20} />
                {size >= 64 && label}
              </>
            )}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {/* URL paste */}
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSet()}
          placeholder="or paste URL…"
          style={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", padding: "0.3rem 0.5rem" }}
        />
        <button
          className="btn btn-secondary"
          style={{ fontSize: "0.8125rem", padding: "0.25rem 0.6rem", minHeight: 0, flexShrink: 0 }}
          onClick={handleUrlSet}
          disabled={!urlInput.trim()}
        >
          Set
        </button>
      </div>

      {error && <p style={{ color: "var(--danger-text)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </div>
  );
}
