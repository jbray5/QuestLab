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
      {characters.map((c) => {
        const on = selected.includes(c.id);
        return (
          <label
            key={c.id}
            className="flex items-center gap-2"
            style={{
              minHeight: 40,
              padding: "0.4rem 0.65rem",
              margin: 0,
              borderRadius: 8,
              cursor: "pointer",
              background: on ? "var(--surface2)" : "transparent",
              border: `1px solid ${on ? "var(--border2)" : "var(--border)"}`,
              flexWrap: "wrap",
              rowGap: 0,
            }}
          >
            <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
            <span
              className="story"
              style={{ color: on ? "var(--text)" : "var(--text2)", fontWeight: 500, fontSize: "1.05rem" }}
            >
              {c.character_name}
            </span>
            <span className="text-sm text-muted" style={{ fontWeight: 400 }}>
              Level {c.level} {c.race} {c.character_class}
            </span>
          </label>
        );
      })}
    </div>
  );
}
