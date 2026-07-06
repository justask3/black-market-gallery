import { Player, InventoryItem, AttackLogEntry } from "../types.js";

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

const STARTING_GOLD = 10000;

export function createPlayer(name: string): Player {
  const player: Player = {
    id: crypto.randomUUID(),
    name,
    gold: STARTING_GOLD,
  };
  players.set(player.id, player);
  inventories.set(player.id, []);
  return player;
}

export function getPlayer(id: string): Player | undefined {
  return players.get(id);
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
