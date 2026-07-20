/**
 * Minimum bid increment is always 5% of the current price, rounded up to
 * the nearest gold (floored at 1g). Mirrored in
 * server/src/auction/bidIncrement.ts, which is the source of truth
 * enforced server-side -- keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  return Math.max(1, Math.ceil(currentPrice * 0.05));
}
