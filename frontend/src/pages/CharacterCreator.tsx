import type { WizardMode } from "../api/characterBuilder";
import CharacterWizard from "../components/character-wizard/CharacterWizard";

/**
 * CharacterCreator — the page for the guided character wizard (Plan 74, Plan 126).
 *
 * - `/join/:campaignId/new` (no DM chrome): a player builds from the join link.
 * - `/campaigns/:campaignId/characters/new` (inside the DM layout, `mode="dm"`): the DM's
 *   "Add character".
 *
 * The wizard itself lives in `components/character-wizard/` so both doors share one copy.
 */
export default function CharacterCreator({ mode = "player" }: { mode?: WizardMode }) {
  return <CharacterWizard key={mode} mode={mode} />;
}
