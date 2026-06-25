const USER_SESSION_KEY = "nw_discord_session_v1";

export type UserSession = {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  token: string;
  role: "admin" | "user";
  exp: number;
  country: string;
};

export function getUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as UserSession;
    if (Date.now() > s.exp) { localStorage.removeItem(USER_SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

export function setUserSession(session: UserSession) {
  localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

export function clearUserSession() {
  localStorage.removeItem(USER_SESSION_KEY);
}

export async function fetchMe(token: string): Promise<UserSession | null> {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      discordId: string; username: string; displayName: string;
      avatarUrl: string; role: "admin" | "user"; country: string;
    };
    return {
      discordId: data.discordId,
      username: data.username,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      role: data.role,
      country: data.country ?? "",
      token,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
  } catch { return null; }
}

export async function recordBubblePop(token: string): Promise<{ counted: boolean; count?: number; reason?: string }> {
  try {
    const res = await fetch("/api/bubbles/pop", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { counted: false };
    return await res.json();
  } catch { return { counted: false }; }
}

export type LeaderboardEntry = {
  rank: number;
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  count: number;
};

export async function fetchLeaderboard(): Promise<{ leaderboard: LeaderboardEntry[]; total: number; activePlayers: number }> {
  try {
    const res = await fetch("/api/bubbles/leaderboard");
    if (!res.ok) return { leaderboard: [], total: 0, activePlayers: 0 };
    return await res.json();
  } catch { return { leaderboard: [], total: 0, activePlayers: 0 }; }
}

export async function fetchMyStats(token: string): Promise<{ bubbleCount: number; rank: number | null; country?: string; avatarUrl?: string } | null> {
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export type WatchlistEntry = {
  id: number;
  title: string;
  coverImage: string;
  genres: string[];
  status: string;
  watchStatus: "plan" | "watching" | "completed" | "dropped";
  addedAt: number;
};

export async function fetchWatchlist(token: string): Promise<WatchlistEntry[]> {
  try {
    const res = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function saveWatchlist(token: string, items: WatchlistEntry[]): Promise<boolean> {
  try {
    const res = await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(items),
    });
    return res.ok;
  } catch { return false; }
}
