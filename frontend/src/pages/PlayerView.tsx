import { useParams } from "react-router-dom";

import PlayerApp from "./player/PlayerApp";

/**
 * The player's phone at /play/:pcId (Plan 00025; rebuilt as a companion in Plan 122).
 *
 * The UUID in the URL is the implicit secret the DM shares. Everything lives in
 * `pages/player/`: tabs (Now · Character · Spells · Bag · Journal), the help
 * level, the roll sheet and the dying screen.
 */
export default function PlayerView() {
  const { pcId } = useParams<{ pcId: string }>();
  if (!pcId) {
    return <p style={{ padding: 24, color: "var(--text2)" }}>This link is missing its character. Ask your DM for a fresh one.</p>;
  }
  return <PlayerApp key={pcId} pcId={pcId} />;
}
