import { Router } from "express";
import { AuctionManager } from "../auction/AuctionManager.js";

/**
 * Note: there is deliberately no POST /auction/start here anymore. The
 * only way a new round begins is either (a) the one-time server boot
 * seed (see server.ts) or (b) a player relisting a Chest they own via
 * POST /items/:id/relist. This matches the confirmed rule that starting
 * a round requires owning the item being auctioned.
 */
export function buildAuctionRouter(auctionManager: AuctionManager): Router {
  const router = Router();

  /** Public snapshot of the current room, if any -- used on page load before the socket connects. */
  router.get("/auction", (req, res) => {
    const room = auctionManager.getRoom();
    if (!room) return res.json({ active: false });
    res.json({ active: true, ...room.getPublicState() });
  });

  return router;
}
