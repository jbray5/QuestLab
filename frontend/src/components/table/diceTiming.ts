/**
 * The TV die's timing (Plan 128), shared by the cinematic and the pages that
 * hold a roll back until the die has landed, so a corner chip or the turn
 * order's roll card never gives the result away mid-tumble.
 */

/** How long the die tumbles before it lands, in ms. */
export const ROLL_TUMBLE_MS = 2100;

/** How long the die and its result plate stay up in all, in ms. */
export const ROLL_HOLD_MS = 7400;
