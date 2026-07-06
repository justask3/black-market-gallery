import { canAfford, debit } from "../economy/gold.js";
import { getMinIncrement } from "./bidIncrement.js";
import { Player } from "../types.js";

export type AuctionPhase = "visible" | "flicker" | "ended";

const VISIBLE_PHASE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const FLICKER_MIN_MS = 15 * 1000; // 15 seconds
const FLICKER_MAX_MS = 120 * 1000; // 120 seconds

export interface Participant {
  playerId: string;
  displayName: string; // actual name, or "Anonymous" for display purposes
  isAnonymous: boolean;
}

export interface Bid {
  playerId: string;
  amount: number;
  timestamp: number;
}

/**
 * Owns a single live auction's state and timing.
 *
 * Design note: the exact moment Phase 2 (flicker) ends is decided ONCE,
 * server-side, the instant Phase 1 ends. That value is stored in memory
 * here and is NEVER sent to clients. Clients are only ever told the
 * current phase and, during "ended", the outcome — never a countdown
 * number for phase 2. This is what makes the random end time
 * unpredictable to players by construction, not just by convention.
 */
export class AuctionRoom {
  readonly id: string;
  phase: AuctionPhase = "visible";
  currentPrice: number;
  currentWinnerId: string | null = null;
  itemLabel: string;

  participants: Map<string, Participant> = new Map();
  bidHistory: Bid[] = [];

  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private visiblePhaseEndsAt: number | null = null;
  private onPhaseChange: (phase: AuctionPhase) => void;
  private onEnded: (winnerId: string | null, finalPrice: number) => void;

  constructor(opts: {
    id: string;
    itemLabel: string;
    startingPrice: number;
    onPhaseChange: (phase: AuctionPhase) => void;
    onEnded: (winnerId: string | null, finalPrice: number) => void;
  }) {
    this.id = opts.id;
    this.itemLabel = opts.itemLabel;
    this.currentPrice = opts.startingPrice;
    this.onPhaseChange = opts.onPhaseChange;
    this.onEnded = opts.onEnded;
  }

  /** Starts the visible phase timer. Call this once, when the room is created. */
  start(): void {
    this.phase = "visible";
    this.visiblePhaseEndsAt = Date.now() + VISIBLE_PHASE_DURATION_MS;
    this.phaseTimer = setTimeout(() => this.beginFlicker(), VISIBLE_PHASE_DURATION_MS);
  }

  private beginFlicker(): void {
    this.phase = "flicker";
    this.onPhaseChange("flicker");

    // The random duration is rolled here, once, and lives only in this
    // closure/timer — it is never exposed outside this class.
    const randomDurationMs =
      FLICKER_MIN_MS + Math.random() * (FLICKER_MAX_MS - FLICKER_MIN_MS);

    this.phaseTimer = setTimeout(() => this.end(), randomDurationMs);
  }

  private end(): void {
    this.phase = "ended";
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.onPhaseChange("ended");
    this.onEnded(this.currentWinnerId, this.currentPrice);
  }

  /**
   * Attempts to join the room. Caller (socket handler) is responsible for
   * having already charged the entry fee via the economy module before
   * calling this — this method only tracks room membership/display state.
   */
  addParticipant(player: Player, isAnonymous: boolean): void {
    this.participants.set(player.id, {
      playerId: player.id,
      displayName: isAnonymous ? "Anonymous" : player.name,
      isAnonymous,
    });
  }

  isAnonymous(playerId: string): boolean {
    return this.participants.get(playerId)?.isAnonymous ?? false;
  }

  /**
   * Validates and applies a bid. Returns a result object rather than
   * throwing, so the socket handler can send a clean rejection reason
   * back to the client.
   *
   * Bids are validated upfront (per confirmed design): a bid is rejected
   * immediately if it doesn't clear the current price, or if the bidder
   * could not afford it were they to win (gold - amount >= -1000).
   * No gold is deducted here — only the eventual winner pays, at end().
   */
  placeBid(player: Player, amount: number): { accepted: boolean; reason?: string } {
    if (this.phase === "ended") {
      return { accepted: false, reason: "Auction has already ended." };
    }
    const minAllowed = this.currentPrice + getMinIncrement(this.currentPrice);
    if (amount < minAllowed) {
      return { accepted: false, reason: `Bid must be at least ${minAllowed}g.` };
    }
    if (!canAfford(player, amount)) {
      return { accepted: false, reason: "Not enough gold." };
    }

    this.currentPrice = amount;
    this.currentWinnerId = player.id;
    this.bidHistory.push({ playerId: player.id, amount, timestamp: Date.now() });
    return { accepted: true };
  }

  /** Called by the winner-settlement step, after end(), to actually charge gold. */
  settleWinner(winner: Player): void {
    debit(winner, this.currentPrice);
  }

  /** Snapshot sent to clients on join/reconnect. Never includes flicker timing. */
  getPublicState() {
    return {
      id: this.id,
      itemLabel: this.itemLabel,
      phase: this.phase,
      currentPrice: this.currentPrice,
      // Only meaningful during "visible" phase; deliberately omitted/stale
      // once flicker begins, since the flicker end time must never be
      // knowable to clients.
      visiblePhaseEndsAt: this.phase === "visible" ? this.visiblePhaseEndsAt : null,
      participants: Array.from(this.participants.values()).map((p) => ({
        displayName: p.displayName,
      })),
    };
  }
}
