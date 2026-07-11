import { useEffect, useState } from "react";
import { fetchPublicGallery } from "../api";

const REFRESH_POLL_MS = 60 * 1000;

interface GalleryEntry {
  playerId: string;
  playerName: string;
  paintings: unknown[];
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

  return (
    <div className="max-w-md mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold">Gallery</h2>
      <p className="text-sm text-gray-500">
        A public space — every player's currently displayed Masterpiece Paintings. The rest of
        everyone's inventory stays private.
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {galleries.length === 0 ? (
        <p className="text-gray-400 text-sm">No one has anything on display right now.</p>
      ) : (
        <ul className="space-y-2">
          {galleries.map((g) => (
            <li key={g.playerId} className="border rounded p-4 bg-white">
              <p className="font-semibold">{g.playerName}'s Gallery</p>
              <p className="text-sm text-gray-600 mt-1">
                {g.paintings.length} Masterpiece Painting{g.paintings.length === 1 ? "" : "s"} on display.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
