import { Router } from "express";
import { getPlayer, getAuctionHistoryFor, getInventory, STARTING_GOLD } from "../db/store.js";
import { WatchersTokenMetadata } from "../types.js";

export const profileRouter = Router();

/**
 * Public: a player's name plus an estimate of their gold derived only from
 * public auction participation (their real balance is never exposed to
 * anyone but themselves -- see GET /inventory for that). The estimate
 * starts from the known starting balance and walks every recorded auction
 * join, subtracting the entry fee and, for auctions they won, the winning
 * bid. It deliberately ignores everything else that moves gold (chest
 * loot, Painting income, Dagger heists, relist sale proceeds) since none
 * of that is publicly observable -- it's an estimate, not a ledger.
 *
 * Optional x-player-id identifies the viewer: if it matches the profile
 * being viewed, every history entry is returned in full, including
 * anonymous ones (nothing is hidden from yourself). Otherwise, entries
 * made anonymously are redacted down to just the date and auction type --
 * item, result, and price come back null rather than omitting the row
 * entirely, since the point of anonymity is to hide the outcome, not the
 * fact that a participation happened.
 */
profileRouter.get("/profile/:playerId", (req, res) => {
  const player = getPlayer(req.params.playerId);
  if (!player) return res.status(404).json({ error: "Player not found." });

  const viewerId = req.header("x-player-id");
  const isSelf = viewerId === player.id;

  // Watcher's Token: if the profile owner holds one, log this visit onto it
  // (skipped for self-views -- you don't need to be told you looked at
  // your own profile).
  if (!isSelf && viewerId) {
    const viewer = getPlayer(viewerId);
    const token = getInventory(player.id).find((i) => i.itemType === "watchers_token");
    if (viewer && token) {
      const meta = token.metadata as WatchersTokenMetadata;
      meta.visits.push({ viewerId: viewer.id, viewerName: viewer.name, timestamp: Date.now() });
    }
  }

  const history = getAuctionHistoryFor(player.id).sort((a, b) => b.joinedAt - a.joinedAt);

  let estimatedGold = STARTING_GOLD;
  for (const entry of history) {
    estimatedGold -= entry.entryFee;
    if (entry.won && entry.finalPrice != null) {
      estimatedGold -= entry.finalPrice;
    }
  }

  res.json({
    playerId: player.id,
    playerName: player.name,
    estimatedGold,
    history: history.map((entry) => {
      const redact = entry.anonymous && !isSelf;
      return {
        roomId: entry.roomId,
        auctionType: entry.auctionType,
        joinedAt: entry.joinedAt,
        anonymous: entry.anonymous,
        itemLabel: redact ? null : entry.itemLabel,
        entryFee: redact ? null : entry.entryFee,
        endedAt: redact ? null : entry.endedAt,
        won: redact ? null : entry.won,
        finalPrice: redact ? null : entry.finalPrice,
      };
    }),
  });
});
