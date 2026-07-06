import { useState } from "react";
import { useSession } from "./SessionContext";
import LoginScreen from "./components/LoginScreen";
import MainMenu from "./components/MainMenu";
import Inventory from "./components/Inventory";
import Gallery from "./components/Gallery";
import AuctionRoom from "./components/AuctionRoom";
import Catalog from "./components/Catalog";
import NPCWindow from "./components/NPCWindow";

type View = "menu" | "inventory" | "gallery" | "auction" | "catalog" | "npc";

export default function App() {
  const { player } = useSession();
  const [view, setView] = useState<View>("menu");

  if (!player) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <nav className="bg-gray-800 text-white p-3 flex justify-center gap-4 text-sm flex-wrap">
        <button onClick={() => setView("menu")}>Menu</button>
        <button onClick={() => setView("inventory")}>Inventory</button>
        <button onClick={() => setView("gallery")}>Gallery</button>
        <button onClick={() => setView("auction")}>Auction</button>
        <button onClick={() => setView("catalog")}>Catalog</button>
        <button onClick={() => setView("npc")}>NPC</button>
      </nav>

      {view === "menu" && <MainMenu onNavigate={setView} />}
      {view === "inventory" && <Inventory />}
      {view === "gallery" && <Gallery />}
      {view === "auction" && <AuctionRoom />}
      {view === "catalog" && <Catalog />}
      {view === "npc" && <NPCWindow />}
    </div>
  );
}
