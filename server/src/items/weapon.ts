import { Player, InventoryItem, WeaponMetadata, AttackLogEntry } from "../types.js";
import { scaleToFloor, debit, credit } from "../economy/gold.js";
import { getAttackLogsFor } from "../db/store.js";
import { findActiveSigil, findItemByType, hasItemType } from "./sigil.js";

export interface WeaponConfig {
  maxCharges: number;
  stealMode: "percent" | "flat";
  minSteal: number; // fraction (0-1) for percent mode, gold amount for flat mode
  maxSteal: number;
  backfireChance: number; // 0 disables backfire entirely
}

/** Every weapon-family item and how it behaves -- adding a new one is just a new entry here. */
export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  dagger: { maxCharges: 2, stealMode: "percent", minSteal: 0.05, maxSteal: 0.1, backfireChance: 0 },
  dull_blade: { maxCharges: 1, stealMode: "percent", minSteal: 0.02, maxSteal: 0.04, backfireChance: 0 },
  pickpockets_glove: { maxCharges: 1, stealMode: "flat", minSteal: 40, maxSteal: 60, backfireChance: 0 },
  oathbreakers_dagger: { maxCharges: 4, stealMode: "percent", minSteal: 0.06, maxSteal: 0.12, backfireChance: 0.15 },
};

export function isWeaponItemType(itemType: string): boolean {
  return itemType in WEAPON_CONFIGS;
}

const FORGED_SEAL_FAIL_CHANCE = 0.3;
const VAULT_LEDGER_LOCK_REDUCTION_PCT = 0.03;
const MIN_STEAL_PCT_FLOOR = 0.01;
const GRUDGE_LEDGER_BONUS_PCT = 0.05;

export interface WeaponAttackContext {
  /**
   * True only when this attack happens inside the same auction room the
   * attacker is currently in as an anonymous (or Phantom Bidder) participant.
   * Anonymity has no effect on attacks made outside a room, or made while
   * entered publicly.
   */
  attackerIsAnonymousInThisRoom: boolean;
}

export interface WeaponAttackResult {
  outcome: "blocked" | "success" | "backfired" | "rejected";
  reason?: string;
  amountStolen?: number;
  logEntry?: AttackLogEntry;
}

function removeFromInventory(inventory: InventoryItem[], item: InventoryItem): void {
  const idx = inventory.indexOf(item);
  if (idx !== -1) inventory.splice(idx, 1);
}

/**
 * Resolves a single weapon-family item's use against a target. Config-driven
 * (see WEAPON_CONFIGS) so Dagger, Dull Blade, Pickpocket's Glove, and
 * Oathbreaker's Dagger all share one implementation.
 *
 * Rules:
 * - Attacker cannot target themselves.
 * - Weapon has config.maxCharges charges; rejected once spent (item stays
 *   in inventory afterward, inert).
 * - Defense priority, exactly one consulted per attack: full Sigil (always
 *   blocks, always reveals attacker, consumed) > Forged Seal (consumed;
 *   FORGED_SEAL_FAIL_CHANCE chance it fails silently -- attack proceeds as
 *   if nothing were held) > Bent Sigil (consumed; blocks but never reveals
 *   attacker identity).
 * - No block: Oathbreaker's-style backfire is rolled first (steals from the
 *   attacker instead, revealing both sides unconditionally); otherwise the
 *   normal steal resolves, with Vault Ledger Lock reducing and Grudge
 *   Ledger boosting the attacker's percent-mode steal, and Warden's Whistle
 *   forcing an identity reveal on the victim's side regardless of anonymity.
 */
export function resolveWeaponAttack(
  attacker: Player,
  target: Player,
  weaponItem: InventoryItem,
  targetInventory: InventoryItem[],
  attackerInventory: InventoryItem[],
  context: WeaponAttackContext
): WeaponAttackResult {
  if (attacker.id === target.id) {
    return { outcome: "rejected", reason: "Cannot target yourself." };
  }

  const config = WEAPON_CONFIGS[weaponItem.itemType];
  if (!config) {
    return { outcome: "rejected", reason: "This item cannot be used as a weapon." };
  }

  const meta = weaponItem.metadata as WeaponMetadata;
  if (!meta || meta.chargesRemaining <= 0) {
    return { outcome: "rejected", reason: "This weapon has no charges remaining." };
  }
  meta.chargesRemaining -= 1;

  let block: { reveal: boolean } | null = null;
  const sigil = findActiveSigil(targetInventory, target.id);
  if (sigil) {
    removeFromInventory(targetInventory, sigil);
    block = { reveal: true };
  } else {
    const forgedSeal = findItemByType(targetInventory, target.id, "forged_seal");
    if (forgedSeal) {
      removeFromInventory(targetInventory, forgedSeal);
      block = Math.random() < FORGED_SEAL_FAIL_CHANCE ? null : { reveal: true };
    } else {
      const bentSigil = findItemByType(targetInventory, target.id, "bent_sigil");
      if (bentSigil) {
        removeFromInventory(targetInventory, bentSigil);
        block = { reveal: false };
      }
    }
  }

  if (block) {
    const logEntry: AttackLogEntry = {
      id: crypto.randomUUID(),
      victimId: target.id,
      attackerId: block.reveal ? attacker.id : null,
      amountStolen: 0,
      blocked: true,
      timestamp: Date.now(),
    };
    return { outcome: "blocked", logEntry };
  }

  if (config.backfireChance > 0 && Math.random() < config.backfireChance) {
    const pct = config.minSteal + Math.random() * (config.maxSteal - config.minSteal);
    const rawAmount = Math.floor(attacker.gold * pct);
    const actualAmount = scaleToFloor(attacker, rawAmount);
    debit(attacker, actualAmount);
    credit(target, actualAmount);

    const logEntry: AttackLogEntry = {
      id: crypto.randomUUID(),
      victimId: attacker.id,
      attackerId: target.id,
      amountStolen: actualAmount,
      blocked: false,
      timestamp: Date.now(),
    };
    return { outcome: "backfired", amountStolen: actualAmount, logEntry };
  }

  let rawAmount: number;
  if (config.stealMode === "percent") {
    let pct = config.minSteal + Math.random() * (config.maxSteal - config.minSteal);
    if (hasItemType(targetInventory, target.id, "vault_ledger_lock")) {
      pct = Math.max(MIN_STEAL_PCT_FLOOR, pct - VAULT_LEDGER_LOCK_REDUCTION_PCT);
    }
    if (
      hasItemType(attackerInventory, attacker.id, "grudge_ledger") &&
      getAttackLogsFor(attacker.id).some((log) => log.attackerId === target.id && !log.blocked)
    ) {
      pct += GRUDGE_LEDGER_BONUS_PCT;
    }
    rawAmount = Math.floor(target.gold * pct);
  } else {
    rawAmount = Math.floor(config.minSteal + Math.random() * (config.maxSteal - config.minSteal));
  }

  const actualAmount = scaleToFloor(target, rawAmount);
  debit(target, actualAmount);
  credit(attacker, actualAmount);

  const identityRevealed =
    !context.attackerIsAnonymousInThisRoom || hasItemType(targetInventory, target.id, "wardens_whistle");

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
