import { useState } from "react";
import { useSession } from "./SessionContext";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
import LoginScreen from "./components/LoginScreen";
import Profile from "./components/Profile";
import Inventory from "./components/Inventory";
import Gallery from "./components/Gallery";
import AuctionRoom from "./components/AuctionRoom";
import Catalog from "./components/Catalog";
import NPCWindow from "./components/NPCWindow";
import PlayerActivity from "./components/PlayerActivity";
import Notifications from "./components/Notifications";

type View = "profile" | "inventory" | "gallery" | "auction" | "catalog" | "npc" | "notifications";

export default function App() {
  const { player } = useSession();
  if (!player) return <LoginScreen />;

  return (
    <NotificationsProvider>
      <AppShell />
    </NotificationsProvider>
  );
}

function AppShell() {
  const [view, setView] = useState<View>("profile");
  const { unreadCount } = useNotifications();

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <nav className="bg-gray-800 text-white p-3 flex justify-center gap-4 text-sm flex-wrap">
        <button onClick={() => setView("profile")}>Profile</button>
        <button onClick={() => setView("inventory")}>Inventory</button>
        <button onClick={() => setView("gallery")}>Gallery</button>
        <button onClick={() => setView("auction")}>Auction</button>
        <button onClick={() => setView("catalog")}>Catalog</button>
        <button onClick={() => setView("npc")}>NPC</button>
        <button onClick={() => setView("notifications")} className="relative">
          Notifications
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-3 bg-red-600 text-white rounded-full text-[10px] leading-none px-1.5 py-0.5 min-w-[16px] text-center">
              {unreadCount}
            </span>
          )}
        </button>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4 p-4 items-start">
        <div className="flex-1 min-w-0">
          {view === "profile" && <Profile />}
          {view === "inventory" && <Inventory />}
          {view === "gallery" && <Gallery />}
          {view === "auction" && <AuctionRoom />}
          {view === "catalog" && <Catalog />}
          {view === "npc" && <NPCWindow />}
          {view === "notifications" && <Notifications />}
        </div>

        <PlayerActivity />
      </div>
    </div>
  );
}
