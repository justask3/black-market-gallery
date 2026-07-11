import { useEffect, useState } from "react";
import { useSession } from "../SessionContext";
import { fetchPlayerActivity, fetchInventory } from "../api";
import { PlayerActivityEntry, DaggerMetadata, DirectMessage } from "../types";
import ChatPanel from "./ChatPanel";
import Profile from "./Profile";

const REFRESH_POLL_MS = 60 * 1000;
const TOAST_DURATION_MS = 6000;

interface MessageToast {
  id: string;
  fromId: string;
  fromName: string;
  body: string;
}

function timeAgo(ms: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1m ago";
  return `${minutes}m ago`;
}

export default function PlayerActivity() {
  const { player, socket } = useSession();
  const [players, setPlayers] = useState<PlayerActivityEntry[]>([]);
  const [myDaggerItemId, setMyDaggerItemId] = useState<string | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [chatTarget, setChatTarget] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<MessageToast[]>([]);

  const refreshActivity = () => {
    fetchPlayerActivity()
      .then(({ players }) => setPlayers(players))
      .catch(() => {});
  };

  const refreshMyDagger = () => {
    if (!player) return;
    fetchInventory(player.id)
      .then(({ inventory }) => {
        const dagger = inventory.find(
          (i) => i.itemType === "dagger" && (i.metadata as DaggerMetadata).chargesRemaining > 0
        );
        setMyDaggerItemId(dagger?.id ?? null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshActivity();
    const id = setInterval(refreshActivity, REFRESH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    refreshMyDagger();
  }, [player?.id]);

  useEffect(() => {
    if (!socket) return;

    const onPresenceUpdate = (entry: PlayerActivityEntry) => {
      setPlayers((prev) => {
        const others = prev.filter((p) => p.id !== entry.id);
        return [...others, entry].sort(
          (a, b) => Number(b.isOnline) - Number(a.isOnline) || b.lastSeenAt - a.lastSeenAt
        );
      });
    };
    const onDaggerResult = () => refreshMyDagger();
    const onDaggerRejected = ({ reason }: { reason: string }) => setMessage(reason);
    const onNotification = () => refreshMyDagger();

    socket.on("presence:update", onPresenceUpdate);
    socket.on("dagger:result", onDaggerResult);
    socket.on("dagger:rejected", onDaggerRejected);
    socket.on("player:notification", onNotification);
    return () => {
      socket.off("presence:update", onPresenceUpdate);
      socket.off("dagger:result", onDaggerResult);
      socket.off("dagger:rejected", onDaggerRejected);
      socket.off("player:notification", onNotification);
    };
  }, [socket, player?.id]);

  // Pop up a toast for incoming messages, unless that chat is already open
  // (ChatPanel itself handles appending live messages while it's open).
  useEffect(() => {
    if (!socket || !player) return;

    const onMessageNew = (msg: DirectMessage & { fromName?: string }) => {
      if (msg.fromId === player.id) return; // our own echoed message, not incoming
      if (chatTarget?.id === msg.fromId) return; // already viewing this conversation

      const toastId = crypto.randomUUID();
      const toast: MessageToast = { id: toastId, fromId: msg.fromId, fromName: msg.fromName ?? "Someone", body: msg.body };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), TOAST_DURATION_MS);
    };

    socket.on("message:new", onMessageNew);
    return () => {
      socket.off("message:new", onMessageNew);
    };
  }, [socket, player?.id, chatTarget?.id]);

  if (!player) return null;

  const useDagger = (targetId: string) => {
    if (!socket || !myDaggerItemId) return;
    socket.emit("dagger:use", { targetPlayerId: targetId, itemId: myDaggerItemId });
    setMessage("Dagger used — check the result shortly.");
  };

  const openChatFromToast = (toast: MessageToast) => {
    setChatTarget({ id: toast.fromId, name: toast.fromName });
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const others = players.filter((p) => p.id !== player.id);

  return (
    <div className="w-full lg:w-72 flex-shrink-0 border rounded bg-white p-3 space-y-3 h-fit">
      <h3 className="font-semibold text-sm">Player Activity</h3>

      {message && <p className="text-xs bg-yellow-100 border border-yellow-300 rounded p-2">{message}</p>}

      {others.length === 0 && <p className="text-xs text-gray-400">No one else around right now.</p>}

      <ul className="space-y-2">
        {others.map((p) => (
          <li key={p.id} className="border rounded p-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                  p.isOnline ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <span className="text-sm font-medium truncate flex-1">{p.name}</span>
            </div>
            <p className="text-xs text-gray-500 ml-4">{p.isOnline ? "Online" : `Seen ${timeAgo(p.lastSeenAt)}`}</p>

            <div className="flex gap-1 mt-1 ml-4">
              <button
                className="text-xs bg-gray-200 rounded px-2 py-0.5"
                onClick={() => setViewingProfileId(p.id)}
              >
                Profile
              </button>
              <button
                className="text-xs bg-gray-200 rounded px-2 py-0.5"
                onClick={() => setChatTarget({ id: p.id, name: p.name })}
              >
                Message
              </button>
              {myDaggerItemId && (
                <button
                  className="text-xs bg-red-700 text-white rounded px-2 py-0.5"
                  onClick={() => useDagger(p.id)}
                >
                  Dagger
                </button>
              )}
            </div>

          </li>
        ))}
      </ul>

      {chatTarget && (
        <ChatPanel
          targetId={chatTarget.id}
          targetName={chatTarget.name}
          onClose={() => setChatTarget(null)}
        />
      )}

      {viewingProfileId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setViewingProfileId(null)}
        >
          <div
            className="bg-gray-50 rounded shadow-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button className="text-gray-500 text-sm" onClick={() => setViewingProfileId(null)}>
                ✕ Close
              </button>
            </div>
            <Profile viewPlayerId={viewingProfileId} />
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 space-y-2 z-50 w-64">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="bg-gray-800 text-white rounded shadow-lg p-3 cursor-pointer"
              onClick={() => openChatFromToast(t)}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-semibold text-sm truncate">{t.fromName}</span>
                <button
                  className="text-xs text-gray-300 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(t.id);
                  }}
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-200 truncate mt-0.5">{t.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
