/**
 * Shared pieces for the companion phone (Plan 122): rules words in plain
 * language, small Lamplit building blocks, and dice helpers.
 */
import type { CSSProperties, ReactNode } from "react";
import { Lightbulb } from "lucide-react";

import type { HelpLevel } from "../../stores/usePlayerPrefs";
import { hpColor } from "./rules";

// ── building blocks ──────────────────────────────────────────────────────────

export function Panel({ children, style, tone = "plain" }: { children: ReactNode; style?: CSSProperties; tone?: "plain" | "lit" | "inset" | "story" | "tip" }) {
  const tones: Record<string, CSSProperties> = {
    plain: { background: "var(--surface)", border: "1px solid var(--border)" },
    inset: { background: "var(--surface2)", border: "1px solid var(--border)" },
    lit: { background: "var(--accent-soft)", border: "1px solid var(--accent-edge)" },
    story: { background: "var(--story-bg)", border: "1px solid var(--story-line)" },
    tip: { background: "#15211E", border: "1px solid #2B4A44" },
  };
  return (
    <section style={{ borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, ...tones[tone], ...style }}>
      {children}
    </section>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 13, color: "var(--muted)", ...style }}>{children}</span>;
}

export function Monogram({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: "inset 0 0 0 1px var(--border2)" }} />;
  }
  const letters = name.replace(/["“”].*?["“”]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span aria-hidden style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", background: "var(--surface3)", boxShadow: "inset 0 0 0 1px var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-story)", fontWeight: 700, fontSize: Math.round(size * 0.42), color: "var(--text)" }}>
      {letters}
    </span>
  );
}

export function HpBar({ cur, max, height = 6, width }: { cur: number; max: number; height?: number; width?: number | string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((cur / max) * 100))) : 0;
  return (
    <div style={{ width: width ?? "100%", height, borderRadius: height / 2, background: "var(--border)" }}>
      <div style={{ width: `${pct}%`, height, borderRadius: height / 2, background: hpColor(cur, max), transition: "width 0.4s ease" }} />
    </div>
  );
}

export function Tip({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Panel tone="tip" style={{ padding: "10px 12px", flexDirection: "row", gap: 10 }}>
      <Lightbulb size={18} color="var(--teal)" style={{ marginTop: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14, color: "var(--text2)" }}>
        {title && <span style={{ fontWeight: 600, color: "var(--teal-text)" }}>{title}</span>}
        <span>{children}</span>
      </div>
    </Panel>
  );
}

export function Pips({ filled, total, color = "var(--accent)", size = 22, onTap, label }: { filled: number; total: number; color?: string; size?: number; onTap?: (i: number, isFilled: boolean) => void; label?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role={onTap ? "group" : undefined} aria-label={label}>
      {Array.from({ length: total }).map((_, i) => {
        const on = i < filled;
        const dot = <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", boxSizing: "border-box", background: on ? color : "transparent", border: on ? "none" : "2px solid var(--border2)", display: "block" }} />;
        return onTap ? (
          <button key={i} type="button" onClick={() => onTap(i, on)} aria-label={`${label ?? "use"} ${i + 1}${on ? " (available)" : " (spent)"}`} style={{ padding: (44 - size) / 4, margin: -(44 - size) / 4, background: "transparent", border: "none", cursor: "pointer" }}>
            {dot}
          </button>
        ) : (
          <span key={i}>{dot}</span>
        );
      })}
    </div>
  );
}

/** Teach / Remind / Numbers — the help-level switch. */
export function HelpSwitch({ value, onChange }: { value: HelpLevel; onChange: (h: HelpLevel) => void }) {
  const opts: Array<[HelpLevel, string]> = [["teach", "Teach me"], ["remind", "Remind me"], ["numbers", "Numbers"]];
  return (
    <div role="group" aria-label="How much help" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, padding: 4, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
      {opts.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} style={{ minHeight: 40, borderRadius: 8, border: "none", background: value === k ? "var(--accent-active)" : "transparent", color: value === k ? "var(--accent-active-text)" : "var(--text2)", font: "500 14px var(--font-ui)", cursor: "pointer" }}>
          {l}
        </button>
      ))}
    </div>
  );
}
