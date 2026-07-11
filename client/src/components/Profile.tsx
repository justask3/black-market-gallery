import { useEffect, useState } from "react";
import { useSession } from "../SessionContext";
import { fetchProfile } from "../api";
import { PublicProfile } from "../types";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * Shows the caller's own profile by default. Pass viewPlayerId to show
 * someone else's instead -- their real gold is never fetched or shown,
 * only an estimate derived from their public (non-anonymous) auction
 * history, same data as the history table below it.
 */
export default function Profile({ viewPlayerId }: { viewPlayerId?: string }) {
  const { player } = useSession();
  const [data, setData] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetId = viewPlayerId ?? player?.id ?? null;
  const isSelf = !!player && targetId === player.id;

  useEffect(() => {
    if (!targetId || !player) return;
    setData(null);
    fetchProfile(targetId, player.id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile."));
  }, [targetId, player?.id]);

  if (!player) return null;
  if (!data) return <div className="max-w-3xl mx-auto mt-10 text-center text-gray-400">{error ?? "Loading..."}</div>;

  const displayedGold = isSelf ? player.gold : data.estimatedGold;
  const entered = data.history.length;
  const wins = data.history.filter((h) => h.won === true).length;
  const winRate = entered > 0 ? Math.round((wins / entered) * 100) : 0;
  const totalSpent = data.history.reduce(
    (sum, h) => sum + (h.entryFee ?? 0) + (h.won && h.finalPrice != null ? h.finalPrice : 0),
    0
  );

  return (
    <div className="max-w-3xl mx-auto mt-10 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-gray-800 text-white rounded p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
            {initials(data.playerName)}
          </div>
          <div>
            <p className="text-lg font-semibold">{data.playerName}</p>
            {!isSelf && <p className="text-xs text-gray-400 break-all">Player ID: {data.playerId}</p>}
          </div>
        </div>
        <div className="text-center sm:text-right">
          <p className={`text-2xl font-bold ${displayedGold < 0 ? "text-red-400" : "text-green-400"}`}>
            {displayedGold}g
          </p>
          <p className="text-xs text-gray-400">
            {isSelf ? "Your gold" : "Estimated gold (from public auction activity)"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Auctions Entered" value={entered} />
        <StatTile label="Auctions Won" value={wins} />
        <StatTile label="Win Rate" value={`${winRate}%`} />
        <StatTile label="Total Spent" value={`${totalSpent}g`} />
      </div>

      <div>
        <h3 className="font-semibold mb-2">Auction History</h3>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {data.history.length === 0 ? (
          <p className="text-gray-400 text-sm">No public auction activity yet.</p>
        ) : (
          <div className="overflow-x-auto border rounded bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-gray-500">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Auction</th>
                  <th className="p-2">Item</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.roomId} className="border-t">
                    <td className="p-2 text-gray-600 whitespace-nowrap">{formatDate(h.joinedAt)}</td>
                    <td className="p-2">{h.auctionType}</td>
                    <td className="p-2">{h.itemLabel ?? <span className="text-gray-400">Unknown</span>}</td>
                    <td className="p-2">
                      {h.won === null ? (
                        <span className="text-gray-400">Unknown</span>
                      ) : h.endedAt === null ? (
                        <span className="text-gray-400">In progress</span>
                      ) : h.won ? (
                        <span className="text-green-600 font-semibold">Won</span>
                      ) : (
                        <span className="text-gray-500">Entered only</span>
                      )}
                    </td>
                    <td className="p-2">
                      {h.won === null ? (
                        <span className="text-gray-400">Unknown</span>
                      ) : h.won && h.finalPrice != null ? (
                        `${h.finalPrice}g`
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-3 text-center bg-white">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
