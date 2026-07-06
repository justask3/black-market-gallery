import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { Player } from "./types";

const SOCKET_URL = "http://localhost:3001";

interface SessionContextValue {
  player: Player | null;
  setPlayer: (p: Player | null) => void;
  socket: Socket | null;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<Player | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [, forceRender] = useState(0);

  const setPlayer = (p: Player | null) => {
    setPlayerState(p);

    // (Re)create the socket connection whenever the player identity changes.
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (p) {
      socketRef.current = io(SOCKET_URL, { auth: { playerId: p.id } });
      forceRender((n) => n + 1); // re-render so consumers see the new socket instance
    }
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ player, setPlayer, socket: socketRef.current }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider.");
  return ctx;
}
