import { Router } from "express";
import { PresenceManager } from "../presence/PresenceManager.js";

/** Public: who's online right now, or was recently -- powers the Player Activity sidebar. */
export function buildPresenceRouter(presenceManager: PresenceManager): Router {
  const router = Router();

  router.get("/players/activity", (req, res) => {
    res.json({ players: presenceManager.getActivityList() });
  });

  return router;
}
