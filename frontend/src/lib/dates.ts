/**
 * Dates for people (UX-002): a session's planned date is a calendar day, not
 * a moment, so it is read and compared in the DM's own time zone. UTC made
 * "Up next" skip tonight's session after 7 pm in the US.
 */

/** Today's calendar day where the DM is, as YYYY-MM-DD (compares with `date_planned`). */
export function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "2026-10-31" → "Sat, Oct 31" (the year only when it isn't this year). Empty in, empty out. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const sameYear = day.getFullYear() === new Date().getFullYear();
  return day.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
