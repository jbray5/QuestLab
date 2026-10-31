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
      "Ninety seconds. QuestLab is your DM screen and turn tracker, and each player's " +
      "sheet lives on their own phone. There is no generative AI in it.",
  },
  {
    title: "Run the sample night first",
    body:
      "One tap builds a campaign with four ready characters, an ambush and a runbook " +
      "with read-aloud text. It opens straight into the HUD, so you can see a session " +
      "before you write one.",
    targetSelector: "[data-tour-id='sample-campaign']",
    placement: "top",
  },
  {
    title: "Campaign, arc, session",
    body:
      "That's the whole model. Pick a campaign and its pages appear here: " +
      "Sessions (grouped by arc), Characters, Encounters, NPCs.",
    targetSelector: "[data-tour-id='sidebar']",
    placement: "right",
  },
  {
    title: "Your own campaigns",
    body:
      "A name, a setting and a tone are all it needs. Deleting a campaign takes its " +
      "sessions, maps and NPCs with it, and nothing else.",
    targetSelector: "[data-tour-id='nav-campaigns']",
    placement: "right",
  },
  {
    title: "Players bring their own sheets",
    body:
      "Create a character with the guided builder, or share the join link and let each " +
      "player build theirs on their phone. Every sheet becomes a live companion: rolls, " +
      "spells, hit points and whose turn it is.",
    targetSelector: "[data-tour-id='nav-characters']",
    placement: "right",
  },
  {
    title: "Dice when you want them",
    body:
      "The dice button at the bottom right of every DM page rolls anything. Most " +
      "tables still roll real dice, and that's fine: nothing here needs a digital roll.",
    targetSelector: "[data-tour-id='dice-tray']",
    placement: "top",
  },
  {
    title: "Game night lives in the HUD",
    body:
      "Every session has a HUD: the party, the turn order, your notes (press N) and " +
      "Script for read-aloud text. Start the fight rolls initiative, End turn (or the E " +
      "key) moves it on, and each player's phone shows when it's their turn.",
  },
  {
    title: "Tell us how it goes",
    body:
      "QuestLab is in a friends beta. Send feedback is at the bottom of the menu on " +
      "every page, and the Guide walks through a whole night in fifteen minutes.",
  },
];
