import { Player, InventoryItem, AttackLogEntry, DirectMessage, AuctionHistoryEntry } from "../types.js";

/**
 * Plain in-memory store standing in for PostgreSQL at this stage (Option B,
 * confirmed). Every function elsewhere in the app reaches game state
 * through this module only — nothing else holds a direct reference to
 * these maps. That isolation is what makes swapping this for a real
 * Postgres-backed repository later a contained change, rather than a
 * rewrite of the economy/auction/item logic.
 */

export const players = new Map<string, Player>();
export const inventories = new Map<string, InventoryItem[]>(); // keyed by playerId
export const attackLogs: AttackLogEntry[] = [];
export const conversations = new Map<string, DirectMessage[]>(); // keyed by sorted "idA:idB"
export const auctionHistory: AuctionHistoryEntry[] = [];
const playerIdByName = new Map<string, string>(); // keyed by lowercased name, for name-only login lookup

export const STARTING_GOLD = 10000;

export function createPlayer(name: string, isAdmin: boolean = false): Player {
  const player: Player = {
    id: crypto.randomUUID(),
    name,
    gold: STARTING_GOLD,
    isAdmin,
  };
  players.set(player.id, player);
  inventories.set(player.id, []);
  playerIdByName.set(name.toLowerCase(), player.id);
  return player;
}

export function getPlayer(id: string): Player | undefined {
  return players.get(id);
}

/** Case-insensitive lookup by display name -- backs name-only login (no password, no dedup by anything else). */
export function getPlayerByName(name: string): Player | undefined {
  const id = playerIdByName.get(name.toLowerCase());
  return id ? players.get(id) : undefined;
}

export function getInventory(playerId: string): InventoryItem[] {
  return inventories.get(playerId) ?? [];
}

export function addItem(item: InventoryItem): void {
  const inv = inventories.get(item.ownerId) ?? [];
  inv.push(item);
  inventories.set(item.ownerId, inv);
}

export function removeItem(playerId: string, itemId: string): void {
  const inv = inventories.get(playerId) ?? [];
  const idx = inv.findIndex((i) => i.id === itemId);
  if (idx !== -1) inv.splice(idx, 1);
}

export function getAttackLogsFor(playerId: string): AttackLogEntry[] {
  return attackLogs.filter((log) => log.victimId === playerId);
}

export function addAttackLog(entry: AttackLogEntry): void {
  attackLogs.push(entry);
}

function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function getConversation(a: string, b: string): DirectMessage[] {
  return conversations.get(conversationKey(a, b)) ?? [];
}

export function addMessage(msg: DirectMessage): void {
  const key = conversationKey(msg.fromId, msg.toId);
  const list = conversations.get(key) ?? [];
  list.push(msg);
  conversations.set(key, list);
}

export function getAuctionHistoryFor(playerId: string): AuctionHistoryEntry[] {
  return auctionHistory.filter((h) => h.playerId === playerId);
}

export function addAuctionHistoryEntry(entry: AuctionHistoryEntry): void {
  auctionHistory.push(entry);
}

/** Fills in every participant's history entry for a room once it ends. */
export function settleAuctionHistoryForRoom(
  roomId: string,
  winnerId: string | null,
  finalPrice: number
): void {
  const endedAt = Date.now();
  for (const entry of auctionHistory) {
    if (entry.roomId !== roomId) continue;
    entry.endedAt = endedAt;
    entry.won = entry.playerId === winnerId;
    entry.finalPrice = finalPrice;
  }
}
