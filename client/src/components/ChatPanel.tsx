import { useEffect, useRef, useState } from "react";
import { useSession } from "../SessionContext";
import { fetchMessages } from "../api";
import { DirectMessage } from "../types";

export default function ChatPanel({
  targetId,
  targetName,
  onClose,
}: {
  targetId: string;
  targetName: string;
  onClose: () => void;
}) {
  const { player, socket } = useSession();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!player) return;
    fetchMessages(player.id, targetId)
      .then(({ messages }) => setMessages(messages))
      .catch(() => {});
  }, [player?.id, targetId]);

  useEffect(() => {
    if (!socket || !player) return;
    const onNew = (msg: DirectMessage) => {
      const isForThisConversation =
        (msg.fromId === player.id && msg.toId === targetId) ||
        (msg.fromId === targetId && msg.toId === player.id);
      if (!isForThisConversation) return;
      setMessages((prev) => [...prev, msg]);
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [socket, player?.id, targetId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body || !socket) return;
    socket.emit("message:send", { toId: targetId, body });
    setDraft("");
  };

  if (!player) return null;

  return (
    <div className="fixed bottom-4 right-4 w-72 h-96 bg-white border rounded shadow-lg flex flex-col z-50">
      <div className="flex justify-between items-center px-3 py-2 border-b bg-gray-800 text-white rounded-t">
        <span className="font-semibold text-sm truncate">{targetName}</span>
        <button className="text-white text-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">No messages yet — say hello.</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm max-w-[85%] rounded px-2 py-1 ${
              msg.fromId === player.id ? "bg-gray-800 text-white ml-auto" : "bg-gray-100 text-gray-800"
            }`}
          >
            {msg.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1 p-2 border-t">
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button className="bg-gray-800 text-white text-sm rounded px-3" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
