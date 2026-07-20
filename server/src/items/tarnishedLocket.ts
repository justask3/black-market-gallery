import { Player, InventoryItem, TarnishedLocketMetadata } from "../types.js";
import { credit } from "../economy/gold.js";

const PAYOUT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAYOUT_AMOUNT = 50; // less than a Masterpiece Painting's 500g/24h

/**
 * Lazily evaluates a single Tarnished Locket's income, same pattern as
 * Painting -- but with no display slot concept at all: every Locket held
 * always earns, and there's no cap on how many a player can hold. A
 * low-stakes early entry point into passive income.
 */
export function collectTarnishedLocketIncome(lockerItem: InventoryItem, owner: Player): number {
  const meta = lockerItem.metadata as TarnishedLocketMetadata;
  const now = Date.now();
  const elapsed = now - meta.lastCollected;

  const fullPeriods = Math.floor(elapsed / PAYOUT_INTERVAL_MS);
  if (fullPeriods <= 0) return 0;

  const amount = fullPeriods * PAYOUT_AMOUNT;
  credit(owner, amount);
  meta.lastCollected += fullPeriods * PAYOUT_INTERVAL_MS;
  return amount;
}
