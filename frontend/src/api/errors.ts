/**
 * Turn an API error body into words a DM can act on (review 10/30).
 *
 * FastAPI answers a bad form with a list of Pydantic errors —
 * `{loc: ["body", "setting"], type: "string_too_short", msg: "String should
 * have at least 1 character"}` — and that raw text used to reach the screen.
 * This maps each one to a field-level sentence. A plain string `detail` is
 * already written for people by the service that raised it and passes through.
 */

interface PydanticError {
  loc?: (string | number)[];
  type?: string;
  msg?: string;
  ctx?: Record<string, unknown>;
}

// Field names whose plain-English label isn't just the name with spaces.
const LABELS: Record<string, string> = {
  hp_max: "Max HP",
  hp_current: "Current HP",
  ac: "AC",
  cr: "CR",
  challenge_rating: "Challenge rating",
  dm_email: "DM email",
  pc_ids: "Characters",
  monster_id: "Monster",
  adventure_id: "Arc",
  session_number: "Session number",
  character_name: "Character name",
  player_name: "Player name",
  character_class: "Class",
  score_str: "Strength",
  score_dex: "Dexterity",
  score_con: "Constitution",
  score_int: "Intelligence",
  score_wis: "Wisdom",
  score_cha: "Charisma",
};

function label(loc: (string | number)[] | undefined): string {
  const field = [...(loc ?? [])].reverse().find((p) => typeof p === "string" && p !== "body");
  if (typeof field !== "string") return "This field";
  if (LABELS[field]) return LABELS[field];
  const words = field.replace(/_id$/, "").replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "This field";
}

function one(e: PydanticError): string {
  const what = label(e.loc);
  const ctx = e.ctx ?? {};
  switch (e.type) {
    case "missing":
      return `${what} is required.`;
    case "string_too_short":
      return Number(ctx.min_length ?? 1) <= 1
        ? `${what} can't be empty.`
        : `${what} needs at least ${ctx.min_length} characters.`;
    case "string_too_long":
      return `${what} is too long (${ctx.max_length} characters at most).`;
    case "too_short":
      return `${what} needs at least ${ctx.min_length ?? 1}.`;
    case "too_long":
      return `${what} can have at most ${ctx.max_length}.`;
    case "greater_than_equal":
      return `${what} must be ${ctx.ge} or more.`;
    case "greater_than":
      return `${what} must be more than ${ctx.gt}.`;
    case "less_than_equal":
      return `${what} must be ${ctx.le} or less.`;
    case "less_than":
      return `${what} must be less than ${ctx.lt}.`;
    case "int_parsing":
    case "int_type":
    case "float_parsing":
    case "float_type":
      return `${what} must be a number.`;
    case "enum":
    case "literal_error":
      return `${what} isn't one of the choices.`;
    case "uuid_parsing":
    case "uuid_type":
      return `${what} isn't valid.`;
    case "value_error":
      // A validator's own message, written for people: drop Pydantic's prefix.
      return (e.msg ?? "").replace(/^Value error,\s*/i, "") || `Check ${what.toLowerCase()}.`;
    default:
      return `Check ${what.toLowerCase()}.`;
  }
}

/**
 * The message to show for a failed request.
 *
 * @param detail - The `detail` field of the error body (string, list, or anything).
 * @param fallback - What to say when there is nothing usable (e.g. the status text).
 */
export function friendlyApiError(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const lines = Array.from(new Set((detail as PydanticError[]).map(one)));
    if (lines.length) return lines.join(" ");
  }
  return fallback || "Something went wrong — try again.";
}
