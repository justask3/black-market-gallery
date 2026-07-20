import { canAfford, debit } from "../economy/gold.js";
import { getMinIncrement } from "./bidIncrement.js";
import { Player, ItemType, ItemMetadata } from "../types.js";

export type AuctionPhase = "visible" | "flicker" | "ended";
export type JoinMode = "public" | "anonymous" | "phantom";

export interface Participant {
  playerId: string;
  displayName: string; // actual name, "Anonymous", or a Phantom Bidder persona
  isAnonymous: boolean; // true for both "anonymous" and "phantom" -- phantom is cosmetically distinct, functionally identical
}

export interface Bid {
  playerId: string;
  amount: number;
  timestamp: number;
}

const PHANTOM_ADJECTIVES = ["Shadowy", "Crimson", "Silent", "Masked", "Velvet", "Gilded", "Whispering", "Hollow"];
const PHANTOM_NOUNS = ["Fox", "Raven", "Merchant", "Collector", "Wanderer", "Broker", "Specter", "Magpie"];

function generatePhantomName(): string {
  const adjective = PHANTOM_ADJECTIVES[Math.floor(Math.random() * PHANTOM_ADJECTIVES.length)];
  const noun = PHANTOM_NOUNS[Math.floor(Math.random() * PHANTOM_NOUNS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `The ${adjective} ${noun} #${suffix}`;
}

/** How close to the visible-phase deadline an insured leading bidder must be outbid to qualify for a refund at settlement. */
const LATE_OUTBID_WINDOW_MS = 30 * 1000;

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
  /** What the winner actually receives on settlement -- see AuctionManager.settleAuctionEnd. */
  readonly itemType: ItemType;
  readonly itemMetadata: ItemMetadata;
  /** The player who relisted this item, if any -- null for server-owned filler rooms. Paid the winning bid on settlement. */
  readonly sellerId: string | null;

  participants: Map<string, Participant> = new Map();
  bidHistory: Bid[] = [];

  /** Broker's Monopoly: players barred from bidding further in this specific room. */
  readonly blockedPlayerIds: Set<string> = new Set();
  /** Whispering Coin: armed-by playerId, consumed the next time someone joins anonymously (or as a Phantom Bidder). */
  private pendingWhisper: string | null = null;
  /** Auction Insurance Token: who paid the premium, and who (among the insured) got outbid within LATE_OUTBID_WINDOW_MS of the deadline. AuctionManager reads both at settlement to apply refunds. */
  readonly insuredPlayerIds: Set<string> = new Set();
  readonly lateOutbidPlayerIds: Set<string> = new Set();

  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private visiblePhaseEndsAt: number | null = null;
  private flickerEndsAt: number | null = null; // internal only, never exposed via getPublicState
  private readonly visibleDurationMs: number;
  private readonly hasFlicker: boolean;
  private readonly flickerMinMs: number;
  private readonly flickerMaxMs: number;
  /** Anti-snipe: a bid landing with less than this much time left resets the countdown to exactly this much. 0 disables it. */
  private readonly antiSnipeMs: number;
  private onPhaseChange: (phase: AuctionPhase) => void;
  private onEnded: (winnerId: string | null, finalPrice: number) => void;

  constructor(opts: {
    id: string;
    itemLabel: string;
    itemType: ItemType;
    itemMetadata: ItemMetadata;
    sellerId: string | null;
    startingPrice: number;
    visibleDurationMs: number;
    hasFlicker: boolean;
    flickerMinMs: number;
    flickerMaxMs: number;
    antiSnipeMs: number;
    onPhaseChange: (phase: AuctionPhase) => void;
    onEnded: (winnerId: string | null, finalPrice: number) => void;
  }) {
    this.id = opts.id;
    this.itemLabel = opts.itemLabel;
    this.itemType = opts.itemType;
    this.itemMetadata = opts.itemMetadata;
    this.sellerId = opts.sellerId;
    this.currentPrice = opts.startingPrice;
    this.visibleDurationMs = opts.visibleDurationMs;
    this.hasFlicker = opts.hasFlicker;
    this.flickerMinMs = opts.flickerMinMs;
    this.flickerMaxMs = opts.flickerMaxMs;
    this.antiSnipeMs = opts.antiSnipeMs;
    this.onPhaseChange = opts.onPhaseChange;
    this.onEnded = opts.onEnded;
  }

  /** Starts the visible phase timer. Call this once, when the room is created. */
  start(): void {
    this.phase = "visible";
    this.visiblePhaseEndsAt = Date.now() + this.visibleDurationMs;
    this.phaseTimer = setTimeout(() => this.onVisiblePhaseExpired(), this.visibleDurationMs);
  }

  /** Either begins the flicker phase or ends the room directly, depending on hasFlicker. */
  private onVisiblePhaseExpired(): void {
    if (this.hasFlicker) {
      this.beginFlicker();
    } else {
      this.end();
    }
  }

  private beginFlicker(): void {
    this.phase = "flicker";
    this.onPhaseChange("flicker");

    // The random duration is rolled here, once, and lives only in this
    // closure/timer — it is never exposed outside this class.
    const randomDurationMs =
      this.flickerMinMs + Math.random() * (this.flickerMaxMs - this.flickerMinMs);

    this.flickerEndsAt = Date.now() + randomDurationMs;
    this.phaseTimer = setTimeout(() => this.end(), randomDurationMs);
  }

  /**
   * Admin-only: shifts the current phase's end time by deltaMs (positive
   * extends, negative shortens) and reschedules the underlying timer to
   * match. A large enough negative delta ends the phase almost immediately
   * rather than firing in the past. Works during either "visible" or
   * "flicker" -- the flicker end time still isn't exposed to clients via
   * getPublicState, so adjusting it doesn't compromise the "unpredictable
   * to players" invariant described above.
   */
  adjustTime(deltaMs: number): { adjusted: boolean; reason?: string } {
    if (this.phase === "ended") {
      return { adjusted: false, reason: "Auction has already ended." };
    }

    const MIN_DELAY_MS = 250;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);

    if (this.phase === "visible") {
      const newEndsAt = Math.max(Date.now() + MIN_DELAY_MS, (this.visiblePhaseEndsAt ?? Date.now()) + deltaMs);
      this.visiblePhaseEndsAt = newEndsAt;
      this.phaseTimer = setTimeout(() => this.onVisiblePhaseExpired(), newEndsAt - Date.now());
    } else {
      const newEndsAt = Math.max(Date.now() + MIN_DELAY_MS, (this.flickerEndsAt ?? Date.now()) + deltaMs);
      this.flickerEndsAt = newEndsAt;
      this.phaseTimer = setTimeout(() => this.end(), newEndsAt - Date.now());
    }

    return { adjusted: true };
  }

  private end(): void {
    this.phase = "ended";
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.onPhaseChange("ended");
    this.onEnded(this.currentWinnerId, this.currentPrice);
  }

  /**
   * Attempts to join the room. Caller (AuctionManager) is responsible for
   * having already charged the entry fee (and any Insurance premium) via
   * the economy module before calling this — this method only tracks room
   * membership/display state.
   *
   * Returns the Whispering Coin armer's playerId if this join (anonymous
   * or phantom) just consumed a pending whisper, so the caller can notify
   * them with this player's real identity -- AuctionRoom itself has no
   * access to the socket layer to do that notification directly.
   */
  addParticipant(player: Player, mode: JoinMode): { whisperRevealedTo: string | null } {
    const isAnonymous = mode !== "public";
    const displayName = mode === "public" ? player.name : mode === "phantom" ? generatePhantomName() : "Anonymous";

    this.participants.set(player.id, { playerId: player.id, displayName, isAnonymous });

    let whisperRevealedTo: string | null = null;
    if (isAnonymous && this.pendingWhisper && this.pendingWhisper !== player.id) {
      whisperRevealedTo = this.pendingWhisper;
      this.pendingWhisper = null;
    }
    return { whisperRevealedTo };
  }

  isAnonymous(playerId: string): boolean {
    return this.participants.get(playerId)?.isAnonymous ?? false;
  }

  /** Whispering Coin: arms this room so the next anonymous/phantom joiner gets revealed to armedByPlayerId. */
  armWhisperingCoin(armedByPlayerId: string): void {
    this.pendingWhisper = armedByPlayerId;
  }

  /** Broker's Monopoly: bars a current participant from placing any further bids in this room. */
  blockParticipant(targetPlayerId: string): { blocked: boolean; reason?: string } {
    if (!this.participants.has(targetPlayerId)) {
      return { blocked: false, reason: "That player is not currently in this room." };
    }
    this.blockedPlayerIds.add(targetPlayerId);
    return { blocked: true };
  }

  /** Auction Insurance Token: marks a participant as insured for this room (premium already charged by the caller). */
  markInsured(playerId: string): void {
    this.insuredPlayerIds.add(playerId);
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
   *
   * `reservedElsewhere` is the bidder's total leading-bid exposure in every
   * OTHER live room (tracked by AuctionManager, which is the only caller of
   * this method) -- folding it into the affordability check is what stops a
   * player from being the leading bidder in more than one room for more
   * gold than they actually have, since bids aren't escrowed individually.
   *
   * Anti-snipe (only when antiSnipeMs > 0, see tiers.ts): a bid landing with
   * less than antiSnipeMs left on the visible countdown resets it to exactly
   * antiSnipeMs, so a last-second bid always leaves time for a counter-bid.
   * This is Common Block's replacement for the unpredictable flicker phase
   * used by tiers with hasFlicker -- the returned `timerExtended` flag tells
   * the caller (AuctionManager) to broadcast the updated countdown.
   */
  placeBid(
    player: Player,
    amount: number,
    reservedElsewhere: number = 0
  ): { accepted: boolean; reason?: string; timerExtended?: boolean } {
    if (this.phase === "ended") {
      return { accepted: false, reason: "Auction has already ended." };
    }
    if (!this.participants.has(player.id)) {
      return { accepted: false, reason: "You must join this room before bidding." };
    }
    if (this.blockedPlayerIds.has(player.id)) {
      return { accepted: false, reason: "You've been blocked from bidding in this room." };
    }
    const minAllowed = this.currentPrice + getMinIncrement(this.currentPrice);
    if (amount < minAllowed) {
      return { accepted: false, reason: `Bid must be at least ${minAllowed}g.` };
    }
    if (!canAfford(player, amount + reservedElsewhere)) {
      return { accepted: false, reason: "Not enough gold." };
    }

    const previousWinnerId = this.currentWinnerId;
    this.currentPrice = amount;
    this.currentWinnerId = player.id;
    this.bidHistory.push({ playerId: player.id, amount, timestamp: Date.now() });

    // Auction Insurance Token: flag the just-outbid leading bidder for a
    // refund at settlement if they're insured and this happened within
    // the late window -- checked against the countdown as it stood before
    // any anti-snipe reset below.
    if (
      previousWinnerId &&
      previousWinnerId !== player.id &&
      this.insuredPlayerIds.has(previousWinnerId) &&
      this.phase === "visible" &&
      this.visiblePhaseEndsAt !== null &&
      this.visiblePhaseEndsAt - Date.now() < LATE_OUTBID_WINDOW_MS
    ) {
      this.lateOutbidPlayerIds.add(previousWinnerId);
    }

    let timerExtended = false;
    if (this.phase === "visible" && this.antiSnipeMs > 0 && this.visiblePhaseEndsAt !== null) {
      const remainingMs = this.visiblePhaseEndsAt - Date.now();
      if (remainingMs < this.antiSnipeMs) {
        if (this.phaseTimer) clearTimeout(this.phaseTimer);
        this.visiblePhaseEndsAt = Date.now() + this.antiSnipeMs;
        this.phaseTimer = setTimeout(() => this.onVisiblePhaseExpired(), this.antiSnipeMs);
        timerExtended = true;
      }
    }

    return { accepted: true, timerExtended };
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
      // playerId is only exposed for non-anonymous participants -- their
      // identity is already fully public via displayName, so this isn't a
      // new leak. Anonymous/phantom participants stay unidentifiable, which
      // also means Broker's Monopoly can only ever target a public bidder.
      participants: Array.from(this.participants.values()).map((p) => ({
        playerId: p.isAnonymous ? null : p.playerId,
        displayName: p.displayName,
      })),
    };
  }
}
