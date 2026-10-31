/**
 * Opening the private dice tray from somewhere else on the page (Plan 128).
 *
 * On a phone the floating dice button sat on top of the HUD tracker's remove
 * buttons and prep's Initiative "Reset", so on those pages it hides and the HUD's
 * tool row has a Dice button instead. That button dispatches this window event;
 * the tray (mounted once in the layout) listens for it and opens.
 */
export const OPEN_DICE_EVENT = "ql:open-dice";

/**
 * Pages where, on a phone, the floating dice button would cover controls: the
 * session HUD and session prep. The HUD offers its own Dice button instead.
 */
export const DICE_BUTTON_HIDDEN_ON_PHONE = /^\/sessions\/[^/]+\/(hud|prep)(\/|$)/;
