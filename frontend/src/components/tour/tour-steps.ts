// Tour content for the new-DM walkthrough (Plan 00036).
//
// Each step is either centered (no ``targetSelector``) or anchored to
// a real UI element via a CSS selector. The TourGuide spotlights the
// element and positions the card alongside it. Keep the bodies short
// and prescriptive — these are signposts, not a manual.

export interface TourStep {
  /** Short heading shown at the top of the card. */
  title: string;
  /** One-paragraph body. */
  body: string;
  /** Optional CSS selector. When omitted, the card is centered with
   *  no spotlight. */
  targetSelector?: string;
  /** Optional placement hint. Defaults to "right" when target exists. */
  placement?: "right" | "bottom" | "top" | "left";
}

// Tag a couple of nav items + the dice tray with data-tour-id so the
// tour can find them regardless of label tweaks. The selectors below
// match those tags — see Layout.tsx and DiceTray.tsx for the hooks.
export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to QuestLab",
    body:
      "Two-minute tour to show you where things live. You'll learn the " +
      "mental model — campaign → adventure → session — and where to click " +
      "when you're ready to run game night.",
  },
  {
    title: "The sidebar is your map",
    body:
      "Top-level pages on the left. Once you pick or create a campaign, " +
      "more nav appears for that campaign and its adventures.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Start with a Campaign",
    body:
      "A campaign is the whole world — setting, tone, recurring NPCs. " +
      "Click 📜 Campaigns in the sidebar to create your first one. The " +
      "AI uses your tone (\"gothic\", \"swashbuckling\", etc.) when " +
      "generating runbooks and NPCs later.",
    targetSelector: "[data-tour-id='nav-campaigns']",
    placement: "right",
  },
  {
    title: "Adventures live inside a campaign",
    body:
      "Each adventure is a story arc with a synopsis and location notes. " +
      "Sessions, encounters, and maps all belong to an adventure. Once a " +
      "campaign is active you'll see 🗺 Adventures in the sidebar.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Player Characters",
    body:
      "Add a PC for every player. Each gets a full 2024 sheet — spells, " +
      "weapons, hit dice, death saves, the works. Click 🔗 Share to send " +
      "the PC's URL to that player; their phone becomes a live, " +
      "self-service sheet.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "NPCs — Recurring story characters",
    body:
      "Track patrons, antagonists, shopkeepers. AI can generate names + " +
      "personalities + secrets for you. 🎨 Generate a portrait when you " +
      "want art for the table.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Build encounters with live difficulty",
    body:
      "The encounter editor has a 2024 XP meter that updates as you tune " +
      "the roster. Click ✨ Themed suggestions and Claude will pick " +
      "monsters that match the adventure's vibe and the difficulty you " +
      "want.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Sessions + the HUD",
    body:
      "A session is one night of play. Opening a session's HUD gives " +
      "you a three-pane cockpit: party tracker, scene navigator, combat. " +
      "The 📖 DM Screen button on the HUD opens 11 tabs of 2024 rules — " +
      "conditions, actions, cover, hazards.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Dice are always one tap away",
    body:
      "Floating 🎲 button at the bottom-right of every DM page. Roll any " +
      "die with count + modifier. Crit / fumble sounds are togglable in " +
      "the tray header.",
    targetSelector: "[data-tour-id='dice-tray']",
    placement: "top",
  },
  {
    title: "Re-launch any time",
    body:
      "That's the loop. Create a campaign, then an adventure, then a " +
      "session — and run it from the HUD with live sync to your players' " +
      "phones. Click 🧭 in the sidebar to replay this tour later.",
  },
];
