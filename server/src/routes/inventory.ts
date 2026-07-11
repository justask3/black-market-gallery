import { Router } from "express";
import { requirePlayer } from "./middleware.js";
import { getInventory, getPlayer, addItem, removeItem } from "../db/store.js";
import { collectPaintingIncome, MAX_DISPLAYED_PAINTINGS } from "../items/painting.js";
import { collectBleedingCoinDrain } from "../items/bleedingCoin.js";
import { rollChestLoot, chestTierFor } from "../items/chest.js";
import { DaggerMetadata, PaintingMetadata, InventoryItem, CHEST_ITEM_TYPES } from "../types.js";
import { AuctionManager } from "../auction/AuctionManager.js";

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

export function buildInventoryRouter(auctionManager: AuctionManager): Router {
  const router = Router();

  /** Private: full inventory + current gold, for the authenticated player only. */
  router.get("/inventory", requirePlayer, (req, res) => {
    const player = req.player!;
    collectDisplayedPaintingIncome(player.id);
    collectAllBleedingCoinDrain(player.id);
    const inventory = getInventory(player.id);
    res.json({ gold: player.gold, inventory });
  });

  /** Public: any visitor can see another player's DISPLAYED Paintings only. */
  router.get("/gallery/:playerId", (req, res) => {
    const { playerId } = req.params;
    const target = getPlayer(playerId);
    if (!target) return res.status(404).json({ error: "Player not found." });

    collectDisplayedPaintingIncome(playerId);
    const displayedPaintings = getInventory(playerId).filter(
      (item) => item.itemType === "painting" && (item.metadata as PaintingMetadata).displayed
    );
    res.json({ playerName: target.name, paintings: displayedPaintings });
  });

  /**
   * Displays a Painting so it starts accruing income. Rejected outright
   * if the player already has MAX_DISPLAYED_PAINTINGS (2) displayed --
   * no auto-swap, per confirmed design. Resets lastCollected to "now"
   * since no time should count toward payout while it wasn't displayed.
   */
  router.post("/items/:id/display", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const painting = inventory.find((i) => i.id === req.params.id && i.itemType === "painting");
    if (!painting) return res.status(404).json({ error: "Painting not found in your inventory." });

    const meta = painting.metadata as PaintingMetadata;
    if (meta.displayed) return res.json({ displayed: true }); // already displayed, no-op

    const currentlyDisplayedCount = inventory.filter(
      (i) => i.itemType === "painting" && (i.metadata as PaintingMetadata).displayed
    ).length;

    if (currentlyDisplayedCount >= MAX_DISPLAYED_PAINTINGS) {
      return res.status(409).json({
        error: `You can only display ${MAX_DISPLAYED_PAINTINGS} Paintings at once. Undisplay one first.`,
      });
    }

    meta.displayed = true;
    meta.lastCollected = Date.now();
    res.json({ displayed: true });
  });

  /**
   * Undisplays a Painting. Any progress toward its next payout is not
   * banked -- consistent with "does not accumulate while inactive."
   */
  router.post("/items/:id/undisplay", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const painting = inventory.find((i) => i.id === req.params.id && i.itemType === "painting");
    if (!painting) return res.status(404).json({ error: "Painting not found in your inventory." });

    const meta = painting.metadata as PaintingMetadata;
    meta.displayed = false;
    res.json({ displayed: false });
  });

  /** Opens a Chest (any rarity): rolls that rarity's loot table and applies the result. */
  router.post("/items/:id/open", requirePlayer, (req, res) => {
    const player = req.player!;
    const inventory = getInventory(player.id);
    const chest = inventory.find(
      (i) => i.id === req.params.id && CHEST_ITEM_TYPES.includes(i.itemType)
    );
    if (!chest) return res.status(404).json({ error: "Chest not found in your inventory." });

    removeItem(player.id, chest.id);
    const loot = rollChestLoot(chestTierFor(chest.itemType));

    if (loot.type === "gold") {
      player.gold += loot.amount;
      return res.json({ result: "gold", amount: loot.amount });
    }

    const metadata =
      loot.itemType === "dagger"
        ? ({ chargesRemaining: 2 } as DaggerMetadata)
        : loot.itemType === "painting"
        ? ({ lastCollected: Date.now(), displayed: false } as PaintingMetadata) // starts undisplayed
        : {};

    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      ownerId: player.id,
      itemType: loot.itemType,
      metadata,
      createdAt: Date.now(),
    };
    addItem(newItem);
    res.json({ result: "item", itemType: loot.itemType, item: newItem });
  });

  /**
   * Relists any item (Chest, Painting, Sigil, or Dagger -- Bleeding Coin is
   * explicitly rejected, per its catalog description) by enqueueing it into
   * the Common Block tier's listing queue -- it no longer starts a room
   * directly. The server's own schedulers (see auction/tiers.ts,
   * AuctionManager) are the primary source of new rounds; this queue is
   * drained first whenever a Common slot needs filling, ahead of the server
   * spawning its own filler room.
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

    // A relisted Painting is reset to a fresh, undisplayed state -- its
    // display slot and accrual history don't carry over to whoever wins it.
    const metadata =
      item.itemType === "painting"
        ? ({ lastCollected: Date.now(), displayed: false } as PaintingMetadata)
        : item.metadata;

    auctionManager.enqueueCommonListing(startingPrice, player.id, item.itemType, metadata);
    removeItem(player.id, item.id);
    res.json({ queued: true });
  });

  return router;
}
