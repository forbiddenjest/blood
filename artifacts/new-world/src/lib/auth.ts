import { getUserSession } from "@/lib/userAuth";

export function isAuthed(): boolean {
  const s = getUserSession();
  return !!(s && s.role === "admin" && Date.now() < s.exp);
}

export function getToken(): string {
  return getUserSession()?.token ?? "";
}

export function getCurrentUser(): string {
  const s = getUserSession();
  return s?.displayName ?? s?.username ?? "";
}

export async function listAdminUsers(token: string): Promise<AdminUserRecord[]> {
  try {
    const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function deleteAdminUser(token: string, discordId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(discordId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: json.error };
  } catch { return { ok: false, error: "Network error" }; }
}

export type AdminUserRecord = {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  country: string;
  createdAt: number;
  lastActive: number;
  lockedIp: string;
  altIpCount: number;
  bubbleCount: number;
  isAdmin: boolean;
};
