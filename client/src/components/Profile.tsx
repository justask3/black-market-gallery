import { useSession } from "../SessionContext";

export default function Profile() {
  const { player } = useSession();
  if (!player) return null;

  return (
    <div className="max-w-md mx-auto mt-16 space-y-6 text-center">
      <h1 className="text-2xl font-bold">The Black Market Gallery</h1>
      <p className="text-gray-600">
        Welcome, {player.name}. Gold:{" "}
        <span className={player.gold < 0 ? "text-red-600 font-bold" : "font-bold"}>
          {player.gold}g
        </span>
      </p>
      <p className="text-xs text-gray-400 break-all">
        Your player ID (share with a friend to test): {player.id}
      </p>
    </div>
  );
}
