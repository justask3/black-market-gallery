import { Router } from "express";
import { createPlayer, getPlayerByName } from "../db/store.js";
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
 * Logging in with the reserved name "admin" for the first time seeds one
 * of every item type in the game, for dev/testing. Later "admin" logins
 * just return that same seeded account, not a fresh one.
 */
authRouter.post("/login", (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "A name is required." });
  }

  const trimmedName = name.trim();

  const existing = getPlayerByName(trimmedName);
  if (existing) {
    return res.json({ playerId: existing.id, name: existing.name, gold: existing.gold, isAdmin: existing.isAdmin });
  }

  const isAdmin = trimmedName.toLowerCase() === ADMIN_NAME;
  const player = createPlayer(trimmedName, isAdmin);

  if (isAdmin) {
    seedAllItems(player.id);
  }

  res.json({ playerId: player.id, name: player.name, gold: player.gold, isAdmin: player.isAdmin });
});
