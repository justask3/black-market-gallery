import { useEffect, useState } from "react";
import { useSession } from "../SessionContext";
import { fetchAuctionState } from "../api";
import { AuctionPublicState } from "../types";
import { getMinIncrement } from "../bidIncrement";

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
  const [state, setState] = useState<AuctionPublicState | null>(null);
  const [joined, setJoined] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);

  const countdown = useCountdown(state?.visiblePhaseEndsAt ?? null);

  useEffect(() => {
    fetchAuctionState().then(setState).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onState = (s: AuctionPublicState) => setState({ active: true, ...s });
    const onPhaseChanged = ({ phase }: { phase: string }) => {
      setState((prev) => (prev ? { ...prev, phase: phase as any } : prev));
      if (phase === "flicker") setNotice("The flame flickers... the auction may end any moment.");
      if (phase === "ended") setNotice("The auction has ended.");
    };
    const onBidPlaced = ({ amount, bidderDisplay }: { amount: number; bidderDisplay: string }) => {
      setState((prev) => (prev ? { ...prev, currentPrice: amount } : prev));
      setNotice(`${bidderDisplay} bid ${amount}g.`);
    };
    const onEnded = ({ winnerId, finalPrice }: { winnerId: string | null; finalPrice: number }) => {
      setNotice(
        winnerId
          ? winnerId === player?.id
            ? `You won the auction for ${finalPrice}g! Check your Inventory.`
            : `Auction won by another player for ${finalPrice}g.`
          : "Auction ended with no bids."
      );
    };
    const onJoinRejected = ({ reason }: { reason: string }) => setNotice(reason);
    const onBidRejected = ({ reason }: { reason: string }) => setNotice(reason);
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
  }, [socket, player?.id]);

  const join = (mode: "public" | "anonymous") => {
    if (!socket) return;
    socket.emit("auction:join", { mode });
    setJoined(true);
  };

  const placeBid = (amount: number) => {
    if (!amount || !socket) return;
    socket.emit("auction:bid", { amount });
    setBidAmount("");
  };

  const placeCustomBid = () => {
    placeBid(Number(bidAmount));
  };

  if (!state?.active) {
    return <p className="max-w-md mx-auto mt-10 text-center text-gray-500">No active auction right now.</p>;
  }

  const minIncrement = getMinIncrement(state.currentPrice ?? 0);
  const quickBidAmount = (state.currentPrice ?? 0) + minIncrement;

  return (
    <div className="max-w-md mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold">{state.itemLabel}</h2>
      <p className="text-sm text-gray-500 capitalize">Phase: {state.phase}</p>

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
            Join (500g, public)
          </button>
          <button className="bg-gray-600 text-white rounded px-4 py-2" onClick={() => join("anonymous")}>
            Join Anonymously (1500g)
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
