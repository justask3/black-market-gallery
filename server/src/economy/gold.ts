import { Player, DEBT_FLOOR } from "../types.js";

/**
 * The single rule governing every gold-spending action in the game:
 * bidding, entry fees, and Dagger heists all call this same function.
 *
 * A player may spend an amount as long as doing so does not push their
 * balance below DEBT_FLOOR (-1000).
 *
 * Example: a player with 5000 gold can afford up to 6000 (5000 - 6000 = -1000).
 */
export function canAfford(player: Player, amount: number): boolean {
  return player.gold - amount >= DEBT_FLOOR;
}

/**
 * Deducts gold from a player. Caller is responsible for having validated
 * canAfford() first where the action should be rejected outright (bids,
 * entry fees). For Dagger heists, use scaleToFloor() first to compute a
 * safe amount, then debit() that scaled amount.
 */
export function debit(player: Player, amount: number): void {
  player.gold -= amount;
}

export function credit(player: Player, amount: number): void {
  player.gold += amount;
}

/**
 * Used specifically for Dagger heists: the raw roll (5-10% of target's
 * gold) is scaled DOWN so the target never drops below DEBT_FLOOR,
 * rather than the heist being blocked outright. Returns the actual
 * amount that should be stolen.
 */
export function scaleToFloor(target: Player, rawAmount: number): number {
  const maxStealable = target.gold - DEBT_FLOOR;
  if (maxStealable <= 0) return 0;
  return Math.min(rawAmount, maxStealable);
}
