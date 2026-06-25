import { Router, type Request, type Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { fileGet, fileSet } from "../lib/storage";

const router = Router();

// ─── Config ────────────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env["SESSION_SECRET"] || "nw_fallback_change_in_prod";
const DISCORD_CLIENT_ID = process.env["DISCORD_CLIENT_ID"] ?? "";
const DISCORD_CLIENT_SECRET = process.env["DISCORD_CLIENT_SECRET"] ?? "";
const ADMIN_DISCORD_IDS = new Set(
  (process.env["ADMIN_DISCORD_USER_IDS"] ?? "").split(",").map(s => s.trim()).filter(Boolean),
);
const MAX_STR = 500;
const MAX_CONCURRENT_PLAYERS = 38;
const MAX_WATCHLIST = 250;

function getRedirectUri(): string {
  if (process.env["DISCORD_REDIRECT_URI"]) return process.env["DISCORD_REDIRECT_URI"];
  // DISCORD_REDIRECT_URI must be set in Railway environment variables
  throw new Error("DISCORD_REDIRECT_URI environment variable is required");
}

function str(val: unknown, max = MAX_STR): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, max);
}

// ─── Token System ─────────────────────────────────────────────────────────────

function makeToken(discordId: string, role: "admin" | "user", expiryMs: number): string {
  const expiry = Date.now() + expiryMs;
  const payload = `${role}:${discordId}:${expiry}`;
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyToken(token: string): { discordId: string; role: "admin" | "user" } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return null;
    const sig = decoded.slice(lastColon + 1);
    const rest = decoded.slice(0, lastColon);
    const parts = rest.split(":");
    if (parts.length < 3) return null;
    const role = parts[0] as "admin" | "user";
    if (role !== "admin" && role !== "user") return null;
    const expiry = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!expiry || Date.now() > expiry) return null;
    const discordId = parts.slice(1, -1).join(":");
    if (!discordId) return null;
    const expected = createHmac("sha256", SESSION_SECRET)
      .update(`${role}:${discordId}:${expiry}`)
      .digest("hex");
    const s1 = Buffer.from(sig, "hex");
    const s2 = Buffer.from(expected, "hex");
    if (s1.length === 0 || s1.length !== s2.length) return null;
    if (!timingSafeEqual(s1, s2)) return null;
    return { discordId, role };
  } catch {
    return null;
  }
}

function requireAdmin(req: Request, res: Response): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const info = verifyToken(auth.slice(7));
  if (!info || info.role !== "admin") {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  return info.discordId;
}

function requireAuth(req: Request, res: Response): { discordId: string; role: "admin" | "user" } | null {
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const info = verifyToken(auth.slice(7));
  if (!info) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  return info;
}

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const rateLimiter = (() => {
  const store = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }, 10 * 60 * 1000).unref();
  return {
    check(key: string, max = 10, windowMs = 15 * 60 * 1000): { limited: boolean; retryAfter: number } {
      const now = Date.now();
      let e = store.get(key);
      if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + windowMs }; store.set(key, e); }
      e.count++;
      return { limited: e.count > max, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
    },
  };
})();

const bubbleAnticheat = (() => {
  const store = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - 120_000;
    for (const [k, v] of store) {
      const filtered = v.filter(t => t > cutoff);
      if (filtered.length === 0) store.delete(k);
      else store.set(k, filtered);
    }
  }, 2 * 60 * 1000).unref();
  return {
    check(discordId: string): { ok: boolean; reason?: string } {
      const now = Date.now();
      const times = store.get(discordId) ?? [];
      if (times.filter(t => now - t < 3_000).length >= 8) return { ok: false, reason: "too_fast" };
      if (times.filter(t => now - t < 60_000).length >= 400) return { ok: false, reason: "quota_exceeded" };
      times.push(now);
      store.set(discordId, times);
      return { ok: true };
    },
    getActiveUsers(): Set<string> {
      const cutoff = Date.now() - 60_000;
      const active = new Set<string>();
      for (const [id, times] of store) {
        if (times.some(t => t > cutoff)) active.add(id);
      }
      return active;
    },
  };
})();

// ─── OAuth State Store (CSRF protection) ─────────────────────────────────────

const oauthStates = new Map<string, { ip: string; createdAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oauthStates) {
    if (now - v.createdAt > 10 * 60 * 1000) oauthStates.delete(k);
  }
}, 5 * 60 * 1000).unref();

// ─── Data Types ───────────────────────────────────────────────────────────────

type UserAccount = {
  discordId: string;
  username: string;
  displayName: string;
  avatarHash: string | null;
  lockedIp: string;
  altIpLog: string[];
  createdAt: number;
  lastActive: number;
  country: string;
};

type MaintenanceData = { enabled: boolean; message: string; eta: string };
type BubbleData = { byUser: Record<string, number> };

type WatchlistEntry = {
  id: number;
  title: string;
  coverImage: string;
  genres: string[];
  status: string;
  watchStatus: "plan" | "watching" | "completed" | "dropped";
  addedAt: number;
};

type WatchlistData = Record<string, WatchlistEntry[]>;

const DEFAULT_SITEDATA = {
  members: [
    { id: "m1", handle: "@Paxjest", role: "Founder & Admiral", name: "Paxjest", quote: "Creating chaos since day one.", traits: ["Strategy", "Leadership", "Chaos"], avatar: "", kanji: "覇", colors: ["#a855f7", "#ec4899"], isAwaiting: false },
    { id: "m2", handle: "", role: "", name: "", quote: "", traits: ["", "", ""], avatar: "", kanji: "力", colors: ["#3b82f6", "#06b6d4"], isAwaiting: true },
    { id: "m3", handle: "", role: "", name: "", quote: "", traits: ["", "", ""], avatar: "", kanji: "力", colors: ["#10b981", "#84cc16"], isAwaiting: true },
  ],
  timeline: [
    { id: "t1", date: "Jan 2024", label: "New World founded. The first step into the unknown.", icon: "🌊" },
    { id: "t2", date: "Mar 2024", label: "First 50 members joined the crew.", icon: "⚔️" },
    { id: "t3", date: "Jun 2024", label: "Major alliance formed with rival crews.", icon: "🤝" },
    { id: "t4", date: "Dec 2024", label: "Reached the top of the server leaderboard.", icon: "👑" },
    { id: "t5", date: "Jun 2025", label: "Season 2 begins. New adventures await.", icon: "🚀" },
  ],
  news: [
    { id: "n1", date: "Jun 2026", title: "Season 3 Announcement", body: "The crew sets sail once more. New World Season 3 kicks off." },
    { id: "n2", date: "May 2026", title: "Recruitment Open", body: "We are looking for skilled fighters to join our ranks." },
  ],
  discordInvite: "https://discord.gg/5N9J8Y3atM",
};

function isValidSiteData(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d["members"]) || !Array.isArray(d["timeline"]) || !Array.isArray(d["news"])) return false;
  if ((d["members"] as unknown[]).length > 50 || (d["timeline"] as unknown[]).length > 100 || (d["news"] as unknown[]).length > 100) return false;
  return typeof d["discordInvite"] === "string";
}

async function getUserAccounts(): Promise<UserAccount[]> {
  const stored = await fileGet<UserAccount[]>("users.json");
  return stored && Array.isArray(stored) ? stored : [];
}

async function getBubbleData(): Promise<BubbleData> {
  const stored = await fileGet<BubbleData>("bubbles.json");
  if (!stored) return { byUser: {} };
  return { byUser: stored.byUser ?? {} };
}

async function getWatchlistData(): Promise<WatchlistData> {
  const stored = await fileGet<WatchlistData>("watchlists.json");
  return stored ?? {};
}

async function detectCountry(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("::1") || ip.startsWith("192.168.") || ip.startsWith("10.")) return "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const code = (await res.text()).trim();
    return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : "";
  } catch { return ""; }
}

function getDiscordAvatarUrl(discordId: string, avatarHash: string | null): string {
  if (!avatarHash) {
    try {
      const idx = Number(BigInt(discordId) >> 22n) % 6;
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch { return "https://cdn.discordapp.com/embed/avatars/0.png"; }
  }
  const ext = avatarHash.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
}

// ─── Discord OAuth ─────────────────────────────────────────────────────────────

router.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    res.status(503).json({ error: "Discord OAuth not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET." });
    return;
  }
  const ip = getClientIp(req);
  const rate = rateLimiter.check(`oauth:${ip}`, 20, 60 * 60 * 1000);
  if (rate.limited) { res.status(429).json({ error: "Too many requests." }); return; }

  const state = randomBytes(24).toString("hex");
  oauthStates.set(state, { ip, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "none",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

router.get("/auth/discord/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) { res.redirect(`/?auth_error=${encodeURIComponent(oauthError)}`); return; }
  if (!code || !state) { res.redirect("/?auth_error=missing_params"); return; }

  const stateData = oauthStates.get(state);
  if (!stateData || Date.now() - stateData.createdAt > 10 * 60 * 1000) {
    res.redirect("/?auth_error=invalid_state"); return;
  }
  oauthStates.delete(state);

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(),
      }),
    });
    if (!tokenRes.ok) { res.redirect("/?auth_error=token_exchange_failed"); return; }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) { res.redirect("/?auth_error=no_access_token"); return; }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) { res.redirect("/?auth_error=user_fetch_failed"); return; }

    const discordUser = (await userRes.json()) as {
      id: string; username: string; global_name: string | null; avatar: string | null;
    };

    const ip = getClientIp(req);
    const users = await getUserAccounts();
    const existingIdx = users.findIndex(u => u.discordId === discordUser.id);
    const isAdmin = ADMIN_DISCORD_IDS.has(discordUser.id);
    const role: "admin" | "user" = isAdmin ? "admin" : "user";

    if (existingIdx === -1) {
      // New user — enforce one-account-per-IP (skip for admins)
      if (!isAdmin && ip !== "unknown" && ip !== "" && users.some(u => u.lockedIp === ip)) {
        res.redirect("/?auth_error=alt_account_blocked"); return;
      }
      const country = await detectCountry(ip);
      const now = Date.now();
      users.push({
        discordId: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name || discordUser.username,
        avatarHash: discordUser.avatar,
        lockedIp: ip,
        altIpLog: [],
        createdAt: now,
        lastActive: now,
        country,
      });
    } else {
      const user = users[existingIdx]!;
      user.username = discordUser.username;
      user.displayName = discordUser.global_name || discordUser.username;
      user.avatarHash = discordUser.avatar;
      user.lastActive = Date.now();
      if (ip && ip !== "unknown" && user.lockedIp !== ip && !user.altIpLog.includes(ip)) {
        user.altIpLog = [...(user.altIpLog ?? []), ip].slice(-10);
      }
    }

    await fileSet("users.json", users);
    const token = makeToken(discordUser.id, role, 7 * 24 * 60 * 60 * 1000);
    res.redirect(`/?nw_token=${token}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect("/?auth_error=server_error");
  }
});

// ─── Auth: Me ─────────────────────────────────────────────────────────────────

router.get("/auth/me", async (req, res) => {
  const info = requireAuth(req, res);
  if (!info) return;

  const [users, bubbles] = await Promise.all([getUserAccounts(), getBubbleData()]);
  const user = users.find(u => u.discordId === info.discordId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const count = bubbles.byUser[info.discordId] ?? 0;
  const sorted = Object.entries(bubbles.byUser).sort((a, b) => b[1] - a[1]);
  const rank = sorted.findIndex(([id]) => id === info.discordId) + 1;

  res.json({
    discordId: user.discordId,
    username: user.username,
    displayName: user.displayName,
    avatarHash: user.avatarHash,
    avatarUrl: getDiscordAvatarUrl(user.discordId, user.avatarHash),
    country: user.country,
    role: info.role,
    bubbleCount: count,
    rank: rank > 0 ? rank : null,
  });
});

// ─── Watchlist (server-side, 250 entries max per user) ────────────────────────

router.get("/watchlist", async (req, res) => {
  const info = requireAuth(req, res);
  if (!info) return;
  const data = await getWatchlistData();
  res.json(data[info.discordId] ?? []);
});

router.put("/watchlist", async (req, res) => {
  const info = requireAuth(req, res);
  if (!info) return;
  const items = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "Expected array" }); return; }

  const sanitized: WatchlistEntry[] = items.slice(0, MAX_WATCHLIST).map(item => ({
    id: typeof item.id === "number" ? item.id : 0,
    title: str(item.title, 300),
    coverImage: str(item.coverImage, 500),
    genres: Array.isArray(item.genres) ? item.genres.slice(0, 10).map((g: unknown) => str(g, 50)) : [],
    status: str(item.status, 50),
    watchStatus: (["plan", "watching", "completed", "dropped"] as const).includes(item.watchStatus) ? item.watchStatus : "plan",
    addedAt: typeof item.addedAt === "number" ? item.addedAt : Date.now(),
  }));

  const data = await getWatchlistData();
  data[info.discordId] = sanitized;
  await fileSet("watchlists.json", data);
  res.json({ ok: true, count: sanitized.length });
});

// ─── Site Data ────────────────────────────────────────────────────────────────

router.get("/sitedata", async (_req, res) => {
  const data = (await fileGet("sitedata.json")) ?? DEFAULT_SITEDATA;
  res.json(data);
});

router.put("/sitedata", async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  if (!isValidSiteData(req.body)) { res.status(400).json({ error: "Invalid site data" }); return; }
  await fileSet("sitedata.json", req.body);
  res.json({ ok: true });
});

// ─── Maintenance ──────────────────────────────────────────────────────────────

router.get("/maintenance", async (_req, res) => {
  const data = (await fileGet<MaintenanceData>("maintenance.json")) ?? { enabled: false, message: "", eta: "" };
  res.json(data);
});

router.put("/maintenance", async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const { enabled, message, eta } = req.body ?? {};
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "Invalid payload" }); return; }
  await fileSet("maintenance.json", { enabled, message: str(message, 500), eta: str(eta, 100) });
  res.json({ ok: true });
});

// ─── Admin: Users ─────────────────────────────────────────────────────────────

router.get("/admin/users", async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const [users, bubbles] = await Promise.all([getUserAccounts(), getBubbleData()]);
  res.json(users.map(u => ({
    discordId: u.discordId,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: getDiscordAvatarUrl(u.discordId, u.avatarHash),
    country: u.country,
    createdAt: u.createdAt,
    lastActive: u.lastActive,
    lockedIp: u.lockedIp,
    altIpCount: (u.altIpLog ?? []).length,
    bubbleCount: bubbles.byUser[u.discordId] ?? 0,
    isAdmin: ADMIN_DISCORD_IDS.has(u.discordId),
  })));
});

router.delete("/admin/users/:discordId", async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const targetId = str(req.params["discordId"] ?? "", 50);
  if (!targetId) { res.status(400).json({ error: "Missing discord ID" }); return; }
  if (targetId === adminId) { res.status(400).json({ error: "Cannot remove your own account" }); return; }

  const users = await getUserAccounts();
  if (!users.find(u => u.discordId === targetId)) { res.status(404).json({ error: "User not found" }); return; }
  await fileSet("users.json", users.filter(u => u.discordId !== targetId));

  const [bubbles, watchlists] = await Promise.all([getBubbleData(), getWatchlistData()]);
  delete bubbles.byUser[targetId];
  delete watchlists[targetId];
  await Promise.all([fileSet("bubbles.json", bubbles), fileSet("watchlists.json", watchlists)]);
  res.json({ ok: true });
});

// ─── Bubbles ──────────────────────────────────────────────────────────────────

router.post("/bubbles/pop", async (req, res) => {
  const auth = req.headers["authorization"];
  let discordId: string | null = null;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const info = verifyToken(auth.slice(7));
    if (info) discordId = info.discordId;
  }
  if (!discordId) { res.json({ counted: false, reason: "not_logged_in" }); return; }

  const rateCheck = bubbleAnticheat.check(discordId);
  if (!rateCheck.ok) {
    const count = (await getBubbleData()).byUser[discordId] ?? 0;
    res.json({ counted: false, reason: rateCheck.reason, count }); return;
  }

  const activeUsers = bubbleAnticheat.getActiveUsers();
  activeUsers.delete(discordId);
  if (activeUsers.size >= MAX_CONCURRENT_PLAYERS) {
    const count = (await getBubbleData()).byUser[discordId] ?? 0;
    res.json({ counted: false, reason: "server_busy", count }); return;
  }

  const bubbles = await getBubbleData();
  bubbles.byUser[discordId] = (bubbles.byUser[discordId] ?? 0) + 1;
  await fileSet("bubbles.json", bubbles);
  res.json({ counted: true, count: bubbles.byUser[discordId] });
});

router.get("/bubbles/leaderboard", async (_req, res) => {
  const [bubbles, users] = await Promise.all([getBubbleData(), getUserAccounts()]);
  const activeUsers = bubbleAnticheat.getActiveUsers();
  const userMap = new Map(users.map(u => [u.discordId, u]));

  const leaderboard = Object.entries(bubbles.byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([discordId, count], i) => {
      const u = userMap.get(discordId);
      return {
        rank: i + 1,
        discordId,
        username: u?.username ?? discordId,
        displayName: u?.displayName ?? u?.username ?? discordId,
        avatarUrl: getDiscordAvatarUrl(discordId, u?.avatarHash ?? null),
        count,
      };
    });

  const total = Object.values(bubbles.byUser).reduce((a, b) => a + b, 0);
  res.json({ leaderboard, total, activePlayers: activeUsers.size });
});

router.delete("/bubbles/reset", async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  await fileSet("bubbles.json", { byUser: {} });
  res.json({ ok: true });
});

export default router;
