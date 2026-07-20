import { ItemType, ItemMetadata } from "../types.js";
import { WEAPON_CONFIGS } from "./weapon.js";

/** Fresh, ready-to-use metadata for a newly acquired item of the given type (chest drop, admin seed, etc.). */
export function freshMetadataFor(itemType: ItemType): ItemMetadata {
  if (itemType in WEAPON_CONFIGS) {
    return { chargesRemaining: WEAPON_CONFIGS[itemType].maxCharges };
  }
  switch (itemType) {
    case "painting":
      return { lastCollected: Date.now(), displayed: false };
    case "tarnished_locket":
      return { lastCollected: Date.now() };
    case "vault_ledger_lock":
      return { lastUpkeepAt: Date.now() };
    case "empty_frame":
      return { displayed: false };
    case "watchers_token":
      return { visits: [] };
    default:
      return {};
  }
}
