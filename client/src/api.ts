import {
  Player,
  InventoryItem,
  AuctionRoomSummary,
  AuctionTierSummary,
  AttackLogEntry,
  CatalogItem,
  PlayerActivityEntry,
  DirectMessage,
  PublicProfile,
} from "./types";

const API_BASE = "http://localhost:3001";

async function request<T>(
  path: string,
  playerId: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (playerId) headers["x-player-id"] = playerId;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export function login(name: string) {
  return request<{ playerId: string; name: string; gold: number; isAdmin: boolean }>("/login", null, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchInventory(playerId: string) {
  return request<{ gold: number; inventory: InventoryItem[] }>("/inventory", playerId);
}

export function fetchGallery(targetPlayerId: string) {
  return request<{ playerName: string; paintings: InventoryItem[] }>(
    `/gallery/${targetPlayerId}`,
    null
  );
}

export function fetchPublicGallery() {
  return request<{ galleries: { playerId: string; playerName: string; paintings: InventoryItem[] }[] }>(
    "/gallery",
    null
  );
}

export function openChest(playerId: string, itemId: string) {
  return request<{ result: "gold" | "item"; amount?: number; itemType?: string }>(
    `/items/${itemId}/open`,
    playerId,
    { method: "POST" }
  );
}

export function relistChest(playerId: string, itemId: string, startingPrice: number) {
  return request<{ queued: boolean }>(`/items/${itemId}/relist`, playerId, {
    method: "POST",
    body: JSON.stringify({ startingPrice }),
  });
}

export function displayPainting(playerId: string, itemId: string) {
  return request<{ displayed: boolean }>(`/items/${itemId}/display`, playerId, { method: "POST" });
}

export function undisplayPainting(playerId: string, itemId: string) {
  return request<{ displayed: boolean }>(`/items/${itemId}/undisplay`, playerId, {
    method: "POST",
  });
}

export function fetchAuctionRooms() {
  return request<{ rooms: AuctionRoomSummary[]; tiers: AuctionTierSummary[] }>("/auction", null);
}

export function fetchAttackLog(playerId: string) {
  return request<{ entries: AttackLogEntry[] }>("/attack-log", playerId);
}

export function fetchCatalog() {
  return request<{ items: CatalogItem[] }>("/catalog", null);
}

export function fetchPlayerActivity() {
  return request<{ players: PlayerActivityEntry[] }>("/players/activity", null);
}

export function fetchMessages(playerId: string, otherPlayerId: string) {
  return request<{ messages: DirectMessage[] }>(`/messages/${otherPlayerId}`, playerId);
}

/** viewerPlayerId identifies the caller so the server can reveal your own anonymous entries to you -- pass your own id even when viewing someone else's profile. */
export function fetchProfile(targetPlayerId: string, viewerPlayerId: string) {
  return request<PublicProfile>(`/profile/${targetPlayerId}`, viewerPlayerId);
}

/** Chalk Marker: attaches ownership-history tracking to another of your own items, consuming the marker. */
export function useChalkMarker(playerId: string, markerItemId: string, targetItemId: string) {
  return request<{ marked: boolean; item: InventoryItem }>(`/items/${markerItemId}/chalk-mark`, playerId, {
    method: "POST",
    body: JSON.stringify({ targetItemId }),
  });
}

/** Twin-Faced Coin: flip for a fixed stake, consumed either way. */
export function flipCoin(playerId: string, coinItemId: string) {
  return request<{ won: boolean; amount: number }>(`/items/${coinItemId}/flip-coin`, playerId, {
    method: "POST",
  });
}

/** Street Rumor: pre-rolls and locks in a specific chest's contents, revealing only its broad category. */
export function useStreetRumor(playerId: string, rumorItemId: string, chestItemId: string) {
  return request<{ category: string }>(`/items/${rumorItemId}/use-street-rumor`, playerId, {
    method: "POST",
    body: JSON.stringify({ chestItemId }),
  });
}

/** Gallery Deed: permanently raises the display cap to 3, consuming the deed. */
export function useGalleryDeed(playerId: string, deedItemId: string) {
  return request<{ paintingDisplayCap: number }>(`/items/${deedItemId}/use-gallery-deed`, playerId, {
    method: "POST",
  });
}
