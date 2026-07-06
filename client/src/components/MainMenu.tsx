import { useSession } from "../SessionContext";

type View = "menu" | "inventory" | "gallery" | "auction";

export default function MainMenu({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { player } = useSession();

  return (
    <div className="max-w-md mx-auto mt-16 space-y-6 text-center">
      <h1 className="text-2xl font-bold">The Black Market Gallery</h1>
      <p className="text-gray-600">
        Welcome, {player?.name}. Gold:{" "}
        <span className={player && player.gold < 0 ? "text-red-600 font-bold" : "font-bold"}>
          {player?.gold}g
        </span>
      </p>
      <div className="space-y-3">
        <button
          className="w-full bg-gray-800 text-white rounded py-3"
          onClick={() => onNavigate("inventory")}
        >
          Inventory
        </button>
        <button
          className="w-full bg-gray-800 text-white rounded py-3"
          onClick={() => onNavigate("gallery")}
        >
          Gallery
        </button>
        <button
          className="w-full bg-gray-800 text-white rounded py-3"
          onClick={() => onNavigate("auction")}
        >
          Enter Auction
        </button>
      </div>
      <p className="text-xs text-gray-400 break-all">
        Your player ID (share with a friend to test): {player?.id}
      </p>
    </div>
  );
}
