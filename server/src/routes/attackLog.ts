import { Router } from "express";
import { requirePlayer } from "./middleware.js";
import { getAttackLogsFor } from "../db/store.js";

export const attackLogRouter = Router();

/** Private: a player's own record of Dagger attempts made against them. */
attackLogRouter.get("/attack-log", requirePlayer, (req, res) => {
  const player = req.player!;
  res.json({ entries: getAttackLogsFor(player.id) });
});
