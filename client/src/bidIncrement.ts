/**
 * Minimum bid increment scales with the current price. Mirrored in
 * server/src/auction/bidIncrement.ts, which is the source of truth
 * enforced server-side -- keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  if (currentPrice < 100) return 5;
  if (currentPrice < 1000) return 25;
  if (currentPrice < 10000) return 100;
  return 500;
}
