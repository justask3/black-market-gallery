import { Request, Response, NextFunction } from "express";
import { getPlayer } from "../db/store.js";
import { Player } from "../types.js";

// Augment Express's Request type so downstream handlers get a typed player.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      player?: Player;
    }
  }
}

/**
 * Reads x-player-id from the request headers and attaches the matching
 * Player to req.player. Rejects with 401 if missing or unknown — this is
 * the REST-side equivalent of the Socket.io handshake auth.
 */
export function requirePlayer(req: Request, res: Response, next: NextFunction) {
  const playerId = req.header("x-player-id");
  const player = playerId ? getPlayer(playerId) : undefined;

  if (!player) {
    return res.status(401).json({ error: "Unknown or missing player session." });
  }

  req.player = player;
  next();
}
