import { useEffect, useState, useCallback } from "react";
import { useSession } from "../SessionContext";
import {
  fetchInventory,
  openChest,
  relistChest,
  displayPainting,
  undisplayPainting,
  useChalkMarker,
  flipCoin,
  useStreetRumor,
  useGalleryDeed,
} from "../api";
import {
  InventoryItem,
  ItemType,
  WeaponMetadata,
  PaintingMetadata,
  EmptyFrameMetadata,
  WatchersTokenMetadata,
  ChestMetadata,
} from "../types";
import { ITEM_DISPLAY_NAMES, ITEM_BLOCK_COLORS } from "../itemNames";

const CHEST_ITEM_TYPES: ItemType[] = ["common_chest", "rare_chest", "exotic_chest"];
const WEAPON_ITEM_TYPES: ItemType[] = ["dagger", "dull_blade", "pickpockets_glove", "oathbreakers_dagger"];
const DISPLAYABLE_ITEM_TYPES: ItemType[] = ["painting", "empty_frame"];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function Inventory() {
  const { player, setPlayer, socket } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [relistPriceById, setRelistPriceById] = useState<Record<string, string>>({});
  const [daggerTargetById, setDaggerTargetById] = useState<Record<string, string>>({});
  const [chalkTargetById, setChalkTargetById] = useState<Record<string, string>>({});
  const [rumorChestById, setRumorChestById] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!player) return;
    const inv = await fetchInventory(player.id);
    setItems(inv.inventory);
    setPlayer({ ...player, gold: inv.gold });
  }, [player?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for Dagger-family outcomes / notifications so the inventory
  // (charges, gold) stays in sync without requiring a manual refresh, and
  // so the attacker actually sees what happened (or why it was rejected).
  useEffect(() => {
    if (!socket) return;
    const onDaggerResult = (r: { outcome: "success" | "blocked" | "backfired"; amountStolen: number }) => {
      setMessage(
        r.outcome === "success"
          ? `Attack succeeded — you stole ${r.amountStolen}g!`
          : r.outcome === "backfired"
          ? `It backfired! You lost ${r.amountStolen}g to your target instead.`
          : "Attack was blocked by the target's defense."
      );
      refresh();
    };
    const onDaggerRejected = ({ reason }: { reason: string }) => setMessage(reason);
    const onNotification = () => refresh();

    socket.on("dagger:result", onDaggerResult);
    socket.on("dagger:rejected", onDaggerRejected);
    socket.on("player:notification", onNotification);
    return () => {
      socket.off("dagger:result", onDaggerResult);
      socket.off("dagger:rejected", onDaggerRejected);
      socket.off("player:notification", onNotification);
    };
  }, [socket, refresh]);

  if (!player) return null;

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const handleOpen = async (item: InventoryItem) => {
    setMessage(null);
    try {
      const result = await openChest(player.id, item.id);
      if (result.result === "gold") {
        setMessage(`The chest held ${result.amount}g!`);
      } else {
        setMessage(`The chest held a ${result.itemType}!`);
      }
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to open chest.");
    }
  };

  const handleRelist = async (item: InventoryItem) => {
    const price = Number(relistPriceById[item.id]);
    if (!price || price <= 0) {
      setMessage("Enter a valid starting price first.");
      return;
    }
    try {
      await relistChest(player.id, item.id, price);
      setMessage("Item queued for auction — it'll go live soon in the Auction Room.");
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to relist item.");
    }
  };

  const handleDisplayToggle = async (item: InventoryItem) => {
    const meta = item.metadata as PaintingMetadata | EmptyFrameMetadata;
    try {
      if (meta.displayed) {
        await undisplayPainting(player.id, item.id);
      } else {
        await displayPainting(player.id, item.id);
      }
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update display.");
    }
  };

  const handleUseWeapon = (item: InventoryItem) => {
    const targetPlayerId = daggerTargetById[item.id]?.trim();
    if (!targetPlayerId || !socket) {
      setMessage("Enter a target player ID first.");
      return;
    }
    socket.emit("dagger:use", { targetPlayerId, itemId: item.id });
    setMessage("Attack used — check the result shortly.");
  };

  const handleChalkMark = async (item: InventoryItem) => {
    const targetItemId = chalkTargetById[item.id];
    if (!targetItemId) {
      setMessage("Pick an item to mark first.");
      return;
    }
    try {
      await useChalkMarker(player.id, item.id, targetItemId);
      setMessage("Item marked — its ownership history will now be tracked.");
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to mark item.");
    }
  };

  const handleFlipCoin = async (item: InventoryItem) => {
    try {
      const result = await flipCoin(player.id, item.id);
      setMessage(result.won ? `The coin favored you — +${result.amount}g!` : `The coin turned on you — -${result.amount}g.`);
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to flip the coin.");
    }
  };

  const handleStreetRumor = async (item: InventoryItem) => {
    const chestItemId = rumorChestById[item.id];
    if (!chestItemId) {
      setMessage("Pick a chest first.");
      return;
    }
    try {
      const result = await useStreetRumor(player.id, item.id, chestItemId);
      setMessage(`Word on the street: that chest holds something in the "${result.category}" category.`);
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to use Street Rumor.");
    }
  };

  const handleGalleryDeed = async (item: InventoryItem) => {
    try {
      await useGalleryDeed(player.id, item.id);
      setMessage("Your display cap is now 3.");
      setSelectedItemId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to use the Gallery Deed.");
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-6">
      <h2 className="text-xl font-bold">Inventory</h2>
      <p className="text-gray-600">
        Gold:{" "}
        <span className={player.gold < 0 ? "text-red-600 font-bold" : "font-bold"}>
          {player.gold}g
        </span>
      </p>
      {message && <p className="text-sm bg-yellow-100 border border-yellow-300 rounded p-2">{message}</p>}

      {items.length === 0 && <p className="text-gray-400">Empty. Win a Chest at auction to start.</p>}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItemId(item.id)}
            className={`rounded p-3 text-center text-xs font-semibold shadow hover:opacity-90 ${ITEM_BLOCK_COLORS[item.itemType]}`}
          >
            {ITEM_DISPLAY_NAMES[item.itemType]}
          </button>
        ))}
      </div>

      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedItemId(null)}
        >
          <div
            className="bg-white rounded shadow-lg max-w-sm w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <p className={`font-bold text-lg ${ITEM_BLOCK_COLORS[selectedItem.itemType]} inline-block px-2 py-1 rounded`}>
                {ITEM_DISPLAY_NAMES[selectedItem.itemType]}
              </p>
              <button className="text-gray-500 text-sm" onClick={() => setSelectedItemId(null)}>
                ✕
              </button>
            </div>

            {CHEST_ITEM_TYPES.includes(selectedItem.itemType) && (
              <div>
                {(selectedItem.metadata as ChestMetadata).pendingLoot && (
                  <p className="text-xs text-gray-500 mb-1">A Street Rumor has already revealed this chest's category.</p>
                )}
                <button
                  className="bg-gray-800 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleOpen(selectedItem)}
                >
                  Open
                </button>
              </div>
            )}

            {DISPLAYABLE_ITEM_TYPES.includes(selectedItem.itemType) && (
              <div>
                <p className="text-sm text-gray-500">
                  Status:{" "}
                  {(selectedItem.metadata as PaintingMetadata | EmptyFrameMetadata).displayed
                    ? selectedItem.itemType === "painting"
                      ? "Displayed (earning)"
                      : "Displayed (padding your gallery, earns nothing)"
                    : "Stored (not displayed)"}
                </p>
                <button
                  className="mt-1 bg-gray-800 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleDisplayToggle(selectedItem)}
                >
                  {(selectedItem.metadata as PaintingMetadata | EmptyFrameMetadata).displayed ? "Undisplay" : "Display"}
                </button>
              </div>
            )}

            {selectedItem.itemType === "sigil" && (
              <p className="text-sm text-gray-500">Passive — deflects the next attack against you and reveals the attacker.</p>
            )}
            {selectedItem.itemType === "bent_sigil" && (
              <p className="text-sm text-gray-500">Passive — deflects the next attack against you, but never reveals the attacker.</p>
            )}
            {selectedItem.itemType === "forged_seal" && (
              <p className="text-sm text-gray-500">
                Passive — a counterfeit ward. 70% chance to deflect the next attack against you like a real Sigil; 30% chance it silently fails.
              </p>
            )}
            {selectedItem.itemType === "vault_ledger_lock" && (
              <p className="text-sm text-gray-500">
                Passive — reduces any percent-based theft against you by 3 points. Costs 1% of your gold every 24h to maintain.
              </p>
            )}
            {selectedItem.itemType === "wardens_whistle" && (
              <p className="text-sm text-gray-500">Passive — always reveals an attacker's identity when they hit you, even if anonymous.</p>
            )}
            {selectedItem.itemType === "grudge_ledger" && (
              <p className="text-sm text-gray-500">
                Passive — when you attack someone who has stolen from you before, your steal chance gets a bonus against them.
              </p>
            )}
            {selectedItem.itemType === "weighted_dice" && (
              <p className="text-sm text-gray-500">Passive — improves the Twin-Faced Coin's odds in your favor while held.</p>
            )}
            {selectedItem.itemType === "tarnished_locket" && (
              <p className="text-sm text-gray-500">Passive income — 50g every 24 hours. No display slot needed.</p>
            )}
            {selectedItem.itemType === "auction_insurance_token" && (
              <p className="text-sm text-gray-500">Used when joining an auction publicly — look for the Insurance option in the Auction Room.</p>
            )}
            {selectedItem.itemType === "phantom_bidder" && (
              <p className="text-sm text-gray-500">Used when joining an auction — look for the Phantom option in the Auction Room.</p>
            )}
            {selectedItem.itemType === "whispering_coin" && (
              <p className="text-sm text-gray-500">Used from inside a live auction room — look for the option there while you're a participant.</p>
            )}
            {selectedItem.itemType === "brokers_monopoly" && (
              <p className="text-sm text-gray-500">Used from inside a live auction room — look for the option there while you're a participant.</p>
            )}

            {selectedItem.itemType === "watchers_token" && (
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Passive — logs who looks up your public profile.</p>
                {(selectedItem.metadata as WatchersTokenMetadata).visits.length === 0 ? (
                  <p className="text-xs text-gray-400">No visits logged yet.</p>
                ) : (
                  <ul className="text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {(selectedItem.metadata as WatchersTokenMetadata).visits
                      .slice()
                      .reverse()
                      .map((v, i) => (
                        <li key={i}>
                          {v.viewerName} — {formatTime(v.timestamp)}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {selectedItem.itemType === "twin_faced_coin" && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Flip for a fixed 200g stake — 50/50 to double it or lose it.</p>
                <button className="bg-yellow-600 text-white text-sm rounded px-3 py-1" onClick={() => handleFlipCoin(selectedItem)}>
                  Flip
                </button>
              </div>
            )}

            {selectedItem.itemType === "gallery_deed" && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Permanently raises your display cap from 2 to 3.</p>
                <button className="bg-fuchsia-700 text-white text-sm rounded px-3 py-1" onClick={() => handleGalleryDeed(selectedItem)}>
                  Use
                </button>
              </div>
            )}

            {selectedItem.itemType === "chalk_marker" && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Mark another item to start tracking its ownership history.</p>
                {items.filter((i) => i.id !== selectedItem.id).length === 0 ? (
                  <p className="text-xs text-gray-400">You have no other items to mark.</p>
                ) : (
                  <>
                    <select
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={chalkTargetById[selectedItem.id] ?? ""}
                      onChange={(e) => setChalkTargetById((s) => ({ ...s, [selectedItem.id]: e.target.value }))}
                    >
                      <option value="">Choose an item...</option>
                      {items
                        .filter((i) => i.id !== selectedItem.id)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {ITEM_DISPLAY_NAMES[i.itemType]}
                          </option>
                        ))}
                    </select>
                    <button
                      className="bg-stone-600 text-white text-sm rounded px-3 py-1"
                      onClick={() => handleChalkMark(selectedItem)}
                    >
                      Mark
                    </button>
                  </>
                )}
              </div>
            )}

            {selectedItem.itemType === "street_rumor" && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Pick an unopened chest to reveal its category ahead of time.</p>
                {items.filter((i) => CHEST_ITEM_TYPES.includes(i.itemType) && !(i.metadata as ChestMetadata).pendingLoot).length === 0 ? (
                  <p className="text-xs text-gray-400">You have no unrevealed chests.</p>
                ) : (
                  <>
                    <select
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={rumorChestById[selectedItem.id] ?? ""}
                      onChange={(e) => setRumorChestById((s) => ({ ...s, [selectedItem.id]: e.target.value }))}
                    >
                      <option value="">Choose a chest...</option>
                      {items
                        .filter((i) => CHEST_ITEM_TYPES.includes(i.itemType) && !(i.metadata as ChestMetadata).pendingLoot)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {ITEM_DISPLAY_NAMES[i.itemType]}
                          </option>
                        ))}
                    </select>
                    <button
                      className="bg-stone-600 text-white text-sm rounded px-3 py-1"
                      onClick={() => handleStreetRumor(selectedItem)}
                    >
                      Reveal Category
                    </button>
                  </>
                )}
              </div>
            )}

            {selectedItem.itemType === "bleeding_coin" && (
              <p className="text-sm text-red-700">
                Cursed — silently draining your gold every 10 minutes. Cannot be discarded or
                listed on a normal auction.
              </p>
            )}

            {WEAPON_ITEM_TYPES.includes(selectedItem.itemType) && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Charges remaining: {(selectedItem.metadata as WeaponMetadata).chargesRemaining}
                </p>
                {selectedItem.itemType === "oathbreakers_dagger" && (
                  <p className="text-xs text-amber-700">About 1 in 7 uses backfires and steals from you instead.</p>
                )}
                {(selectedItem.metadata as WeaponMetadata).chargesRemaining > 0 && (
                  <>
                    <input
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="Target player ID"
                      value={daggerTargetById[selectedItem.id] ?? ""}
                      onChange={(e) =>
                        setDaggerTargetById((s) => ({ ...s, [selectedItem.id]: e.target.value }))
                      }
                    />
                    <button
                      className="bg-red-700 text-white text-sm rounded px-3 py-1"
                      onClick={() => handleUseWeapon(selectedItem)}
                    >
                      Use
                    </button>
                  </>
                )}
              </div>
            )}

            {selectedItem.metadata.chalkMark && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-semibold text-gray-600">Ownership History</p>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  {selectedItem.metadata.chalkMark.history.map((h, i) => (
                    <li key={i}>
                      {h.ownerName} — {formatTime(h.acquiredAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedItem.itemType !== "bleeding_coin" && (
              <div className="flex gap-2 items-center pt-2 border-t">
                <input
                  className="border rounded px-2 py-1 text-sm w-32"
                  placeholder="Start price"
                  value={relistPriceById[selectedItem.id] ?? ""}
                  onChange={(e) =>
                    setRelistPriceById((s) => ({ ...s, [selectedItem.id]: e.target.value }))
                  }
                />
                <button
                  className="bg-gray-600 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleRelist(selectedItem)}
                >
                  Relist to Auction
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
