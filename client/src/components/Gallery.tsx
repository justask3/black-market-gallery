import { useState } from "react";
import { useSession } from "../SessionContext";
import { fetchGallery } from "../api";
import { InventoryItem } from "../types";

export default function Gallery() {
  const { player } = useSession();
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<{ playerName: string; paintings: InventoryItem[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const lookup = async (id: string) => {
    setError(null);
    try {
      const data = await fetchGallery(id);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Gallery not found.");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold">Gallery</h2>
      <p className="text-sm text-gray-500">
        Only a player's currently displayed Paintings are visible here — the rest of their
        inventory stays private.
      </p>

      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Player ID to view"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
        <button
          className="bg-gray-800 text-white rounded px-4"
          onClick={() => lookup(targetId.trim())}
        >
          View
        </button>
      </div>

      {player && (
        <button className="text-sm text-blue-600 underline" onClick={() => lookup(player.id)}>
          View my own gallery
        </button>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && (
        <div className="border rounded p-4 bg-white">
          <p className="font-semibold">{result.playerName}'s Gallery</p>
          {result.paintings.length === 0 ? (
            <p className="text-gray-400 text-sm mt-2">No Paintings currently on display.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {result.paintings.map((p) => (
                <li key={p.id}>A Masterpiece Painting, proudly displayed.</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
