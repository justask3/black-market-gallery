import { Player, InventoryItem, BleedingCoinMetadata } from "../types.js";
import { scaleToFloor, debit } from "../economy/gold.js";

const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const TICKS_PER_DAY = (24 * 60) / 10; // 144
const DAILY_RATE = 0.07;
const TICK_RATE = DAILY_RATE / TICKS_PER_DAY; // flat per-tick %, linear reading (confirmed)

/**
 * Lazily evaluates a single Bleeding Coin's drain, using the same
 * lazy-on-visit pattern as the Painting (no background timers). For
 * every full 10-minute tick that has elapsed since lastDrained, it
 * removes TICK_RATE of the player's CURRENT gold at that moment.
 *
 * Ticks are applied one at a time in sequence (not as a single
 * multiplication against the original balance) because each tick's
 * amount depends on the balance left after the previous tick -- this
 * is what "linear per-tick rate" actually looks like when multiple
 * ticks have elapsed since the last check.
 *
 * Every tick is scaled to the existing -1000g debt floor via
 * scaleToFloor, same as Dagger heists -- this item gets no special
 * exemption from that rule (confirmed).
 *
 * This is a PURE SINK: drained gold is destroyed via debit() only.
 * There is no corresponding credit() anywhere -- confirmed design.
 *
 * When a player holds multiple coins, the caller (routes/inventory.ts)
 * is responsible for calling this once per coin, in sequence, sorted
 * by acquisition order -- that sequencing is what produces the
 * confirmed "Reading 1" compounding behavior across multiple coins.
 */
export function collectBleedingCoinDrain(coinItem: InventoryItem, owner: Player): number {
  const meta = coinItem.metadata as BleedingCoinMetadata;
  const now = Date.now();
  const elapsed = now - meta.lastDrained;

  const fullTicks = Math.floor(elapsed / TICK_INTERVAL_MS);
  if (fullTicks <= 0) return 0;

  let totalDrained = 0;
  for (let i = 0; i < fullTicks; i++) {
    const rawTickAmount = Math.round(owner.gold * TICK_RATE);
    const actualAmount = scaleToFloor(owner, rawTickAmount);
    debit(owner, actualAmount);
    totalDrained += actualAmount;
  }

  meta.lastDrained += fullTicks * TICK_INTERVAL_MS;
  return totalDrained;
}
