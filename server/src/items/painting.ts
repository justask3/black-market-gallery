import { Player, InventoryItem, PaintingMetadata } from "../types.js";
import { credit } from "../economy/gold.js";

const PAYOUT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAYOUT_AMOUNT = 500;
export const MAX_DISPLAYED_PAINTINGS = 2;

/**
 * Lazily evaluates a single Painting's income. No background timer exists
 * anywhere for this — instead, this function is called whenever a player's
 * inventory/gallery is read (e.g. on page load), and credits gold for
 * every full 24h period that has elapsed since last collection.
 *
 * Using whole elapsed periods (rather than resetting to "now" on every
 * check) means a player who doesn't visit for 3 days still receives
 * credit for all 3 days' worth of income the next time they check in,
 * rather than losing income to inactivity.
 *
 * Mutates `owner.gold` and the item's `metadata.lastCollected` directly.
 * Returns the amount credited (0 if less than a full period has passed).
 */
export function collectPaintingIncome(paintingItem: InventoryItem, owner: Player): number {
  const meta = paintingItem.metadata as PaintingMetadata;
  const now = Date.now();
  const elapsed = now - meta.lastCollected;

  const fullPeriods = Math.floor(elapsed / PAYOUT_INTERVAL_MS);
  if (fullPeriods <= 0) return 0;

  const amount = fullPeriods * PAYOUT_AMOUNT;
  credit(owner, amount);

  // Advance by whole periods rather than snapping to `now`, so no
  // partial progress toward the next payout is silently discarded.
  meta.lastCollected += fullPeriods * PAYOUT_INTERVAL_MS;

  return amount;
}

/**
 * Convenience helper for the UI: how much time remains until this
 * specific Painting's next payout. Purely a display calculation —
 * does not mutate anything or affect when income is actually credited.
 */
export function timeUntilNextPayoutMs(paintingItem: InventoryItem): number {
  const meta = paintingItem.metadata as PaintingMetadata;
  const elapsed = Date.now() - meta.lastCollected;
  const remainder = elapsed % PAYOUT_INTERVAL_MS;
  return PAYOUT_INTERVAL_MS - remainder;
}
