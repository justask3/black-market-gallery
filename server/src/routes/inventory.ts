import { Router } from "express";
import { requirePlayer } from "./middleware.js";
import { getInventory, getPlayer, addItem, removeItem, players } from "../db/store.js";
import { collectPaintingIncome, MAX_DISPLAYED_PAINTINGS } from "../items/painting.js";
import { collectBleedingCoinDrain } from "../items/bleedingCoin.js";
import { collectVaultLedgerLockUpkeep } from "../items/vaultLedgerLock.js";
import { collectTarnishedLocketIncome } from "../items/tarnishedLocket.js";
import { flipTwinFacedCoin } from "../items/coinFlip.js";
import { applyChalkMark } from "../items/chalkMark.js";
import { rollChestLoot, chestTierFor, categoryFor } from "../items/chest.js";
import { freshMetadataFor } from "../items/freshMetadata.js";
import { PaintingMetadata, EmptyFrameMetadata, ChestMetadata, InventoryItem, CHEST_ITEM_TYPES } from "../types.js";
import { AuctionManager } from "../auction/AuctionManager.js";

/** Painting and Empty Frame both occupy a display slot and are subject to the same cap; only Painting actually earns anything. */
function isDisplayable(itemType: string): boolean {
  return itemType === "painting" || itemType === "empty_frame";
}

/**
 * Runs lazy income collection for every currently-displayed Painting a
 * player owns. Only Paintings with metadata.displayed === true accrue
 * anything -- this reflects the confirmed rule that undisplayed
 * Paintings do not accumulate income at all while inactive.
 */
function collectDisplayedPaintingIncome(playerId: string): void {
  const player = getPlayer(playerId);
  if (!player) return;

  const displayedPaintings = getInventory(playerId).filter(
    (item) => item.itemType === "painting" && (item.metadata as PaintingMetadata).displayed
  );

  for (const painting of displayedPaintings) {
    collectPaintingIncome(painting, player);
  }
}

/**
 * Runs lazy drain collection for every Bleeding Coin a player holds.
 * Sorted by createdAt (acquisition order) so that when a player holds
 * multiple coins, each one's elapsed ticks are applied fully, in
 * sequence, before the next coin's ticks run -- this produces the
 * confirmed "Reading 1" sequential-compounding behavior rather than
 * all coins draining off the same starting balance independently.
 */
function collectAllBleedingCoinDrain(playerId: string): void {
  const player = getPlayer(playerId);
  if (!player) return;

  const coins = getInventory(playerId)
    .filter((item) => item.itemType === "bleeding_coin")
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const coin of coins) {
    collectBleedingCoinDrain(coin, player);
  }
}

/** Same lazy-tick pattern as Bleeding Coin, for every Vault Ledger Lock a player holds. */
function collectAllVaultLedgerLockUpkeep(playerId: string): void {
  const player = getPlayer(playerId);
  if (!player) return;

  const locks = getInventory(playerId)
    .filter((item) => item.itemType === "vault_ledger_lock")
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const lock of locks) {
    collectVaultLedgerLockUpkeep(lock, player);
  }
}

/** Same lazy-tick pattern as Painting, for every Tarnished Locket a player holds -- no display concept, so no filtering needed. */
function collectAllTarnishedLocketIncome(playerId: string): void {
  const player = getPlayer(playerId);
  if (!player) return;

  const lockets = getInventory(playerId).filter((item) => item.itemType === "tarnished_locket");
  for (const locket of lockets) {
    collectTarnishedLocketIncome(locket, player);
  }
}

export function buildInventoryRouter(auctionManager: AuctionManager): Router {
  const router = Router();

  /** Private: full inventory + current gold, for the authenticated player only. */
  router.get("/inventory", requirePlayer, (req, res) => {
    const player = req.player!;
    collectDisplayedPaintingIncome(player.id);
    collectAllBleedingCoinDrain(player.id);
    collectAllVaultLedgerLockUpkeep(player.id);
    collectAllTarnishedLocketIncome(player.id);
    const inventory = getInventory(player.id);
    res.json({ gold: player.gold, inventory });
  });

  /**
   * Public: the game-wide gallery feed -- every player who currently has at
   * least one Painting or Empty Frame on display, across the whole game.
   * Players with nothing displayed are omitted rather than listed empty.
   */
  router.get("/gallery", (req, res) => {
    const galleries: { playerId: string; playerName: string; paintings: InventoryItem[] }[] = [];

    for (const player of players.values()) {
      collectDisplayedPaintingIncome(player.id);
      const displayedItems = getInventory(player.id).filter(
        (item) => isDisplayable(item.itemType) && (item.metadata as PaintingMetadata | EmptyFrameMetadata).displayed
      );
      if (displayedItems.length > 0) {
        galleries.push({ playerId: player.id, playerName: player.name, paintings: displayedItems });
      }
    }

    res.json({ galleries });
  });

  /** Public: any visitor can see another player's DISPLAYED Paintings/Empty Frames only. */
  router.get("/gallery/:playerId", (req, res) => {
    const { playerId } = req.params;
    const target = getPlayer(playerId);
    if (!target) return res.status(404).json({ error: "Player not found." });

    collectDisplayedPaintingIncome(playerId);
    const displayedItems = getInventory(playerId).filter(
      (item) => isDisplayable(item.itemType) && (item.metadata as PaintingMetadata | EmptyFrameMetadata).displayed
    );
    res.json({ playerName: target.name, paintings: displayedItems });
  });

  /**
   * Displays a Painting or Empty Frame so it occupies a display slot (only
   * Painting actually accrues income). Rejected outright if the player is
   * already at their display cap -- no auto-swap, per confirmed design.
   * Resets a Painting's lastCollected to "now" since no time should count
   * toward payout while it wasn't displayed.
   */
  router.post("/items/:id/display", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const item = inventory.find((i) => i.id === req.params.id && isDisplayable(i.itemType));
    if (!item) return res.status(404).json({ error: "No displayable item (Painting or Empty Frame) found with that ID." });

    const meta = item.metadata as PaintingMetadata | EmptyFrameMetadata;
    if (meta.displayed) return res.json({ displayed: true }); // already displayed, no-op

    const cap = player.paintingDisplayCap ?? MAX_DISPLAYED_PAINTINGS;
    const currentlyDisplayedCount = inventory.filter(
      (i) => isDisplayable(i.itemType) && (i.metadata as PaintingMetadata | EmptyFrameMetadata).displayed
    ).length;

    if (currentlyDisplayedCount >= cap) {
      return res.status(409).json({
        error: `You can only display ${cap} item${cap === 1 ? "" : "s"} at once. Undisplay one first.`,
      });
    }

    meta.displayed = true;
    if (item.itemType === "painting") {
      (meta as PaintingMetadata).lastCollected = Date.now();
    }
    res.json({ displayed: true });
  });

  /**
   * Undisplays a Painting or Empty Frame. Any progress toward a Painting's
   * next payout is not banked -- consistent with "does not accumulate
   * while inactive."
   */
  router.post("/items/:id/undisplay", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const item = inventory.find((i) => i.id === req.params.id && isDisplayable(i.itemType));
    if (!item) return res.status(404).json({ error: "No displayable item (Painting or Empty Frame) found with that ID." });

    const meta = item.metadata as PaintingMetadata | EmptyFrameMetadata;
    meta.displayed = false;
    res.json({ displayed: false });
  });

  /**
   * Opens a Chest (any rarity): rolls that rarity's loot table and applies
   * the result -- unless Street Rumor already pre-rolled and locked in a
   * pendingLoot on this specific chest, in which case that result is used
   * instead of rolling fresh.
   */
  router.post("/items/:id/open", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const chest = inventory.find((i) => i.id === req.params.id && CHEST_ITEM_TYPES.includes(i.itemType));
    if (!chest) return res.status(404).json({ error: "Chest not found in your inventory." });

    const chestMeta = chest.metadata as ChestMetadata;
    const loot = chestMeta.pendingLoot ?? rollChestLoot(chestTierFor(chest.itemType));
    removeItem(player.id, chest.id);

    if (loot.type === "gold") {
      player.gold += loot.amount;
      return res.json({ result: "gold", amount: loot.amount });
    }

    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      ownerId: player.id,
      itemType: loot.itemType,
      metadata: freshMetadataFor(loot.itemType),
      createdAt: Date.now(),
    };
    addItem(newItem);
    res.json({ result: "item", itemType: loot.itemType, item: newItem });
  });

  /**
   * Relists any item (Bleeding Coin is explicitly rejected, per its
   * catalog description) by enqueueing it into the Common Block tier's
   * listing queue -- it no longer starts a room directly. The server's own
   * schedulers (see auction/tiers.ts, AuctionManager) are the primary
   * source of new rounds; this queue is drained first whenever a Common
   * slot needs filling, ahead of the server spawning its own filler room.
   */
  router.post("/items/:id/relist", requirePlayer, (req, res) => {
    const player = req.player!;
    const { startingPrice } = req.body ?? {};

    if (typeof startingPrice !== "number" || startingPrice <= 0) {
      return res.status(400).json({ error: "A valid starting price is required." });
    }

    const inventory = getInventory(player.id);
    const item = inventory.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found in your inventory." });
    if (item.itemType === "bleeding_coin") {
      return res.status(400).json({ error: "Bleeding Coins cannot be listed on auction." });
    }

    // A relisted Painting/Empty Frame resets to a fresh, undisplayed state
    // -- its display slot and accrual history don't carry over to whoever
    // wins it. Chalk-mark provenance (if any) survives regardless.
    let metadata = item.metadata;
    if (item.itemType === "painting") {
      metadata = { lastCollected: Date.now(), displayed: false, chalkMark: item.metadata.chalkMark };
    } else if (item.itemType === "empty_frame") {
      metadata = { displayed: false, chalkMark: item.metadata.chalkMark };
    }

    auctionManager.enqueueCommonListing(startingPrice, player.id, item.itemType, metadata);
    removeItem(player.id, item.id);
    res.json({ queued: true });
  });

  /** Chalk Marker: attaches ownership-history tracking to another of your own items, then is consumed. */
  router.post("/items/:id/chalk-mark", requirePlayer, (req, res) => {
    const player = req.player!;
    const { targetItemId } = req.body ?? {};
    if (typeof targetItemId !== "string") {
      return res.status(400).json({ error: "A target item ID is required." });
    }

    const inventory = getInventory(player.id);
    const marker = inventory.find((i) => i.id === req.params.id && i.itemType === "chalk_marker");
    if (!marker) return res.status(404).json({ error: "Chalk Marker not found in your inventory." });

    const target = inventory.find((i) => i.id === targetItemId);
    if (!target) return res.status(404).json({ error: "Target item not found in your inventory." });
    if (target.id === marker.id) {
      return res.status(400).json({ error: "Cannot mark the Chalk Marker itself." });
    }

    applyChalkMark(target, player);
    removeItem(player.id, marker.id);
    res.json({ marked: true, item: target });
  });

  /** Twin-Faced Coin: flip for a fixed stake, consumed either way. */
  router.post("/items/:id/flip-coin", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const coin = inventory.find((i) => i.id === req.params.id && i.itemType === "twin_faced_coin");
    if (!coin) return res.status(404).json({ error: "Twin-Faced Coin not found in your inventory." });

    removeItem(player.id, coin.id);
    const result = flipTwinFacedCoin(player, inventory);
    res.json(result);
  });

  /** Street Rumor: pre-rolls and locks in a specific chest's contents, revealing only its broad category. */
  router.post("/items/:id/use-street-rumor", requirePlayer, (req, res) => {
    const player = req.player!;
    const { chestItemId } = req.body ?? {};
    if (typeof chestItemId !== "string") {
      return res.status(400).json({ error: "A chest item ID is required." });
    }

    const inventory = getInventory(player.id);
    const rumor = inventory.find((i) => i.id === req.params.id && i.itemType === "street_rumor");
    if (!rumor) return res.status(404).json({ error: "Street Rumor not found in your inventory." });

    const chest = inventory.find((i) => i.id === chestItemId && CHEST_ITEM_TYPES.includes(i.itemType));
    if (!chest) return res.status(404).json({ error: "Chest not found in your inventory." });

    const chestMeta = chest.metadata as ChestMetadata;
    if (chestMeta.pendingLoot) {
      return res.status(400).json({ error: "This chest has already had its contents revealed." });
    }

    const loot = rollChestLoot(chestTierFor(chest.itemType));
    chestMeta.pendingLoot = loot;

    removeItem(player.id, rumor.id);
    res.json({ category: categoryFor(loot) });
  });

  /** Gallery Deed: permanently raises the player's display cap to 3, consumed on use. */
  router.post("/items/:id/use-gallery-deed", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const deed = inventory.find((i) => i.id === req.params.id && i.itemType === "gallery_deed");
    if (!deed) return res.status(404).json({ error: "Gallery Deed not found in your inventory." });

    const currentCap = player.paintingDisplayCap ?? MAX_DISPLAYED_PAINTINGS;
    if (currentCap >= 3) {
      return res.status(409).json({ error: "Your display cap is already at its maximum." });
    }

    player.paintingDisplayCap = 3;
    removeItem(player.id, deed.id);
    res.json({ paintingDisplayCap: 3 });
  });

  return router;
}
