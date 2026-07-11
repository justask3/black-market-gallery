import { Router } from "express";
import { createPlayer } from "../db/store.js";
import { seedAllItems } from "../items/adminSeed.js";

export const authRouter = Router();

const ADMIN_NAME = "admin";

/**
 * Lightweight, temporary login: no password, just a display name.
 * Returns a playerId the client must send on all subsequent REST calls
 * (as the x-player-id header) and in the Socket.io connection handshake.
 * Real authentication is planned for a later stage, per confirmed scope.
 *
 * Logging in with the reserved name "admin" (case-insensitive) grants a
 * fresh player one of every item type in the game, for dev/testing.
 */
authRouter.post("/login", (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "A name is required." });
  }

  const trimmedName = name.trim();
  const isAdmin = trimmedName.toLowerCase() === ADMIN_NAME;
  const player = createPlayer(trimmedName, isAdmin);

  if (isAdmin) {
    seedAllItems(player.id);
  }

  res.json({ playerId: player.id, name: player.name, gold: player.gold, isAdmin: player.isAdmin });
});
