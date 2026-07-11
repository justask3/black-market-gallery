import { useEffect, useState, useCallback } from "react";
import { useSession } from "../SessionContext";
import { fetchInventory, openChest, relistChest, displayPainting, undisplayPainting } from "../api";
import { InventoryItem, ItemType, DaggerMetadata, PaintingMetadata } from "../types";
import { ITEM_DISPLAY_NAMES, ITEM_BLOCK_COLORS } from "../itemNames";

const CHEST_ITEM_TYPES: ItemType[] = ["common_chest", "rare_chest", "exotic_chest"];

export default function Inventory() {
  const { player, setPlayer, socket } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [relistPriceById, setRelistPriceById] = useState<Record<string, string>>({});
  const [daggerTargetById, setDaggerTargetById] = useState<Record<string, string>>({});
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

  // Listen for Dagger outcomes / notifications so the inventory (charges,
  // gold) stays in sync without requiring a manual refresh, and so the
  // attacker actually sees what happened (or why it was rejected).
  useEffect(() => {
    if (!socket) return;
    const onDaggerResult = (r: { outcome: "success" | "blocked"; amountStolen: number }) => {
      setMessage(
        r.outcome === "success"
          ? `Dagger attack succeeded — you stole ${r.amountStolen}g!`
          : "Dagger attack was blocked by the target's Sigil."
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
    const meta = item.metadata as PaintingMetadata;
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

  const handleUseDagger = (item: InventoryItem) => {
    const targetPlayerId = daggerTargetById[item.id]?.trim();
    if (!targetPlayerId || !socket) {
      setMessage("Enter a target player ID first.");
      return;
    }
    socket.emit("dagger:use", { targetPlayerId, itemId: item.id });
    setMessage("Dagger used — check the result shortly.");
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
            className="bg-white rounded shadow-lg max-w-sm w-full p-5 space-y-3"
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
                <button
                  className="bg-gray-800 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleOpen(selectedItem)}
                >
                  Open
                </button>
              </div>
            )}

            {selectedItem.itemType === "painting" && (
              <div>
                <p className="text-sm text-gray-500">
                  Status:{" "}
                  {(selectedItem.metadata as PaintingMetadata).displayed
                    ? "Displayed (earning)"
                    : "Stored (not earning)"}
                </p>
                <button
                  className="mt-1 bg-gray-800 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleDisplayToggle(selectedItem)}
                >
                  {(selectedItem.metadata as PaintingMetadata).displayed ? "Undisplay" : "Display"}
                </button>
              </div>
            )}

            {selectedItem.itemType === "sigil" && (
              <p className="text-sm text-gray-500">
                Passive — deflects the next Dagger attempt against you.
              </p>
            )}

            {selectedItem.itemType === "bleeding_coin" && (
              <p className="text-sm text-red-700">
                Cursed — silently draining your gold every 10 minutes. Cannot be discarded or
                listed on a normal auction.
              </p>
            )}

            {selectedItem.itemType === "dagger" && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Charges remaining: {(selectedItem.metadata as DaggerMetadata).chargesRemaining}
                </p>
                {(selectedItem.metadata as DaggerMetadata).chargesRemaining > 0 && (
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
                      onClick={() => handleUseDagger(selectedItem)}
                    >
                      Use Dagger
                    </button>
                  </>
                )}
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
