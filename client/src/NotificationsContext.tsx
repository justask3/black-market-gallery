import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "./SessionContext";
import { fetchAttackLog } from "./api";
import { DirectMessage } from "./types";

export interface AttackNotification {
  id: string;
  kind: "attack";
  blocked: boolean;
  attackerId: string | null;
  amountStolen: number;
  timestamp: number;
  read: boolean;
}

export interface MessageNotification {
  id: string;
  kind: "message";
  fromId: string;
  fromName: string;
  body: string;
  timestamp: number;
  read: boolean;
}

export type NotificationEntry = AttackNotification | MessageNotification;

interface NotificationsContextValue {
  notifications: NotificationEntry[];
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Seeds the notification list with the player's historical attack log once
 * on login, then appends live entries as they arrive over the socket
 * (dagger hits/blocks via player:notification, direct messages via
 * message:new) -- there's no polling after the initial fetch.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { player, socket } = useSession();
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  useEffect(() => {
    if (!player) {
      setNotifications([]);
      return;
    }
    fetchAttackLog(player.id)
      .then(({ entries }) => {
        setNotifications(
          entries.map((log) => ({
            id: log.id,
            kind: "attack" as const,
            blocked: log.blocked,
            attackerId: log.attackerId,
            amountStolen: log.amountStolen,
            timestamp: log.timestamp,
            read: false,
          }))
        );
      })
      .catch(() => {});
  }, [player?.id]);

  useEffect(() => {
    if (!socket || !player) return;

    const onAttack = (payload: {
      type: "dagger_hit" | "dagger_blocked";
      amountStolen: number;
      attackerId: string | null;
    }) => {
      const entry: AttackNotification = {
        id: crypto.randomUUID(),
        kind: "attack",
        blocked: payload.type === "dagger_blocked",
        attackerId: payload.attackerId,
        amountStolen: payload.amountStolen,
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => [...prev, entry]);
    };

    const onMessage = (msg: DirectMessage & { fromName?: string }) => {
      if (msg.fromId === player.id) return; // our own echoed message, not incoming
      const entry: MessageNotification = {
        id: msg.id,
        kind: "message",
        fromId: msg.fromId,
        fromName: msg.fromName ?? "Someone",
        body: msg.body,
        timestamp: msg.timestamp,
        read: false,
      };
      setNotifications((prev) => [...prev, entry]);
    };

    socket.on("player:notification", onAttack);
    socket.on("message:new", onMessage);
    return () => {
      socket.off("player:notification", onAttack);
      socket.off("message:new", onMessage);
    };
  }, [socket, player?.id]);

  // Returns the same array reference when everything is already read, so
  // marking-read on every tab open doesn't cause a re-render loop.
  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev.every((n) => n.read) ? prev : prev.map((n) => ({ ...n, read: true }))));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider.");
  return ctx;
}
