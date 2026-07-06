import { useEffect, useState } from "react";
import { useSession } from "../SessionContext";
import { fetchAuctionRooms } from "../api";
import { AuctionRoomSummary } from "../types";
import { getMinIncrement } from "../bidIncrement";

const ROOM_LIST_POLL_MS = 15 * 1000;

function useCountdown(targetMs: number | null | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!targetMs) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AuctionRoom() {
  const { player, socket } = useSession();
  const [rooms, setRooms] = useState<AuctionRoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [state, setState] = useState<AuctionRoomSummary | null>(null);
  const [joined, setJoined] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);

  const countdown = useCountdown(state?.visiblePhaseEndsAt ?? null);

  const refreshRooms = () => {
    fetchAuctionRooms()
      .then(({ rooms }) => setRooms(rooms))
      .catch(() => {});
  };

  // Poll the room list only while browsing it (no room selected) — there's
  // no dedicated "room list changed" socket broadcast in this design.
  useEffect(() => {
    if (selectedRoomId !== null) return;
    refreshRooms();
    const id = setInterval(refreshRooms, ROOM_LIST_POLL_MS);
    return () => clearInterval(id);
  }, [selectedRoomId]);

  useEffect(() => {
    if (!socket || selectedRoomId === null) return;

    const onState = (s: AuctionRoomSummary) => {
      if (s.id !== selectedRoomId) return;
      setState(s);
    };
    const onPhaseChanged = ({ roomId, phase }: { roomId: string; phase: string }) => {
      if (roomId !== selectedRoomId) return;
      setState((prev) => (prev ? { ...prev, phase: phase as any } : prev));
      if (phase === "flicker") setNotice("The flame flickers... the auction may end any moment.");
      if (phase === "ended") setNotice("The auction has ended.");
    };
    const onBidPlaced = ({
      roomId,
      amount,
      bidderDisplay,
    }: {
      roomId: string;
      amount: number;
      bidderDisplay: string;
    }) => {
      if (roomId !== selectedRoomId) return;
      setState((prev) => (prev ? { ...prev, currentPrice: amount } : prev));
      setNotice(`${bidderDisplay} bid ${amount}g.`);
    };
    const onEnded = ({
      roomId,
      winnerId,
      finalPrice,
    }: {
      roomId: string;
      winnerId: string | null;
      finalPrice: number;
    }) => {
      if (roomId !== selectedRoomId) return;
      setNotice(
        winnerId
          ? winnerId === player?.id
            ? `You won the auction for ${finalPrice}g! Check your Inventory.`
            : `Auction won by another player for ${finalPrice}g.`
          : "Auction ended with no bids."
      );
    };
    const onJoinRejected = ({ roomId, reason }: { roomId: string; reason: string }) => {
      if (roomId === selectedRoomId) setNotice(reason);
    };
    const onBidRejected = ({ roomId, reason }: { roomId: string; reason: string }) => {
      if (roomId === selectedRoomId) setNotice(reason);
    };
    const onNotification = (n: { type: string; amountStolen: number; attackerId: string | null }) => {
      const msg =
        n.type === "dagger_blocked"
          ? `Your Sigil deflected an attack from ${n.attackerId ?? "someone"}!`
          : `You were struck by a Dagger and lost ${n.amountStolen}g${
              n.attackerId ? ` to ${n.attackerId}` : " (attacker unknown)"
            }.`;
      setNotifications((list) => [msg, ...list]);
    };

    socket.on("auction:state", onState);
    socket.on("auction:phaseChanged", onPhaseChanged);
    socket.on("auction:bidPlaced", onBidPlaced);
    socket.on("auction:ended", onEnded);
    socket.on("auction:joinRejected", onJoinRejected);
    socket.on("auction:bidRejected", onBidRejected);
    socket.on("player:notification", onNotification);

    return () => {
      socket.off("auction:state", onState);
      socket.off("auction:phaseChanged", onPhaseChanged);
      socket.off("auction:bidPlaced", onBidPlaced);
      socket.off("auction:ended", onEnded);
      socket.off("auction:joinRejected", onJoinRejected);
      socket.off("auction:bidRejected", onBidRejected);
      socket.off("player:notification", onNotification);
    };
  }, [socket, player?.id, selectedRoomId]);

  const selectRoom = (room: AuctionRoomSummary) => {
    setState(room);
    setSelectedRoomId(room.id);
    setJoined(false);
    setNotice(null);
    setBidAmount("");
  };

  const backToList = () => {
    if (socket && selectedRoomId) socket.emit("auction:leave", { roomId: selectedRoomId });
    setSelectedRoomId(null);
    setState(null);
    setJoined(false);
    setNotice(null);
    refreshRooms();
  };

  const join = (mode: "public" | "anonymous") => {
    if (!socket || !selectedRoomId) return;
    socket.emit("auction:join", { roomId: selectedRoomId, mode });
    setJoined(true);
  };

  const placeBid = (amount: number) => {
    if (!amount || !socket || !selectedRoomId) return;
    socket.emit("auction:bid", { roomId: selectedRoomId, amount });
    setBidAmount("");
  };

  const placeCustomBid = () => {
    placeBid(Number(bidAmount));
  };

  if (selectedRoomId === null || !state) {
    return (
      <div className="max-w-lg mx-auto mt-10 space-y-4">
        <h2 className="text-xl font-bold">Live Auctions</h2>
        {rooms.length === 0 && (
          <p className="text-center text-gray-500">No active auctions right now. Check back soon.</p>
        )}
        <div className="space-y-3">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => selectRoom(room)}
              className="w-full text-left border rounded p-4 bg-white hover:bg-gray-50"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">{room.tierLabel}</span>
                <span className="text-sm text-gray-500 capitalize">{room.phase}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{room.itemLabel}</p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-lg font-bold">{room.currentPrice}g</span>
                <span className="text-sm text-gray-500">
                  {room.participants.length} participant{room.participants.length === 1 ? "" : "s"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const minIncrement = getMinIncrement(state.currentPrice ?? 0);
  const quickBidAmount = (state.currentPrice ?? 0) + minIncrement;

  return (
    <div className="max-w-md mx-auto mt-10 space-y-4">
      <button className="text-sm text-gray-500 hover:underline" onClick={backToList}>
        ← Back to live auctions
      </button>

      <h2 className="text-xl font-bold">{state.itemLabel}</h2>
      <p className="text-sm text-gray-500">
        {state.tierLabel} · <span className="capitalize">{state.phase}</span>
      </p>

      {state.phase === "visible" && countdown !== null && (
        <p className="text-lg font-mono">{formatMs(countdown)}</p>
      )}
      {state.phase === "flicker" && (
        <p className="text-lg italic text-orange-600">The flame is flickering...</p>
      )}

      <p className="text-2xl font-bold">{state.currentPrice}g</p>

      {!joined && state.phase !== "ended" && (
        <div className="space-x-2">
          <button className="bg-gray-800 text-white rounded px-4 py-2" onClick={() => join("public")}>
            Join ({state.entryFeePublic}g, public)
          </button>
          <button className="bg-gray-600 text-white rounded px-4 py-2" onClick={() => join("anonymous")}>
            Join Anonymously ({state.entryFeeAnonymous}g)
          </button>
        </div>
      )}

      {joined && state.phase !== "ended" && (
        <div className="space-y-2">
          <button
            className="bg-gray-800 text-white rounded px-4 py-2 w-full"
            onClick={() => placeBid(quickBidAmount)}
          >
            Bid {quickBidAmount}g (+{minIncrement})
          </button>

          <div className="flex gap-2">
            <input
              type="number"
              min={quickBidAmount}
              step={minIncrement}
              className="border rounded px-3 py-2 flex-1"
              placeholder={`Custom amount (min ${quickBidAmount}g)`}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
            <button className="bg-gray-600 text-white rounded px-4" onClick={placeCustomBid}>
              Bid Custom
            </button>
          </div>
        </div>
      )}

      {notice && <p className="text-sm bg-yellow-100 border border-yellow-300 rounded p-2">{notice}</p>}

      <div>
        <h3 className="font-semibold text-sm">Participants</h3>
        <ul className="text-sm text-gray-600">
          {state.participants?.map((p, i) => <li key={i}>{p.displayName}</li>)}
        </ul>
      </div>

      {notifications.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm">Notifications</h3>
          <ul className="text-sm text-red-600 space-y-1">
            {notifications.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
