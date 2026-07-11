import { useEffect, useState } from "react";
import { useNotifications } from "../NotificationsContext";
import ChatPanel from "./ChatPanel";

function timeAgo(ms: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function Notifications() {
  const { notifications, markAllRead } = useNotifications();
  const [chatTarget, setChatTarget] = useState<{ id: string; name: string } | null>(null);

  // Opening this tab is what clears the unread badge.
  useEffect(() => {
    markAllRead();
  }, []);

  const sorted = [...notifications].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold">Notifications</h2>

      {sorted.length === 0 && <p className="text-gray-400">Nothing yet.</p>}

      <ul className="space-y-2">
        {sorted.map((n) =>
          n.kind === "attack" ? (
            <li key={n.id} className="border rounded p-3 text-sm text-gray-600">
              {n.blocked
                ? `Blocked an attack from ${n.attackerId ?? "unknown"} (Sigil consumed).`
                : `Lost ${n.amountStolen}g to ${n.attackerId ?? "an unknown attacker"}.`}
              <span className="text-gray-400 text-xs ml-2">{timeAgo(n.timestamp)}</span>
            </li>
          ) : (
            <li key={n.id} className="border rounded">
              <button
                className="text-left w-full p-3 text-sm hover:bg-gray-50"
                onClick={() => setChatTarget({ id: n.fromId, name: n.fromName })}
              >
                <p className="font-semibold">{n.fromName}</p>
                <p className="text-gray-600 truncate">{n.body}</p>
                <span className="text-gray-400 text-xs">{timeAgo(n.timestamp)}</span>
              </button>
            </li>
          )
        )}
      </ul>

      {chatTarget && (
        <ChatPanel targetId={chatTarget.id} targetName={chatTarget.name} onClose={() => setChatTarget(null)} />
      )}
    </div>
  );
}
