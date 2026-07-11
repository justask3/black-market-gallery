import { Server as SocketIOServer, Socket } from "socket.io";
import { AuctionManager } from "../auction/AuctionManager.js";
import { PresenceManager } from "../presence/PresenceManager.js";
import { getPlayer, getInventory, addAttackLog, addMessage } from "../db/store.js";
import { resolveDaggerAttack } from "../items/dagger.js";
import { Player, DirectMessage } from "../types.js";

declare module "socket.io" {
  interface Socket {
    data: { player: Player };
  }
}

export function registerSocketHandlers(
  io: SocketIOServer,
  auctionManager: AuctionManager,
  presenceManager: PresenceManager
): void {
  // Every connecting socket must present a valid playerId from the
  // lightweight login step. This is the socket-side equivalent of the
  // x-player-id header used on REST calls.
  io.use((socket, next) => {
    const playerId = socket.handshake.auth?.playerId;
    const player = typeof playerId === "string" ? getPlayer(playerId) : undefined;
    if (!player) return next(new Error("Unauthorized: unknown player session."));
    socket.data.player = player;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const player = socket.data.player;

    // A private room per player, used to deliver notifications (Dagger
    // hits, Sigil blocks, direct messages) regardless of which auction
    // room they're in.
    socket.join(`player:${player.id}`);

    presenceManager.markConnected(player.id);
    socket.on("disconnect", () => presenceManager.markDisconnected(player.id));

    socket.on("message:send", ({ toId, body }: { toId: string; body: string }) => {
      const trimmed = body?.trim().slice(0, 500);
      if (!trimmed) return;

      const target = getPlayer(toId);
      if (!target) {
        socket.emit("message:rejected", { toId, reason: "Player not found." });
        return;
      }

      const msg: DirectMessage = {
        id: crypto.randomUUID(),
        fromId: player.id,
        toId,
        body: trimmed,
        timestamp: Date.now(),
      };
      addMessage(msg);
      socket.emit("message:new", msg); // echo to sender
      // fromName is included only on the live socket payload (not persisted)
      // so the recipient's popup can show a sender name without a lookup.
      io.to(`player:${toId}`).emit("message:new", { ...msg, fromName: player.name });
    });

    socket.on("auction:join", ({ roomId, mode }: { roomId: string; mode: "public" | "anonymous" }) => {
      const result = auctionManager.joinRoom(player, roomId, mode);
      if (!result.joined) {
        socket.emit("auction:joinRejected", { roomId, reason: result.reason });
        return;
      }
      const room = auctionManager.getRoom(roomId)!;
      socket.join(room.id);
      io.to(room.id).emit("auction:state", room.getPublicState());
    });

    socket.on("auction:bid", ({ roomId, amount }: { roomId: string; amount: number }) => {
      const room = auctionManager.getRoom(roomId);
      if (!room) {
        socket.emit("auction:bidRejected", { roomId, reason: "Room not found or auction already ended." });
        return;
      }
      const result = auctionManager.placeBid(player, roomId, amount);
      if (!result.accepted) {
        socket.emit("auction:bidRejected", { roomId, reason: result.reason });
        return;
      }
      const participant = room.participants.get(player.id);
      io.to(room.id).emit("auction:bidPlaced", {
        roomId,
        amount,
        bidderDisplay: participant?.displayName ?? "Unknown",
      });
    });

    socket.on("auction:leave", ({ roomId }: { roomId: string }) => {
      socket.leave(roomId);
    });

    /** Admin-only: nudge a live room's current-phase countdown by deltaMs (+/-). */
    socket.on("auction:adminAdjustTime", ({ roomId, deltaMs }: { roomId: string; deltaMs: number }) => {
      if (!player.isAdmin) {
        socket.emit("auction:adminAdjustRejected", { roomId, reason: "Admin only." });
        return;
      }
      const result = auctionManager.adjustRoomTime(roomId, deltaMs);
      if (!result.adjusted) {
        socket.emit("auction:adminAdjustRejected", { roomId, reason: result.reason });
      }
    });

    socket.on(
      "dagger:use",
      ({ targetPlayerId, itemId }: { targetPlayerId: string; itemId: string }) => {
        const target = getPlayer(targetPlayerId);
        if (!target) {
          socket.emit("dagger:rejected", { reason: "Target not found." });
          return;
        }

        const attackerInventory = getInventory(player.id);
        const daggerItem = attackerInventory.find(
          (i) => i.id === itemId && i.itemType === "dagger"
        );
        if (!daggerItem) {
          socket.emit("dagger:rejected", { reason: "Dagger not found in your inventory." });
          return;
        }

        const sharedRoom = auctionManager.findSharedRoom(player.id, target.id);
        const attackerIsAnonymousInThisRoom = !!sharedRoom && sharedRoom.isAnonymous(player.id);

        const targetInventory = getInventory(target.id);
        const result = resolveDaggerAttack(player, target, daggerItem, targetInventory, {
          attackerIsAnonymousInThisRoom,
        });

        if (result.outcome === "rejected") {
          socket.emit("dagger:rejected", { reason: result.reason });
          return;
        }

        if (result.logEntry) addAttackLog(result.logEntry);

        // Confirmation back to the attacker (always visible to themselves).
        socket.emit("dagger:result", {
          outcome: result.outcome,
          amountStolen: result.amountStolen ?? 0,
        });

        // Notification to the victim — identity included only if the
        // logic decided it should be revealed (see resolveDaggerAttack).
        io.to(`player:${target.id}`).emit("player:notification", {
          type: result.outcome === "blocked" ? "dagger_blocked" : "dagger_hit",
          amountStolen: result.amountStolen ?? 0,
          attackerId: result.logEntry?.attackerId ?? null,
        });
      }
    );
  });
}
