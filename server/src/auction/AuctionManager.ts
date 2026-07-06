import { Server as SocketIOServer } from "socket.io";
import { AuctionRoom } from "./AuctionRoom.js";
import { Player, InventoryItem } from "../types.js";
import { canAfford, debit } from "../economy/gold.js";
import { addItem, getPlayer } from "../db/store.js";

const PUBLIC_ENTRY_FEE = 500;
const ANONYMOUS_ENTRY_FEE = 1500;
const STARTING_PRICE = 100;

export type EntryMode = "public" | "anonymous";

/**
 * Holds the single live auction room for this stage (per the confirmed
 * "1 auction room" scope). Responsible for entry-fee charging, and for
 * bridging AuctionRoom's plain callbacks to real Socket.io broadcasts.
 */
export class AuctionManager {
  private io: SocketIOServer;
  private room: AuctionRoom | null = null;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  getRoom(): AuctionRoom | null {
    return this.room;
  }

  /**
   * Starts a new Chest auction. Only allowed when no room is currently
   * active. Any player can trigger this via a REST call for now — there's
   * no "host" concept yet. This is a small implementation default (not a
   * game-design rule you specified) and easy to change later, e.g. to
   * auto-restart after each auction ends, or restrict who can start one.
   */
  startNewChestAuction(startingPrice: number = STARTING_PRICE): { started: boolean; reason?: string } {
    if (this.room && this.room.phase !== "ended") {
      return { started: false, reason: "An auction is already in progress." };
    }

    const roomId = crypto.randomUUID();
    this.room = new AuctionRoom({
      id: roomId,
      itemLabel: "Mysterious Chest",
      startingPrice,
      onPhaseChange: (phase) => {
        this.io.to(roomId).emit("auction:phaseChanged", { phase });
      },
      onEnded: (winnerId, finalPrice) => {
        this.settleAuctionEnd(roomId, winnerId, finalPrice);
      },
    });
    this.room.start();
    return { started: true };
  }

  /**
   * Charges the entry fee and adds the player to the room. Returns a
   * result rather than throwing, so the socket handler can relay a clean
   * rejection reason to the client.
   */
  joinRoom(player: Player, mode: EntryMode): { joined: boolean; reason?: string } {
    if (!this.room || this.room.phase === "ended") {
      return { joined: false, reason: "No active auction to join." };
    }
    const fee = mode === "anonymous" ? ANONYMOUS_ENTRY_FEE : PUBLIC_ENTRY_FEE;
    if (!canAfford(player, fee)) {
      return { joined: false, reason: "Not enough gold to cover the entry fee." };
    }
    debit(player, fee);
    this.room.addParticipant(player, mode === "anonymous");
    return { joined: true };
  }

  /**
   * Called once when a room's timer fires "ended". Charges the winner
   * the final price, and drops an unopened Chest into their inventory.
   * If there was no winner (nobody bid), nothing is charged and no item
   * is created.
   */
  private settleAuctionEnd(roomId: string, winnerId: string | null, finalPrice: number): void {
    if (winnerId && this.room) {
      const winner = getPlayer(winnerId);
      if (winner) {
        this.room.settleWinner(winner); // single source of truth for charging the winner
        const chest: InventoryItem = {
          id: crypto.randomUUID(),
          ownerId: winner.id,
          itemType: "chest",
          metadata: {},
          createdAt: Date.now(),
        };
        addItem(chest);
      }
    }

    this.io.to(roomId).emit("auction:ended", { winnerId, finalPrice });
  }
}
