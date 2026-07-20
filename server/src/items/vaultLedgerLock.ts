import { Player, InventoryItem, VaultLedgerLockMetadata } from "../types.js";
import { scaleToFloor, debit } from "../economy/gold.js";

const UPKEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const UPKEEP_RATE = 0.01; // 1% of current gold per period

/**
 * Lazily evaluates a single Vault Ledger Lock's upkeep cost, same
 * lazy-on-visit pattern as Painting/Bleeding Coin. This is the price of
 * the steal-percentage reduction it grants while held (see
 * items/weapon.ts) -- unlike Bleeding Coin, the owner is meant to want
 * this, so the rate is much smaller.
 */
export function collectVaultLedgerLockUpkeep(item: InventoryItem, owner: Player): number {
  const meta = item.metadata as VaultLedgerLockMetadata;
  const now = Date.now();
  const elapsed = now - meta.lastUpkeepAt;

  const fullPeriods = Math.floor(elapsed / UPKEEP_INTERVAL_MS);
  if (fullPeriods <= 0) return 0;

  let totalPaid = 0;
  for (let i = 0; i < fullPeriods; i++) {
    const rawAmount = Math.round(owner.gold * UPKEEP_RATE);
    const actualAmount = scaleToFloor(owner, rawAmount);
    debit(owner, actualAmount);
    totalPaid += actualAmount;
  }

  meta.lastUpkeepAt += fullPeriods * UPKEEP_INTERVAL_MS;
  return totalPaid;
}
