import type { PlayerCharacter } from "../../api/types";

/**
 * PcPicker — checkbox list of a campaign's characters (who's at the table).
 * Shared by the arcs page and the legacy per-adventure sessions page.
 */
export default function PcPicker({
  characters,
  selected,
  onChange,
}: {
  characters: PlayerCharacter[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  if (characters.length === 0) {
    return <p className="text-sm text-muted">No characters in this campaign yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {characters.map((c) => (
        <label
          key={c.id}
          className="flex items-center gap-2"
          style={{
            padding: "0.35rem 0.5rem",
            borderRadius: 6,
            cursor: "pointer",
            background: selected.includes(c.id) ? "var(--surface2)" : "transparent",
            border: selected.includes(c.id) ? "1px solid var(--gold)" : "1px solid var(--border)",
          }}
        >
          <input
            type="checkbox"
            checked={selected.includes(c.id)}
            onChange={() => toggle(c.id)}
            style={{ accentColor: "var(--gold)" }}
          />
          <span style={{ color: "var(--gold)", fontWeight: 600, fontSize: "0.85rem" }}>
            {c.character_name}
          </span>
          <span className="text-sm text-muted">
            Lv{c.level} {c.race} {c.character_class}
          </span>
        </label>
      ))}
    </div>
  );
}
