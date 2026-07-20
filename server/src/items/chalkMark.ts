import { InventoryItem, Player, ChalkMarkInfo } from "../types.js";

/** Marks an item with the current owner as the start of its tracked ownership history. */
export function applyChalkMark(item: InventoryItem, currentOwner: Player): void {
  item.metadata.chalkMark = {
    history: [{ ownerId: currentOwner.id, ownerName: currentOwner.name, acquiredAt: item.createdAt }],
  };
}

/** Called when a chalk-marked item changes hands (auction settlement) -- appends the new owner rather than replacing the history. */
export function recordChalkMarkTransfer(chalkMark: ChalkMarkInfo, newOwner: Player): void {
  chalkMark.history.push({ ownerId: newOwner.id, ownerName: newOwner.name, acquiredAt: Date.now() });
}
