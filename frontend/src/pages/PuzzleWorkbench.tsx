import { useState, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  Hand,
  Info,
  KeyRound,
  Link2,
  Lock,
  MessageCircle,
  Puzzle,
  X,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GLYPH_SHAPES, puzzlesApi, type PuzzleRead } from "../api/puzzles";
import RowMenu, { type RowMenuItem } from "../components/RowMenu";

/**
 * PuzzleWorkbench — the DM's puzzle control (Plan 55),
 * campaigns/:campaignId/puzzles.
 *
 * Each puzzle card: the player link, and live control — assign glyph
 * letters, log spoken readings, break the ward, reveal lines, read the
 * plaintext. The player link (/puzzle/:id) mirrors everything without
 * ever receiving an answer. Lamplit + phones: Plan 123.
 */

function playerUrl(id: string) {
  return `${window.location.origin}/puzzle/${id}`;
}

const SECTION_LABEL: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text2)",
  marginBottom: "0.4rem",
};

/** A result line after a spoken word: teal when right, amber when wrong. */
function Verdict({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: "0.45rem",
        alignItems: "flex-start",
        fontSize: "0.9375rem",
        color: ok ? "var(--teal-text)" : "var(--amber-text)",
        marginBottom: "0.75rem",
      }}
    >
      {ok ? <Check size={16} style={{ marginTop: 3 }} /> : <X size={16} style={{ marginTop: 3 }} />}
      <span>{children}</span>
    </div>
  );
}

function GlyphControls({ p, onChanged }: { p: PuzzleRead; onChanged: () => void }) {
  const tokens = (p.config.tokens as string[]) ?? [];
  const assignments = ((p.state.assignments as Record<string, string>) ?? {});
  const attempts = ((p.state.attempts as { reading: string; correct: boolean }[]) ?? []);
  const unique = Array.from(new Set(tokens));
  const [reading, setReading] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem", marginTop: "0.25rem" }}>
      <div style={SECTION_LABEL}>Assign letters (each one fills every matching mark)</div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {unique.map((g) => (
          <label key={g} style={{ textAlign: "center", margin: 0 }}>
            <div aria-hidden style={{ fontSize: "1.6rem", lineHeight: 1, color: "var(--text)" }}>
              {GLYPH_SHAPES[g] ?? "?"}
            </div>
            <input
              type="text"
              className="num"
              aria-label={`Letter for mark ${GLYPH_SHAPES[g] ?? g}`}
              style={{ width: 44, minHeight: 44, textAlign: "center", fontSize: "1rem", marginTop: 4, padding: "0.4rem 0" }}
              maxLength={1}
              autoCapitalize="characters"
              value={assignments[g] ?? ""}
              onChange={async (e) => {
                await puzzlesApi.dmAssign(p.id, g, e.target.value).catch(() => undefined);
                onChanged();
              }}
            />
          </label>
        ))}
      </div>

      <div style={SECTION_LABEL}>The line so far</div>
      <div
        className="num"
        style={{ fontSize: "1.05rem", letterSpacing: "0.22em", margin: "0 0 1rem", overflowWrap: "anywhere" }}
      >
        {tokens.map((t) => assignments[t] ?? "_").join(" ")}
      </div>

      <div style={SECTION_LABEL}>Log a spoken reading (a wrong one makes the pages hum, and costs them)</div>
      <form
        style={{ display: "flex", gap: "0.5rem", margin: "0 0 0.75rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reading.trim()) return;
          const r = await puzzlesApi.reading(p.id, reading);
          setMsg(
            r.correct
              ? { ok: true, text: "Correct. The board kindles. Say nothing; let them look at Willa." }
              : { ok: false, text: `Wrong. The pages hum (${r.hum} so far). Narrate a consequence tonight.` },
          );
          setReading("");
          onChanged();
        }}
      >
        <input
          type="text"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="What the players said"
          placeholder="e.g. come home chill"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit" disabled={!reading.trim()}>
          <MessageCircle size={16} /> Log it
        </button>
      </form>
      {msg && <Verdict ok={msg.ok}>{msg.text}</Verdict>}

      {attempts.length > 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          Tried:{" "}
          {attempts.map((a, i) => (
            <span key={i} style={{ color: a.correct ? "var(--teal-text)" : "var(--muted)" }}>
              {i > 0 && " · "}
              {a.reading}
              {a.correct && " (right)"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CipherControls({ p, onChanged }: { p: PuzzleRead; onChanged: () => void }) {
  const phase = (p.state.phase as string) ?? "warded";
  const locked = ((p.state.locked as Record<string, string>) ?? {});
  const ciphertext = (p.config.ciphertext as string) ?? "";
  const alphaTotal = ciphertext.split("").filter((c) => /[a-z]/i.test(c)).length;
  const [key, setKey] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem", marginTop: "0.25rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap" }}>
        <span className={phase === "warded" ? "pill pill-amber" : "pill pill-teal"}>{phaseLabel}</span>
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          <span className="num">
            {Object.keys(locked).length}/{alphaTotal}
          </span>{" "}
          letters locked
        </span>
      </div>

      {phase === "warded" && (
        <>
          <div style={SECTION_LABEL}>Break the ward: the word they speak over the page</div>
          <form
            style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await puzzlesApi.key(p.id, key);
              setMsg(
                r.correct
                  ? { ok: true, text: "The marks go still. Read the Lock 1 line." }
                  : { ok: false, text: "Nothing. The page keeps swimming." },
              );
              setKey("");
              onChanged();
            }}
          >
            <input
              type="text"
              style={{ flex: 1, minWidth: 0 }}
              aria-label="The word spoken over the page"
              placeholder="Speak a word over the page…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={!key.trim()}>
              <KeyRound size={16} /> Try it
            </button>
          </form>
        </>
      )}
      {msg && <Verdict ok={msg.ok}>{msg.text}</Verdict>}

      <div className="ql-actions" style={{ justifyContent: "flex-start", marginBottom: "0.8rem" }}>
        {(["word", "line", "all"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await puzzlesApi.reveal(p.id, scope);
              onChanged();
            }}
          >
            <Eye size={16} /> {scope === "all" ? "Reveal all" : `Reveal a ${scope}`}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost"
          title="Only you see this; it never reaches the player display"
          onClick={async () => setPlain((await puzzlesApi.plaintext(p.id)).plaintext)}
        >
          <BookOpen size={16} /> Show me the answer
        </button>
      </div>

      {plain && (
        <div
          className="story"
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "1rem",
            lineHeight: 1.6,
            background: "var(--story-bg)",
            border: "1px solid var(--story-line)",
            color: "var(--story-text)",
            borderRadius: 8,
            padding: "0.7rem 0.9rem",
          }}
        >
          {plain}
        </div>
      )}

      {Object.keys(locked).length >= alphaTotal && alphaTotal > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.45rem",
            alignItems: "flex-start",
            marginTop: "0.75rem",
            fontSize: "0.9375rem",
            color: "var(--amber-text)",
          }}
        >
          <Info size={16} style={{ marginTop: 3 }} />
          <span>
            The first full sentence is resolved. Narrate the thread going slack (Halve is now blind to
            the page). Say nothing more.
          </span>
        </div>
      )}
    </div>
  );
}

export default function PuzzleWorkbench() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const key = ["puzzles", campaignId];
  const { data: puzzles = [], isLoading: puzzlesLoading } = useQuery({
    queryKey: key,
    queryFn: () => puzzlesApi.list(campaignId as string),
    enabled: !!campaignId,
    refetchInterval: 5000,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const onChanged = () => void qc.invalidateQueries({ queryKey: key });

  const toggleInput = useMutation({
    mutationFn: (p: PuzzleRead) =>
      puzzlesApi.update(p.id, { allow_player_input: !p.allow_player_input }),
    onSuccess: onChanged,
  });

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: "0.2rem" }}>Puzzles</h1>
      <p className="text-sm text-muted" style={{ margin: "0 0 1.25rem", maxWidth: 640 }}>
        Put a puzzle&rsquo;s player link on the TV (or in chat) and drive it from here. The answers
        never reach the players&rsquo; screens.
      </p>

      {!puzzlesLoading && puzzles.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Puzzle size={28} />
          </div>
          <p style={{ maxWidth: 480, margin: "0 auto" }}>
            Glyph boards and cipher pages the table solves on the TV while you run them from here.
            There is no puzzle maker in the app yet; add them with{" "}
            <code>scripts/seed_session4_puzzles.py</code>.
          </p>
        </div>
      )}

      {puzzles.map((p) => {
        const open = openId === p.id;
        const menu: RowMenuItem[] = [
          ...(p.kind === "glyph"
            ? [
                {
                  label: "Fill in every letter",
                  confirm: `Fill in the answer to ${p.title}? The players will see it.`,
                  onSelect: async () => {
                    await puzzlesApi.solveGlyphs(p.id);
                    onChanged();
                  },
                },
              ]
            : []),
          {
            label: "Reset puzzle",
            danger: true,
            confirm: `Reset ${p.title}? Every letter and attempt is cleared.`,
            onSelect: async () => {
              await puzzlesApi.reset(p.id);
              onChanged();
            },
          },
        ];
        return (
          <div className="card" key={p.id} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                <h3 className="story" style={{ margin: 0, fontSize: "1.3rem" }}>
                  {p.title}
                </h3>
                <span className="pill">{p.kind === "glyph" ? "Glyph board" : "Cipher page"}</span>
                {p.solved && (
                  <span className="pill pill-teal">
                    <Check size={13} /> Solved
                  </span>
                )}
              </div>
              <RowMenu items={menu} label={`More for ${p.title}`} />
            </div>
            <div className="ql-actions" style={{ justifyContent: "flex-start", margin: "0.75rem 0" }}>
              <button
                type="button"
                className="btn btn-secondary"
                aria-expanded={open}
                onClick={() => setOpenId((c) => (c === p.id ? null : p.id))}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {open ? "Hide controls" : "Run it"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(playerUrl(p.id));
                  setCopied(p.id);
                  window.setTimeout(() => setCopied(null), 1400);
                }}
              >
                {copied === p.id ? <Check size={16} /> : <Link2 size={16} />}
                {copied === p.id ? "Copied" : "Copy player link"}
              </button>
              <a className="btn btn-ghost" href={`/puzzle/${p.id}`} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open display
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                aria-pressed={p.allow_player_input}
                onClick={() => toggleInput.mutate(p)}
                title="Let players tap marks and letters from their own phones"
              >
                {p.allow_player_input ? <Hand size={16} /> : <Lock size={16} />}
                {p.allow_player_input ? "Players can tap" : "Only you can tap"}
              </button>
            </div>
            {open &&
              (p.kind === "glyph" ? (
                <GlyphControls p={p} onChanged={onChanged} />
              ) : (
                <CipherControls p={p} onChanged={onChanged} />
              ))}
          </div>
        );
      })}
    </div>
  );
}
