import { Router } from "express";
import { getPlayer, getAuctionHistoryFor, STARTING_GOLD } from "../db/store.js";

export const profileRouter = Router();

/**
 * Public: a player's name plus an estimate of their gold derived only from
 * public auction participation (their real balance is never exposed to
 * anyone but themselves -- see GET /inventory for that). The estimate
 * starts from the known starting balance and walks every publicly-recorded
 * auction join, subtracting the entry fee and, for auctions they won, the
 * winning bid. It deliberately ignores everything else that moves gold
 * (chest loot, Painting income, Dagger heists, relist sale proceeds) since
 * none of that is publicly observable -- it's an estimate, not a ledger.
 */
profileRouter.get("/profile/:playerId", (req, res) => {
  const player = getPlayer(req.params.playerId);
  if (!player) return res.status(404).json({ error: "Player not found." });

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
    history: history.map((entry) => ({
      roomId: entry.roomId,
      tierLabel: entry.tierLabel,
      itemLabel: entry.itemLabel,
      entryFee: entry.entryFee,
      joinedAt: entry.joinedAt,
      endedAt: entry.endedAt,
      won: entry.won,
      finalPrice: entry.finalPrice,
    })),
  });
});
