import { Player, InventoryItem } from "../types.js";
import { scaleToFloor, debit, credit } from "../economy/gold.js";
import { hasItemType } from "./sigil.js";

const STAKE = 200;
const BASE_WIN_CHANCE = 0.5;
const WEIGHTED_DICE_WIN_CHANCE = 0.6;

export interface CoinFlipResult {
  won: boolean;
  amount: number;
}

/** Twin-Faced Coin: flip a fixed stake, doubled on a win or lost on a loss. Weighted Dice (passive, checked here) improves the odds while held. */
export function flipTwinFacedCoin(owner: Player, ownerInventory: InventoryItem[]): CoinFlipResult {
  const winChance = hasItemType(ownerInventory, owner.id, "weighted_dice")
    ? WEIGHTED_DICE_WIN_CHANCE
    : BASE_WIN_CHANCE;
  const won = Math.random() < winChance;

  if (won) {
    credit(owner, STAKE);
    return { won: true, amount: STAKE };
  }

  const actualAmount = scaleToFloor(owner, STAKE);
  debit(owner, actualAmount);
  return { won: false, amount: actualAmount };
}
