/**
 * Minimum bid increment is a percentage of the current price, rounded up
 * to the nearest gold (floored at 1g): 10% below 1,000g, 5% at 1,000g and
 * above. Mirrored in server/src/auction/bidIncrement.ts, which is the
 * source of truth enforced server-side -- keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  const rate = currentPrice < 1000 ? 0.1 : 0.05;
  return Math.max(1, Math.ceil(currentPrice * rate));
}
