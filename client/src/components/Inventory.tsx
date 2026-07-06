import { useEffect, useState, useCallback } from "react";
import { useSession } from "../SessionContext";
import {
  fetchInventory,
  openChest,
  relistChest,
  displayPainting,
  undisplayPainting,
  fetchAttackLog,
} from "../api";
import { InventoryItem, DaggerMetadata, PaintingMetadata, AttackLogEntry } from "../types";

export default function Inventory() {
  const { player, setPlayer, socket } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<AttackLogEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [relistPriceById, setRelistPriceById] = useState<Record<string, string>>({});
  const [daggerTargetById, setDaggerTargetById] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!player) return;
    const [inv, log] = await Promise.all([fetchInventory(player.id), fetchAttackLog(player.id)]);
    setItems(inv.inventory);
    setLogs(log.entries);
    setPlayer({ ...player, gold: inv.gold });
  }, [player?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for Dagger outcomes / notifications so the inventory (charges,
  // gold) stays in sync without requiring a manual refresh.
  useEffect(() => {
    if (!socket) return;
    const handler = () => refresh();
    socket.on("dagger:result", handler);
    socket.on("player:notification", handler);
    return () => {
      socket.off("dagger:result", handler);
      socket.off("player:notification", handler);
    };
  }, [socket, refresh]);

  if (!player) return null;

  const handleOpen = async (item: InventoryItem) => {
    setMessage(null);
    try {
      const result = await openChest(player.id, item.id);
      if (result.result === "gold") {
        setMessage(`The chest held ${result.amount}g!`);
      } else {
        setMessage(`The chest held a ${result.itemType}!`);
      }
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
      setMessage("Chest queued for auction — it'll go live soon in the Auction Room.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to relist chest.");
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

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border rounded p-4 bg-white">
            <p className="font-semibold capitalize">{item.itemType}</p>

            {item.itemType === "chest" && (
              <div className="mt-2 space-y-2">
                <button
                  className="bg-gray-800 text-white text-sm rounded px-3 py-1 mr-2"
                  onClick={() => handleOpen(item)}
                >
                  Open
                </button>
                <input
                  className="border rounded px-2 py-1 text-sm w-32"
                  placeholder="Start price"
                  value={relistPriceById[item.id] ?? ""}
                  onChange={(e) =>
                    setRelistPriceById((s) => ({ ...s, [item.id]: e.target.value }))
                  }
                />
                <button
                  className="bg-gray-600 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleRelist(item)}
                >
                  Relist to Auction
                </button>
              </div>
            )}

            {item.itemType === "painting" && (
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Status: {(item.metadata as PaintingMetadata).displayed ? "Displayed (earning)" : "Stored (not earning)"}
                </p>
                <button
                  className="mt-1 bg-gray-800 text-white text-sm rounded px-3 py-1"
                  onClick={() => handleDisplayToggle(item)}
                >
                  {(item.metadata as PaintingMetadata).displayed ? "Undisplay" : "Display"}
                </button>
              </div>
            )}

            {item.itemType === "sigil" && (
              <p className="text-sm text-gray-500 mt-2">
                Passive — deflects the next Dagger attempt against you.
              </p>
            )}

            {item.itemType === "bleeding_coin" && (
              <p className="text-sm text-red-700 mt-2">
                Cursed — silently draining your gold every 10 minutes. Cannot be discarded or
                listed on a normal auction.
              </p>
            )}

            {item.itemType === "dagger" && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-gray-500">
                  Charges remaining: {(item.metadata as DaggerMetadata).chargesRemaining}
                </p>
                {(item.metadata as DaggerMetadata).chargesRemaining > 0 && (
                  <>
                    <input
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="Target player ID"
                      value={daggerTargetById[item.id] ?? ""}
                      onChange={(e) =>
                        setDaggerTargetById((s) => ({ ...s, [item.id]: e.target.value }))
                      }
                    />
                    <button
                      className="bg-red-700 text-white text-sm rounded px-3 py-1"
                      onClick={() => handleUseDagger(item)}
                    >
                      Use Dagger
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold">Attack Log</h3>
        {logs.length === 0 && <p className="text-gray-400 text-sm">No attacks recorded.</p>}
        <ul className="text-sm space-y-1 mt-1">
          {logs.map((log) => (
            <li key={log.id} className="text-gray-600">
              {log.blocked
                ? `Blocked an attack from ${log.attackerId ?? "unknown"} (Sigil consumed).`
                : `Lost ${log.amountStolen}g to ${log.attackerId ?? "an unknown attacker"}.`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
