/**
 * Minimum bid increment scales with the current price. Mirrored in
 * client/src/bidIncrement.ts for quick-bid UI -- keep both in sync.
 */
export function getMinIncrement(currentPrice: number): number {
  if (currentPrice < 100) return 5;
  if (currentPrice < 1000) return 25;
  if (currentPrice < 10000) return 100;
  return 500;
}
