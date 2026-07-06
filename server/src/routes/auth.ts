import { Router } from "express";
import { createPlayer } from "../db/store.js";

export const authRouter = Router();

/**
 * Lightweight, temporary login: no password, just a display name.
 * Returns a playerId the client must send on all subsequent REST calls
 * (as the x-player-id header) and in the Socket.io connection handshake.
 * Real authentication is planned for a later stage, per confirmed scope.
 */
authRouter.post("/login", (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "A name is required." });
  }

  const player = createPlayer(name.trim());
  res.json({ playerId: player.id, name: player.name, gold: player.gold });
});
