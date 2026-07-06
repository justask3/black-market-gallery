import { Player, InventoryItem, DaggerMetadata, AttackLogEntry } from "../types.js";
import { scaleToFloor, debit, credit } from "../economy/gold.js";
import { findActiveSigil } from "./sigil.js";

const MIN_STEAL_PCT = 0.05;
const MAX_STEAL_PCT = 0.1;

export interface DaggerAttackContext {
  /**
   * True only when this Dagger use happens inside the same auction room
   * the attacker is currently in as an anonymous participant. Anonymity
   * has no effect on Dagger attacks made outside a room, or made while
   * entered publicly.
   */
  attackerIsAnonymousInThisRoom: boolean;
}

export interface DaggerAttackResult {
  outcome: "blocked" | "success" | "rejected";
  reason?: string; // populated when outcome === "rejected"
  amountStolen?: number;
  logEntry?: AttackLogEntry;
}

/**
 * Resolves a single Dagger use against a target.
 *
 * Rules encoded here (all previously agreed):
 * - Attacker cannot target themselves.
 * - Dagger has 2 charges; rejected once both are spent (item is not
 *   removed from inventory afterward — caller keeps it, inert).
 * - If the target holds an active Sigil: heist is deflected, the Sigil
 *   is consumed, and the attacker's identity is ALWAYS revealed to the
 *   victim — this overrides anonymity (confirmed design decision).
 * - If the target has no Sigil: heist succeeds, stealing a uniform
 *   random 5-10% of the target's gold, scaled down (never blocked) so
 *   the target never drops below the debt floor. Identity is revealed
 *   to the victim UNLESS the attacker is anonymous in that same room.
 *
 * This function mutates `attacker`, `target`, and `targetInventory` (for
 * Sigil removal) directly, and decrements the Dagger's own charge count.
 * It does not touch any network/socket layer — that's wired in Step 3.
 */
export function resolveDaggerAttack(
  attacker: Player,
  target: Player,
  daggerItem: InventoryItem,
  targetInventory: InventoryItem[],
  context: DaggerAttackContext
): DaggerAttackResult {
  if (attacker.id === target.id) {
    return { outcome: "rejected", reason: "Cannot target yourself." };
  }

  const meta = daggerItem.metadata as DaggerMetadata;
  if (!meta || meta.chargesRemaining <= 0) {
    return { outcome: "rejected", reason: "This Dagger has no charges remaining." };
  }

  // Consume a charge regardless of outcome (blocked attempts still cost a charge).
  meta.chargesRemaining -= 1;

  const sigil = findActiveSigil(targetInventory, target.id);

  if (sigil) {
    // Deflected. Sigil is single-use: remove it from the target's inventory.
    const sigilIndex = targetInventory.indexOf(sigil);
    targetInventory.splice(sigilIndex, 1);

    const logEntry: AttackLogEntry = {
      id: crypto.randomUUID(),
      victimId: target.id,
      attackerId: attacker.id, // always revealed on a Sigil block, per confirmed design
      amountStolen: 0,
      blocked: true,
      timestamp: Date.now(),
    };

    return { outcome: "blocked", logEntry };
  }

  // No Sigil: heist succeeds.
  const pct = MIN_STEAL_PCT + Math.random() * (MAX_STEAL_PCT - MIN_STEAL_PCT);
  const rawAmount = Math.floor(target.gold * pct);
  const actualAmount = scaleToFloor(target, rawAmount);

  debit(target, actualAmount);
  credit(attacker, actualAmount);

  const identityRevealed = !context.attackerIsAnonymousInThisRoom;

  const logEntry: AttackLogEntry = {
    id: crypto.randomUUID(),
    victimId: target.id,
    attackerId: identityRevealed ? attacker.id : null,
    amountStolen: actualAmount,
    blocked: false,
    timestamp: Date.now(),
  };

  return { outcome: "success", amountStolen: actualAmount, logEntry };
}
