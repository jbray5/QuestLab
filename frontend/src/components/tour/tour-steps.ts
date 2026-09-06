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

// Tag nav items, the sample button and the dice tray with data-tour-id so
// the tour can find them regardless of label tweaks (Layout.tsx, Dashboard.tsx,
// DiceTray.tsx). A step whose target isn't on the current page renders centered
// with no spotlight, never a spotlight on the wrong thing (Plan 83).
export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to QuestLab",
    body:
      "Ninety seconds. QuestLab is a table tool: living sheets on your players' " +
      "phones, a shared board on the TV, and a HUD for you. There is no AI in it.",
  },
  {
    title: "Run the sample night first",
    body:
      "One click builds a campaign with four pregens, a staged map, an ambush " +
      "and a runbook with read-aloud text. It opens straight into the HUD, so " +
      "you can see a session before you write one.",
    targetSelector: "[data-tour-id='sample-campaign']",
    placement: "top",
  },
  {
    title: "Campaign → arc → session",
    body:
      "That's the whole model. Pick a campaign and its pages appear here: " +
      "Sessions (grouped by arc), Characters, Battle Maps, NPCs.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Your own campaigns",
    body:
      "Setting and tone are the only fields that matter. Delete is safe: it " +
      "takes every session, map and NPC with it, and nothing else.",
    targetSelector: "[data-tour-id='nav-campaigns']",
    placement: "right",
  },
  {
    title: "Players bring their own sheets",
    body:
      "Add a character per player, or turn on player sign-up and share the join " +
      "link: they build a 2024 character on their phone in five minutes, and " +
      "that phone becomes a live sheet with dice that land on the TV.",
    targetSelector: "[data-tour-id='nav-characters']",
    placement: "right",
  },
  {
    title: "Dice are one tap away",
    body:
      "The 🎲 at the bottom-right of every DM page rolls anything. Most tables " +
      "still roll real dice, and that's fine: the HUD never needs a digital roll.",
    targetSelector: "[data-tour-id='dice-tray']",
    placement: "top",
  },
  {
    title: "Game night lives in the HUD",
    body:
      "Every session has a HUD: initiative, the party, the live board, your notes " +
      "(press N), and 🎬 Script for read-aloud text. 🗺 Table opens the TV link; " +
      "the QR on it gets phones in.",
  },
  {
    title: "Two screens, one loop",
    body:
      "TV or projector for the players, your laptop for the HUD. The guide (📖 in " +
      "the sidebar) walks through the setup in fifteen minutes. 🧭 replays this tour.",
  },
];
