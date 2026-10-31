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
 * Plan 130 — a 402 means a new campaign or upload would go past the DM's plan.
 * The API sends `{code: "plan_limit", limit, message}`; the message is written
 * for people. Messages seen here are remembered so a screen can tell, from the
 * Error it caught, that it should offer a link to the plan page.
 */
interface PlanLimitDetail {
  code: "plan_limit";
  limit: "campaigns" | "storage";
  message: string;
}

const PLAN_LIMIT_FALLBACK =
  "That's past what your plan allows. Your plan, in the menu, shows what you use.";
const planLimitMessages = new Set<string>([PLAN_LIMIT_FALLBACK]);

function isPlanLimitDetail(detail: unknown): detail is PlanLimitDetail {
  return (
    !!detail &&
    typeof detail === "object" &&
    (detail as { code?: unknown }).code === "plan_limit" &&
    typeof (detail as { message?: unknown }).message === "string"
  );
}

/** Whether an error thrown by an API call was a plan limit (a 402), so the screen can link to /plan. */
export function isPlanLimitError(err: unknown): boolean {
  return err instanceof Error && planLimitMessages.has(err.message);
}

/**
 * The message for a failed request when the caller has the status code (uploads
 * use their own fetch). A 402 always reads as a plan limit.
 *
 * @param status - The HTTP status.
 * @param body - The parsed JSON body, if any.
 * @param fallback - What to say when there is nothing usable.
 */
export function friendlyStatusError(status: number, body: unknown, fallback: string): string {
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;
  if (status === 402 && !isPlanLimitDetail(detail)) return PLAN_LIMIT_FALLBACK;
  return friendlyApiError(detail, fallback);
}

/**
 * The message to show for a failed request.
 *
 * @param detail - The `detail` field of the error body (string, list, or anything).
 * @param fallback - What to say when there is nothing usable (e.g. the status text).
 */
export function friendlyApiError(detail: unknown, fallback: string): string {
  if (isPlanLimitDetail(detail)) {
    planLimitMessages.add(detail.message);
    return detail.message;
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const lines = Array.from(new Set((detail as PydanticError[]).map(one)));
    if (lines.length) return lines.join(" ");
  }
  // A bare 402 (no plan_limit body) still reads as the plan, never "Payment Required".
  if (fallback === "Payment Required") return PLAN_LIMIT_FALLBACK;
  return fallback || "Something went wrong — try again.";
}
