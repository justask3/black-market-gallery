import { Router } from "express";
import { requirePlayer } from "./middleware.js";
import { getPlayer, getConversation } from "../db/store.js";

export const messagesRouter = Router();

/** Private: the authenticated player's persisted conversation history with another player. */
messagesRouter.get("/messages/:playerId", requirePlayer, (req, res) => {
  const player = req.player!;
  const other = getPlayer(req.params.playerId);
  if (!other) return res.status(404).json({ error: "Player not found." });

  res.json({ messages: getConversation(player.id, other.id) });
});
