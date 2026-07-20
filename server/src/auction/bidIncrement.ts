/**
 * Minimum bid increment is always 5% of the current price, rounded up to
 * the nearest gold (floored at 1g so a bid always has to raise the price by
 * something). Mirrored in client/src/bidIncrement.ts for quick-bid UI --
 * keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  return Math.max(1, Math.ceil(currentPrice * 0.05));
}
