import { Router } from "express";
import { AuctionManager } from "../auction/AuctionManager.js";

/**
 * Note: there is deliberately no POST /auction/start here anymore. Rounds
 * begin automatically -- each tier's own spawn scheduler in AuctionManager
 * is the primary driver (see tiers.ts / AuctionManager.bootstrap). Players
 * can additionally feed the Common Block tier via POST /items/:id/relist,
 * which enqueues rather than starting a room directly.
 */
export function buildAuctionRouter(auctionManager: AuctionManager): Router {
  const router = Router();

  /** Public snapshot of every live room across all tiers -- used on page load before the socket connects. */
  router.get("/auction", (req, res) => {
    res.json({ rooms: auctionManager.getAllRooms() });
  });

  return router;
}
