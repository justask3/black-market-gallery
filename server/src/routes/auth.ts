import { Router } from "express";
import { createPlayer, getPlayerByName, resetPlayerState } from "../db/store.js";
import { seedAllItems } from "../items/adminSeed.js";

export const authRouter = Router();

const ADMIN_NAME = "admin";

/**
 * Lightweight, temporary login: no password, just a display name, matched
 * case-insensitively to an existing account if one exists -- logging in
 * with the same name always returns the same player (same gold, same
 * inventory) rather than minting a fresh one every time. Real authentication
 * (proper credentials, durable storage) is planned for a later stage.
 *
 * The reserved name "admin" is a testing tool, not a real player account:
 * it keeps a stable playerId across logins like everyone else, but every
 * login resets its gold and inventory back to a full, known-good loadout
 * (one of every item type) rather than carrying over whatever a previous
 * test session left it in.
 */
authRouter.post("/login", (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "A name is required." });
  }

  const trimmedName = name.trim();
  const isAdmin = trimmedName.toLowerCase() === ADMIN_NAME;

  const existing = getPlayerByName(trimmedName);
  if (existing) {
    if (isAdmin) {
      resetPlayerState(existing.id);
      seedAllItems(existing.id);
    }
    return res.json({ playerId: existing.id, name: existing.name, gold: existing.gold, isAdmin: existing.isAdmin });
  }

  const player = createPlayer(trimmedName, isAdmin);

  if (isAdmin) {
    seedAllItems(player.id);
  }

  res.json({ playerId: player.id, name: player.name, gold: player.gold, isAdmin: player.isAdmin });
});
