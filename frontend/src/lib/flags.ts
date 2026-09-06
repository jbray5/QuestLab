/**
 * Product switches (Plan 86). QuestLab ships with no generative AI: every
 * generation control is hidden unless a private build sets VITE_AI_FEATURES=on
 * (and the API sets AI_FEATURES=on; otherwise those routes are 404).
 */
export const AI_ON = import.meta.env.VITE_AI_FEATURES === "on";
