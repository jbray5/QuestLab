import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";

interface Props {
  pc: PlayerCharacter;
  readOnly?: boolean;
}

type Denom = "pp" | "gp" | "ep" | "sp" | "cp";

// Plan 121 — spelled out, one quiet label color; the coin names do the work.
const DENOMS: { key: Denom; label: string; color: string; help: string }[] = [
  { key: "pp", label: "Platinum", color: "var(--muted)", help: "Platinum pieces (pp) — 1 pp = 10 gp" },
  { key: "gp", label: "Gold", color: "var(--muted)", help: "Gold pieces (gp)" },
  { key: "ep", label: "Electrum", color: "var(--muted)", help: "Electrum pieces (ep) — 2 ep = 1 gp" },
  { key: "sp", label: "Silver", color: "var(--muted)", help: "Silver pieces (sp) — 10 sp = 1 gp" },
  { key: "cp", label: "Copper", color: "var(--muted)", help: "Copper pieces (cp) — 100 cp = 1 gp" },
];

/**
 * Currency bar (Plan 00024).
 *
 * Five denomination inputs (pp / gp / ep / sp / cp). Each cell shows the
 * current value with an inline editor; commits on blur or Enter. Locally
 * controlled values so typing isn't laggy against the server.
 */
export default function CurrencyBar({ pc, readOnly = false }: Props) {
  return (
    <div>
      <h4
        style={{
          fontSize: "0.9375rem",
          fontWeight: 600,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
      >
        Coins
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))",
          gap: "0.4rem",
        }}
      >
        {DENOMS.map((d) => (
          <DenominationCell
            key={d.key}
            pc={pc}
            denom={d.key}
            label={d.label}
            color={d.color}
            help={d.help}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function DenominationCell({
  pc,
  denom,
  label,
  color,
  help,
  readOnly,
}: {
  pc: PlayerCharacter;
  denom: Denom;
  label: string;
  color: string;
  help: string;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const remote = pc[denom] ?? 0;
  const [local, setLocal] = useState<string>(String(remote));

  // Keep local in sync if remote changes externally
  useEffect(() => {
    setLocal(String(remote));
  }, [remote]);

  const save = useMutation({
    mutationFn: (n: number) =>
      charactersApi.update(pc.id, { [denom]: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
  });

  function commit() {
    const parsed = Math.max(0, Math.floor(Number(local) || 0));
    if (parsed !== remote) save.mutate(parsed);
    else setLocal(String(remote));
  }

  return (
    <div
      title={help}
      style={{
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "0.3rem 0.4rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color,
        }}
      >
        {label}
      </div>
      <input
        type="number"
        min={0}
        disabled={readOnly || save.isPending}
        value={local}
        aria-label={`${help}`}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="num"
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          boxShadow: "none",
          color: "var(--text)",
          fontSize: "1rem",
          fontWeight: 600,
          textAlign: "center",
          padding: "0.15rem 0",
        }}
      />
    </div>
  );
}
