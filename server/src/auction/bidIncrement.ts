/**
 * Minimum bid increment is a percentage of the current price, rounded up
 * to the nearest gold (floored at 1g so a bid always has to raise the
 * price by something): 10% below 1,000g, 5% at 1,000g and above. Mirrored
 * in client/src/bidIncrement.ts for quick-bid UI -- keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  const rate = currentPrice < 1000 ? 0.1 : 0.05;
  return Math.max(1, Math.ceil(currentPrice * rate));
}
