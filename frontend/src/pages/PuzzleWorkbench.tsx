import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GLYPH_SHAPES, puzzlesApi, type PuzzleRead } from "../api/puzzles";

/**
 * PuzzleWorkbench — the DM's puzzle control (Plan 55),
 * campaigns/:campaignId/puzzles.
 *
 * Left: the puzzle list + player link. Right: live control — assign
 * glyph letters, log spoken readings, break the ward, reveal lines,
 * read the plaintext. The player link (/puzzle/:id) mirrors everything
 * without ever receiving an answer.
 */

function playerUrl(id: string) {
  return `${window.location.origin}/puzzle/${id}`;
}

function GlyphControls({ p, onChanged }: { p: PuzzleRead; onChanged: () => void }) {
  const tokens = (p.config.tokens as string[]) ?? [];
  const assignments = ((p.state.assignments as Record<string, string>) ?? {});
  const attempts = ((p.state.attempts as { reading: string; correct: boolean }[]) ?? []);
  const unique = Array.from(new Set(tokens));
  const [reading, setReading] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
        Assign letters (propagates to every instance)
      </div>
      <div className="flex" style={{ gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
        {unique.map((g) => (
          <div key={g} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", lineHeight: 1 }}>{GLYPH_SHAPES[g] ?? "?"}</div>
            <input
              className="input"
              style={{ width: 44, textAlign: "center", fontSize: "0.95rem", marginTop: 4 }}
              maxLength={1}
              value={assignments[g] ?? ""}
              onChange={async (e) => {
                await puzzlesApi.dmAssign(p.id, g, e.target.value).catch(() => undefined);
                onChanged();
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Current line
      </div>
      <div className="text-mono" style={{ fontSize: "1.05rem", letterSpacing: "0.22em", margin: "0.3rem 0 0.9rem" }}>
        {tokens.map((t) => assignments[t] ?? "_").join(" ")}
      </div>

      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Log a spoken reading (wrong ones hum + cost)
      </div>
      <form
        className="flex"
        style={{ gap: 6, margin: "0.3rem 0 0.6rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reading.trim()) return;
          const r = await puzzlesApi.reading(p.id, reading);
          setMsg(
            r.correct
              ? "✓ CORRECT — the board kindles. Say nothing. Let them look at Willa."
              : `✗ wrong — the pages hum (${r.hum} so far). Narrate a consequence tonight.`,
          );
          setReading("");
          onChanged();
        }}
      >
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="e.g. COME HOME CHILL"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit">
          🗣 Speak
        </button>
      </form>
      {msg && <div style={{ fontSize: "0.85rem", color: "var(--gold)", marginBottom: "0.6rem" }}>{msg}</div>}

      {attempts.length > 0 && (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          Attempts: {attempts.map((a) => `${a.correct ? "✓" : "✗"} ${a.reading}`).join(" · ")}
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
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <div className="flex" style={{ gap: 8, alignItems: "center", marginBottom: "0.7rem", flexWrap: "wrap" }}>
        <span className="badge badge-draft">{phase.toUpperCase()}</span>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {Object.keys(locked).length}/{alphaTotal} letters locked
        </span>
      </div>

      {phase === "warded" && (
        <form
          className="flex"
          style={{ gap: 6, marginBottom: "0.8rem" }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await puzzlesApi.key(p.id, key);
            setMsg(
              r.correct
                ? "✓ The marks go STILL. Read the LOCK 1 line."
                : "✗ Nothing. The page keeps swimming.",
            );
            setKey("");
            onChanged();
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Speak a word over the page…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit">
            🔑 Speak
          </button>
        </form>
      )}
      {msg && <div style={{ fontSize: "0.85rem", color: "var(--gold)", marginBottom: "0.6rem" }}>{msg}</div>}

      <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginBottom: "0.8rem" }}>
        {(["word", "line", "all"] as const).map((scope) => (
          <button
            key={scope}
            className="btn btn-ghost"
            style={{ fontSize: "0.75rem" }}
            onClick={async () => {
              await puzzlesApi.reveal(p.id, scope);
              onChanged();
            }}
          >
            👁 reveal {scope}
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          onClick={async () => setPlain((await puzzlesApi.plaintext(p.id)).plaintext)}
        >
          📖 read plaintext (DM)
        </button>
      </div>

      {plain && (
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "0.9rem",
            lineHeight: 1.6,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.7rem 0.9rem",
          }}
        >
          {plain}
        </div>
      )}

      {Object.keys(locked).length >= alphaTotal && alphaTotal > 0 && (
        <div style={{ marginTop: "0.7rem", fontSize: "0.82rem", color: "#e0c04d" }}>
          🧵 First full sentence resolved — narrate the thread going slack. (Halve is
          now blind to the page. Say nothing more.)
        </div>
      )}
    </div>
  );
}

export default function PuzzleWorkbench() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const key = ["puzzles", campaignId];
  const { data: puzzles = [] } = useQuery({
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
    <div>
      <h2>🧩 Puzzles</h2>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 0 }}>
        Share a puzzle&rsquo;s player link on the projector (or in chat). You drive from
        here; answers never reach the player payload.
      </p>

      {puzzles.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          No puzzles yet — seed Saturday&rsquo;s two with{" "}
          <code>scripts/seed_session4_puzzles.py</code>.
        </p>
      )}

      {puzzles.map((p) => (
        <div className="card" key={p.id} style={{ marginBottom: "0.8rem" }}>
          <div className="flex" style={{ alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: "0.2rem 0" }}>{p.title}</h3>
            <span className="badge badge-draft">{p.kind}</span>
            {p.solved && <span style={{ color: "#7fd48a", fontSize: "0.8rem" }}>✓ solved</span>}
          </div>
          <div className="flex" style={{ gap: 6, flexWrap: "wrap", margin: "0.5rem 0" }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              onClick={() => setOpenId((c) => (c === p.id ? null : p.id))}
            >
              {openId === p.id ? "▾ close" : "▸ run it"}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              onClick={() => {
                void navigator.clipboard.writeText(playerUrl(p.id));
                setCopied(p.id);
                window.setTimeout(() => setCopied(null), 1400);
              }}
            >
              {copied === p.id ? "✓ copied" : "🔗 player link"}
            </button>
            <a
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              href={`/puzzle/${p.id}`}
              target="_blank"
              rel="noreferrer"
            >
              👁 open display
            </a>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              onClick={() => toggleInput.mutate(p)}
              title="Let players tap glyphs/letters from their own devices"
            >
              {p.allow_player_input ? "🖐 players CAN touch" : "🔒 DM only"}
            </button>
            {p.kind === "glyph" && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.75rem" }}
                onClick={async () => {
                  await puzzlesApi.solveGlyphs(p.id);
                  onChanged();
                }}
              >
                💡 solve
              </button>
            )}
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              onClick={async () => {
                if (!window.confirm(`Reset ${p.title}?`)) return;
                await puzzlesApi.reset(p.id);
                onChanged();
              }}
            >
              ↺ reset
            </button>
          </div>
          {openId === p.id &&
            (p.kind === "glyph" ? (
              <GlyphControls p={p} onChanged={onChanged} />
            ) : (
              <CipherControls p={p} onChanged={onChanged} />
            ))}
        </div>
      ))}
    </div>
  );
}
