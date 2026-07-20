import { useEffect, useState } from "react";
import { fetchPublicGallery } from "../api";
import { InventoryItem } from "../types";
import { ITEM_BLOCK_COLORS, ITEM_DISPLAY_NAMES } from "../itemNames";

const REFRESH_POLL_MS = 60 * 1000;

interface GalleryEntry {
  playerId: string;
  playerName: string;
  paintings: InventoryItem[];
}

export default function Gallery() {
  const [galleries, setGalleries] = useState<GalleryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    fetchPublicGallery()
      .then((data) => {
        setGalleries(data.galleries);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the gallery."));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Flattened into one wall rather than a section per player -- each player
  // can display at most 2, so per-player sections would mostly just be
  // single tiles stacked vertically for no reason.
  const tiles = galleries.flatMap((g) =>
    g.paintings.map((painting) => ({ painting, playerName: g.playerName }))
  );

  return (
    <div className="max-w-3xl mx-auto mt-10 space-y-6 text-center">
      <h2 className="text-xl font-bold">Gallery</h2>
      <p className="text-sm text-gray-500">
        A public space — every player's currently displayed Masterpiece Paintings (up to 2 each).
        The rest of everyone's inventory stays private.
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {tiles.length === 0 ? (
        <p className="text-gray-400 text-sm">No one has anything on display right now.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {/*
            Placeholder swatch in the item's own block color until real
            artwork exists. Rendered off each tile's actual itemType rather
            than assuming "painting" -- an Empty Frame occupies a display
            slot the same way and deliberately renders with its own label
            here rather than being disguised as a real Painting, since the
            bluff is about padding the gallery's apparent size, not fooling
            a close look.
          */}
          {tiles.map(({ painting, playerName }) => (
            <div key={painting.id} className="space-y-1">
              <div
                className={`w-24 h-24 flex items-center justify-center rounded p-3 text-center text-xs font-semibold shadow ${ITEM_BLOCK_COLORS[painting.itemType]}`}
              >
                {ITEM_DISPLAY_NAMES[painting.itemType]}
              </div>
              <p className="text-xs text-gray-500 truncate">{playerName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
