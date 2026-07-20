import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { Player, InventoryItem, AttackLogEntry, DirectMessage, AuctionHistoryEntry } from "../types.js";

/**
 * In-memory maps are still the live source of truth that the rest of the
 * app reads and mutates directly (e.g. economy/gold.ts's debit/credit
 * mutate a Player object in place, trusting it's the same reference held
 * here) -- nothing about that changes. What's new is durability: on
 * startup this module loads whatever was last saved into these same maps,
 * and a periodic snapshot (plus a save on graceful shutdown) writes them
 * back out to a SQLite file, so state survives a server restart instead
 * of resetting every time. Live/ephemeral state (auction room timers,
 * presence, bid commitments) intentionally stays in-memory-only -- see
 * AuctionManager/PresenceManager -- only durable player-facing state is
 * persisted here.
 */

export const players = new Map<string, Player>();
export const inventories = new Map<string, InventoryItem[]>(); // keyed by playerId
export const attackLogs: AttackLogEntry[] = [];
export const conversations = new Map<string, DirectMessage[]>(); // keyed by sorted "idA:idB"
export const auctionHistory: AuctionHistoryEntry[] = [];
const playerIdByName = new Map<string, string>(); // keyed by lowercased name, for name-only login lookup

export const STARTING_GOLD = 10000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DB_PATH = join(DATA_DIR, "game.db");
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gold INTEGER NOT NULL,
    is_admin INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attack_logs (
    id TEXT PRIMARY KEY,
    victim_id TEXT NOT NULL,
    attacker_id TEXT,
    amount_stolen INTEGER NOT NULL,
    blocked INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    body TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auction_history (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    auction_type TEXT NOT NULL,
    item_label TEXT NOT NULL,
    entry_fee INTEGER NOT NULL,
    joined_at INTEGER NOT NULL,
    ended_at INTEGER,
    won INTEGER NOT NULL,
    final_price INTEGER,
    anonymous INTEGER NOT NULL
  );
`);

/**
 * Idempotent schema migration for columns added after the players table
 * already existed on disk -- CREATE TABLE IF NOT EXISTS doesn't retrofit
 * existing tables, so new nullable columns get added here instead. Safe
 * to run on every boot: swallows the "duplicate column" error the second
 * time onward, rethrows anything else.
 */
function migrateAddColumn(table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("duplicate column name")) throw err;
  }
}

migrateAddColumn("players", "painting_display_cap", "INTEGER");

/** Hydrates the in-memory maps from whatever was last persisted. Runs once, at import time. */
function loadFromDisk(): void {
  for (const row of db.prepare("SELECT * FROM players").all() as any[]) {
    const player: Player = {
      id: row.id,
      name: row.name,
      gold: row.gold,
      isAdmin: !!row.is_admin,
      paintingDisplayCap: row.painting_display_cap ?? undefined,
    };
    players.set(player.id, player);
    playerIdByName.set(player.name.toLowerCase(), player.id);
    inventories.set(player.id, []);
  }
  for (const row of db.prepare("SELECT * FROM inventory_items").all() as any[]) {
    const item: InventoryItem = {
      id: row.id,
      ownerId: row.owner_id,
      itemType: row.item_type,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    };
    const inv = inventories.get(item.ownerId) ?? [];
    inv.push(item);
    inventories.set(item.ownerId, inv);
  }
  for (const row of db.prepare("SELECT * FROM attack_logs").all() as any[]) {
    attackLogs.push({
      id: row.id,
      victimId: row.victim_id,
      attackerId: row.attacker_id,
      amountStolen: row.amount_stolen,
      blocked: !!row.blocked,
      timestamp: row.timestamp,
    });
  }
  for (const row of db.prepare("SELECT * FROM messages").all() as any[]) {
    const msg: DirectMessage = { id: row.id, fromId: row.from_id, toId: row.to_id, body: row.body, timestamp: row.timestamp };
    const key = conversationKey(msg.fromId, msg.toId);
    const list = conversations.get(key) ?? [];
    list.push(msg);
    conversations.set(key, list);
  }
  for (const row of db.prepare("SELECT * FROM auction_history").all() as any[]) {
    auctionHistory.push({
      id: row.id,
      playerId: row.player_id,
      roomId: row.room_id,
      auctionType: row.auction_type,
      itemLabel: row.item_label,
      entryFee: row.entry_fee,
      joinedAt: row.joined_at,
      endedAt: row.ended_at,
      won: !!row.won,
      finalPrice: row.final_price,
      anonymous: !!row.anonymous,
    });
  }
}

/** Overwrites the on-disk snapshot with the current contents of every in-memory map/array. */
function persist(): void {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM players");
    db.exec("DELETE FROM inventory_items");
    db.exec("DELETE FROM attack_logs");
    db.exec("DELETE FROM messages");
    db.exec("DELETE FROM auction_history");

    const insertPlayer = db.prepare(
      "INSERT INTO players (id, name, gold, is_admin, painting_display_cap) VALUES (?, ?, ?, ?, ?)"
    );
    for (const p of players.values()) {
      insertPlayer.run(p.id, p.name, p.gold, p.isAdmin ? 1 : 0, p.paintingDisplayCap ?? null);
    }

    const insertItem = db.prepare(
      "INSERT INTO inventory_items (id, owner_id, item_type, metadata, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    for (const inv of inventories.values()) {
      for (const item of inv) {
        insertItem.run(item.id, item.ownerId, item.itemType, JSON.stringify(item.metadata), item.createdAt);
      }
    }

    const insertLog = db.prepare(
      "INSERT INTO attack_logs (id, victim_id, attacker_id, amount_stolen, blocked, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const log of attackLogs) {
      insertLog.run(log.id, log.victimId, log.attackerId, log.amountStolen, log.blocked ? 1 : 0, log.timestamp);
    }

    const insertMsg = db.prepare("INSERT INTO messages (id, from_id, to_id, body, timestamp) VALUES (?, ?, ?, ?, ?)");
    for (const list of conversations.values()) {
      for (const m of list) insertMsg.run(m.id, m.fromId, m.toId, m.body, m.timestamp);
    }

    const insertHist = db.prepare(
      `INSERT INTO auction_history
        (id, player_id, room_id, auction_type, item_label, entry_fee, joined_at, ended_at, won, final_price, anonymous)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const h of auctionHistory) {
      insertHist.run(
        h.id,
        h.playerId,
        h.roomId,
        h.auctionType,
        h.itemLabel,
        h.entryFee,
        h.joinedAt,
        h.endedAt,
        h.won ? 1 : 0,
        h.finalPrice,
        h.anonymous ? 1 : 0
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

loadFromDisk();

const PERSIST_INTERVAL_MS = 10_000;
setInterval(persist, PERSIST_INTERVAL_MS);

function persistAndExit(): void {
  persist();
  process.exit(0);
}
process.on("SIGINT", persistAndExit);
process.on("SIGTERM", persistAndExit);

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

/** Resets a player back to starting gold and an empty inventory -- used to keep the reserved "admin" test account in a known-good state on every login. */
export function resetPlayerState(playerId: string): void {
  const player = players.get(playerId);
  if (player) {
    player.gold = STARTING_GOLD;
    player.paintingDisplayCap = undefined;
  }
  inventories.set(playerId, []);
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
