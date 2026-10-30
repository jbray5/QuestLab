/**
 * One display map for every status the API sends as an enum value (review
 * 10/30): "InProgress" reads "In progress" everywhere it is shown.
 */
const STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  Ready: "Ready",
  InProgress: "In progress",
  Complete: "Complete",
  Completed: "Complete",
  Alive: "Alive",
  Dead: "Dead",
  Missing: "Missing",
  Unknown: "Unknown",
};

/** A status enum value as words: known ones from the map, others split at capitals. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const words = status.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : status;
}
