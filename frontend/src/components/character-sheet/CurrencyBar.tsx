import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";

interface Props {
  pc: PlayerCharacter;
  readOnly?: boolean;
}

type Denom = "pp" | "gp" | "ep" | "sp" | "cp";

const DENOMS: { key: Denom; label: string; color: string; help: string }[] = [
  { key: "pp", label: "PP", color: "#e0e6f0", help: "Platinum" },
  { key: "gp", label: "GP", color: "var(--gold)", help: "Gold" },
  { key: "ep", label: "EP", color: "#c0a060", help: "Electrum" },
  { key: "sp", label: "SP", color: "#c0c8cf", help: "Silver" },
  { key: "cp", label: "CP", color: "#b87333", help: "Copper" },
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
          fontSize: "0.7rem",
          margin: "0 0 0.4rem",
          color: "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Currency
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
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
        borderRadius: 6,
        padding: "0.3rem 0.4rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "0.6rem",
          color,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <input
        type="number"
        min={0}
        disabled={readOnly || save.isPending}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          fontFamily: "monospace",
          fontSize: "0.95rem",
          fontWeight: 700,
          textAlign: "center",
          padding: "0.15rem 0",
        }}
      />
    </div>
  );
}
