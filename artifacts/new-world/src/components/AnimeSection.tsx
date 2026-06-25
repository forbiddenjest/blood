import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { soundEngine } from "@/lib/sound";
import { getUserSession, type UserSession } from "@/lib/userAuth";

const ANILIST_URL = "https://graphql.anilist.co";
const CACHE_KEY_UPCOMING = "nw_anime_upcoming_v4";
const CACHE_KEY_TRENDING = "nw_anime_trending_v4";
const CACHE_TTL = 24 * 60 * 60 * 1000;

type AnimeMedia = {
  id: number;
  title: { romaji: string; english: string | null };
  coverImage: { large: string; color: string | null };
  genres: string[];
  episodes: number | null;
  duration: number | null;
  status: string;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null; month: number | null };
  description: string | null;
  averageScore: number | null;
  popularity: number | null;
  format: string | null;
  studios: { nodes: { name: string }[] } | null;
};

type WatchlistEntry = {
  id: number;
  title: string;
  coverImage: string;
  genres: string[];
  status: string;
  watchStatus: "plan" | "watching" | "completed" | "dropped";
  addedAt: number;
};

const FIELDS = `id title{romaji english}coverImage{large color}genres episodes duration status season seasonYear startDate{year month}description(asHtml:false)averageScore popularity format studios{nodes{name}}`;
const UPCOMING_QUERY = `query($page:Int){Page(page:$page,perPage:12){media(type:ANIME,status:NOT_YET_RELEASED,sort:POPULARITY_DESC){${FIELDS}}}}`;
const TRENDING_QUERY = `query($page:Int){Page(page:$page,perPage:12){media(type:ANIME,sort:TRENDING_DESC,status_in:[RELEASING,NOT_YET_RELEASED]){${FIELDS}}}}`;
const SEARCH_QUERY = `query($search:String!,$page:Int){Page(page:$page,perPage:12){media(type:ANIME,search:$search,sort:POPULARITY_DESC){${FIELDS}}}}`;

const GENRE_OPTIONS = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mecha", "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

const STATUS_LABEL: Record<string, string> = { NOT_YET_RELEASED: "Upcoming", RELEASING: "Airing", FINISHED: "Finished", CANCELLED: "Cancelled", HIATUS: "Hiatus" };
const STATUS_COLOR: Record<string, string> = { NOT_YET_RELEASED: "#a855f7", RELEASING: "#10b981", FINISHED: "#6366f1", CANCELLED: "#ef4444", HIATUS: "#f59e0b" };
const WATCH_STATUS_LABEL: Record<string, string> = { plan: "Plan to Watch", watching: "Watching", completed: "Completed", dropped: "Dropped" };
const WATCH_STATUS_COLOR: Record<string, string> = { plan: "#6366f1", watching: "#10b981", completed: "#a855f7", dropped: "#ef4444" };

type CacheEntry = { data: AnimeMedia[]; timestamp: number };

function readCache(key: string): AnimeMedia[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry.data;
  } catch { return null; }
}
function writeCache(key: string, data: AnimeMedia[]) {
  try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}

function getWatchlistKey(username: string) { return `nw_wl_v1_${username}`; }
function loadWatchlist(username: string): WatchlistEntry[] {
  try { const r = localStorage.getItem(getWatchlistKey(username)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveWatchlist(username: string, items: WatchlistEntry[]) {
  try { localStorage.setItem(getWatchlistKey(username), JSON.stringify(items)); } catch {}
}

async function anilistFetch(query: string, variables: object): Promise<AnimeMedia[]> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error("Request failed");
  const json = await res.json();
  return json?.data?.Page?.media ?? [];
}

function formatDate(anime: AnimeMedia): string {
  if (anime.startDate.year) {
    const month = anime.startDate.month
      ? new Date(2024, anime.startDate.month - 1).toLocaleString("en", { month: "short" }) + " "
      : "";
    return `${month}${anime.startDate.year}`;
  }
  if (anime.season && anime.seasonYear) return `${anime.season} ${anime.seasonYear}`;
  return "TBA";
}

// Anime detail overlay shown when a card is clicked
function AnimeDetail({ anime, onBack, onWatchlistToggle, watchStatus }: {
  anime: AnimeMedia;
  onBack: () => void;
  onWatchlistToggle: (anime: AnimeMedia, status: WatchlistEntry["watchStatus"] | null) => void;
  watchStatus: WatchlistEntry["watchStatus"] | null;
}) {
  const accent = anime.coverImage.color || "#a855f7";
  const title = anime.title.english || anime.title.romaji;
  const desc = anime.description?.replace(/<[^>]+>/g, "").slice(0, 600) || "";
  const mainStudio = anime.studios?.nodes?.[0]?.name ?? null;
  const [showWsMenu, setShowWsMenu] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-4xl mx-auto"
    >
      <button
        onClick={() => { onBack(); soundEngine.click(); }}
        className="mb-6 flex items-center gap-2 text-white/40 hover:text-white/75 transition-colors cursor-pointer text-sm font-mono"
        onMouseEnter={() => soundEngine.hover()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to list
      </button>

      <div className="rounded-3xl overflow-hidden" style={{ background: "linear-gradient(155deg, rgba(14,6,34,0.98), rgba(5,2,15,0.98))", border: `1px solid ${accent}30` }}>
        <div className="grid sm:grid-cols-[240px_1fr] gap-0">
          {/* Cover Image */}
          <div className="relative aspect-[3/4] sm:aspect-auto sm:min-h-[400px] overflow-hidden">
            <img src={anime.coverImage.large} alt={title} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to right, transparent 70%, rgba(5,2,15,0.98)), linear-gradient(to top, rgba(5,2,15,0.95) 0%, transparent 40%)` }} />
            <div className="absolute top-4 left-4">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase" style={{ background: `${STATUS_COLOR[anime.status] || "#a855f7"}22`, border: `1px solid ${STATUS_COLOR[anime.status] || "#a855f7"}55`, color: STATUS_COLOR[anime.status] || "#a855f7" }}>
                {STATUS_LABEL[anime.status] || anime.status}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="p-6 sm:p-8 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-mono tracking-widest uppercase mb-1.5" style={{ color: `${accent}90` }}>
                {anime.format?.replace(/_/g, " ")} {anime.seasonYear && `· ${anime.seasonYear}`}
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-white/92 leading-tight mb-2">{title}</h3>
              {anime.title.romaji !== title && (
                <p className="text-white/30 text-sm font-mono">{anime.title.romaji}</p>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {anime.averageScore && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)" }}>
                  <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Score</p>
                  <p className="text-amber-400/90 font-black text-base">⭐ {(anime.averageScore / 10).toFixed(1)}</p>
                </div>
              )}
              {anime.episodes && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.16)" }}>
                  <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Episodes</p>
                  <p className="text-purple-300/80 font-black text-base">{anime.episodes}</p>
                </div>
              )}
              {anime.duration && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.16)" }}>
                  <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-blue-300/80 font-black text-sm">{anime.duration} min</p>
                </div>
              )}
              {mainStudio && (
                <div className="px-3 py-2.5 rounded-xl col-span-2 sm:col-span-1" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.16)" }}>
                  <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Studio</p>
                  <p className="text-emerald-300/80 font-semibold text-sm truncate">{mainStudio}</p>
                </div>
              )}
              {anime.popularity && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(236,72,153,0.07)", border: "1px solid rgba(236,72,153,0.16)" }}>
                  <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Popularity</p>
                  <p className="text-pink-300/80 font-semibold text-sm">{anime.popularity.toLocaleString()}</p>
                </div>
              )}
              <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[9px] font-mono text-white/25 uppercase tracking-wider mb-1">Release</p>
                <p className="text-white/60 font-semibold text-sm">{formatDate(anime)}</p>
              </div>
            </div>

            {/* Genres */}
            {anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {anime.genres.map(g => (
                  <span key={g} className="px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: `${accent}15`, border: `1px solid ${accent}28`, color: accent }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {desc && (
              <p className="text-white/45 text-sm leading-relaxed line-clamp-5">{desc}</p>
            )}

            {/* Watchlist button */}
            <div className="relative mt-auto">
              {watchStatus ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: `${WATCH_STATUS_COLOR[watchStatus]}15`, border: `1px solid ${WATCH_STATUS_COLOR[watchStatus]}30` }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WATCH_STATUS_COLOR[watchStatus]} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span className="text-xs font-bold" style={{ color: WATCH_STATUS_COLOR[watchStatus] }}>{WATCH_STATUS_LABEL[watchStatus]}</span>
                  </div>
                  <button
                    onClick={() => setShowWsMenu(s => !s)}
                    className="px-3 py-2.5 rounded-xl text-xs text-white/40 border border-white/[0.08] hover:text-white/70 transition-colors cursor-pointer"
                    onMouseEnter={() => soundEngine.hover()}>Change</button>
                  <button
                    onClick={() => { onWatchlistToggle(anime, null); soundEngine.click(); }}
                    className="px-3 py-2.5 rounded-xl text-xs text-red-400/50 border border-red-400/15 hover:text-red-400/80 transition-colors cursor-pointer"
                    onMouseEnter={() => soundEngine.hover()}>Remove</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowWsMenu(s => !s)}
                  className="w-full py-3 rounded-xl text-sm font-bold tracking-wider cursor-pointer transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(236,72,153,0.15))", border: "1px solid rgba(168,85,247,0.3)", color: "rgba(196,132,252,0.9)" }}
                  onMouseEnter={() => soundEngine.hover()}>
                  + Add to Anime List
                </button>
              )}
              <AnimatePresence>
                {showWsMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden z-10"
                    style={{ background: "rgba(14,6,34,0.98)", border: "1px solid rgba(168,85,247,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                    {(["plan", "watching", "completed", "dropped"] as const).map(ws => (
                      <button key={ws}
                        onClick={() => { onWatchlistToggle(anime, ws); setShowWsMenu(false); soundEngine.click(); }}
                        className="w-full text-left px-4 py-3 text-xs font-bold transition-colors cursor-pointer flex items-center gap-2.5"
                        style={{ color: WATCH_STATUS_COLOR[ws], borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={() => soundEngine.hover()}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: WATCH_STATUS_COLOR[ws] }} />
                        {WATCH_STATUS_LABEL[ws]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AnimeCard({ anime, index, onSelect }: { anime: AnimeMedia; index: number; onSelect: (a: AnimeMedia) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const accent = anime.coverImage.color || "#a855f7";
  const title = anime.title.english || anime.title.romaji;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: (index % 6) * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      style={{ transform: `perspective(700px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`, transition: "transform 0.25s ease, box-shadow 0.3s ease", boxShadow: "0 4px 28px rgba(0,0,0,0.45)" }}
      onMouseMove={e => { const r = ref.current?.getBoundingClientRect(); if (!r) return; setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 14, y: ((e.clientY - r.top) / r.height - 0.5) * -14 }); }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      onClick={() => { onSelect(anime); soundEngine.click(); }}
      onMouseEnter={() => soundEngine.hover()}>
      <div className="relative aspect-[3/4] overflow-hidden">
        <img src={anime.coverImage.large} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, rgba(4,2,14,0.97) 0%, rgba(4,2,14,0.45) 40%, transparent 70%)` }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}12 0%, transparent 50%)` }} />
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-start gap-1">
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase" style={{ background: `${STATUS_COLOR[anime.status] || "#a855f7"}22`, border: `1px solid ${STATUS_COLOR[anime.status] || "#a855f7"}55`, color: STATUS_COLOR[anime.status] || "#a855f7" }}>
            {STATUS_LABEL[anime.status] || anime.status}
          </span>
          {anime.averageScore && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)", color: "#fbbf24" }}>★ {(anime.averageScore / 10).toFixed(1)}</span>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3.5">
          <p className="text-white font-bold text-sm leading-snug mb-1.5 line-clamp-2">{title}</p>
          <div className="flex flex-wrap gap-1 mb-1.5">{anime.genres.slice(0, 2).map(g => <span key={g} className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: `${accent}20`, color: accent }}>{g}</span>)}</div>
          <div className="flex items-center gap-2.5 text-[10px] text-white/35 font-mono"><span>{formatDate(anime)}</span>{anime.episodes && <span>{anime.episodes} eps</span>}</div>
        </div>
        {/* Click hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider text-white/80" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
            View Details
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function WatchlistSection({ session, watchlist, setWatchlist }: {
  session: UserSession | null;
  watchlist: WatchlistEntry[];
  setWatchlist: (items: WatchlistEntry[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const username = session?.username;

  const removeItem = (id: number) => {
    const next = watchlist.filter(e => e.id !== id);
    setWatchlist(next);
    if (username) saveWatchlist(username, next);
    soundEngine.click();
  };

  const changeStatus = (id: number, ws: WatchlistEntry["watchStatus"]) => {
    const next = watchlist.map(e => e.id === id ? { ...e, watchStatus: ws } : e);
    setWatchlist(next);
    if (username) saveWatchlist(username, next);
    soundEngine.click();
  };

  if (watchlist.length === 0 && !expanded) {
    return (
      <div className="mt-8 flex justify-center">
        <div className="px-5 py-3 rounded-2xl text-xs text-white/20 font-mono" style={{ border: "1px dashed rgba(168,85,247,0.12)" }}>
          Your Anime List is empty — click any anime to add it
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <button
        onClick={() => { setExpanded(e => !e); soundEngine.click(); }}
        className="flex items-center gap-3 mb-6 group cursor-pointer"
        onMouseEnter={() => soundEngine.hover()}>
        <span className="text-xl font-black tracking-[-0.02em] text-white/80 group-hover:text-white/95 transition-colors">Your Anime List</span>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.28)", color: "rgba(196,132,252,0.9)" }}>{watchlist.length}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" style={{ transform: expanded ? "rotate(180deg)" : "", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {/* Group by status */}
            {(["watching", "plan", "completed", "dropped"] as const).map(ws => {
              const items = watchlist.filter(e => e.watchStatus === ws);
              if (items.length === 0) return null;
              return (
                <div key={ws} className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full" style={{ background: WATCH_STATUS_COLOR[ws] }} />
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: WATCH_STATUS_COLOR[ws] }}>{WATCH_STATUS_LABEL[ws]}</p>
                    <span className="text-white/20 text-[10px] font-mono">({items.length})</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {items.map(entry => (
                      <div key={entry.id} className="relative rounded-xl overflow-hidden group cursor-default" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${WATCH_STATUS_COLOR[entry.watchStatus]}20` }}>
                        <div className="relative aspect-[3/4] overflow-hidden">
                          <img src={entry.coverImage} alt={entry.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" loading="lazy" />
                          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,2,14,0.97) 0%, transparent 55%)" }} />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-white/80 text-[10px] font-bold leading-tight line-clamp-2">{entry.title}</p>
                          </div>
                        </div>
                        <div className="p-2 flex items-center gap-1">
                          <select
                            value={entry.watchStatus}
                            onChange={e => changeStatus(entry.id, e.target.value as WatchlistEntry["watchStatus"])}
                            className="flex-1 bg-transparent text-[9px] font-mono cursor-pointer outline-none"
                            style={{ color: WATCH_STATUS_COLOR[entry.watchStatus] }}>
                            {(["plan", "watching", "completed", "dropped"] as const).map(s => (
                              <option key={s} value={s} style={{ background: "#0a0520", color: WATCH_STATUS_COLOR[s] }}>{WATCH_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeItem(entry.id)}
                            className="text-red-400/35 hover:text-red-400/80 cursor-pointer transition-colors text-sm leading-none shrink-0"
                            onMouseEnter={() => soundEngine.hover()}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      {watchlist.length > 0 && !expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 opacity-60">
          {watchlist.slice(0, 6).map(e => (
            <div key={e.id} className="rounded-lg overflow-hidden aspect-[3/4]">
              <img src={e.coverImage} alt={e.title} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
          {watchlist.length > 6 && <div className="rounded-lg flex items-center justify-center text-white/30 text-sm font-mono aspect-[3/4]" style={{ border: "1px dashed rgba(255,255,255,0.08)" }}>+{watchlist.length - 6}</div>}
        </div>
      )}
    </div>
  );
}

export default function AnimeSection({ session }: { session?: UserSession | null }) {
  const currentSession = session ?? getUserSession();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"upcoming" | "trending">("upcoming");
  const [error, setError] = useState("");

  // Click to expand detail view
  const [selectedAnime, setSelectedAnime] = useState<AnimeMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Genre filter
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Watchlist (server-side, loaded from API)
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const watchlistSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchlistInitialized = useRef(false);

  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true, margin: "-100px" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 420);
    return () => clearTimeout(t);
  }, [query]);

  const fetchData = useCallback(async (q: string, m: "upcoming" | "trending") => {
    setLoading(true); setError(""); setSelectedAnime(null); setSelectedGenres([]);
    try {
      if (q) {
        setResults(await anilistFetch(SEARCH_QUERY, { search: q, page: 1 }));
      } else if (m === "trending") {
        const cached = readCache(CACHE_KEY_TRENDING);
        if (cached) { setResults(cached); setLoading(false); return; }
        const data = await anilistFetch(TRENDING_QUERY, { page: 1 });
        writeCache(CACHE_KEY_TRENDING, data); setResults(data);
      } else {
        const cached = readCache(CACHE_KEY_UPCOMING);
        if (cached) { setResults(cached); setLoading(false); return; }
        const data = await anilistFetch(UPCOMING_QUERY, { page: 1 });
        writeCache(CACHE_KEY_UPCOMING, data); setResults(data);
      }
    } catch { setError("Could not load content. Check your connection."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(debouncedQuery, mode); }, [debouncedQuery, mode, fetchData]);

  const handleModeChange = (m: "upcoming" | "trending") => {
    if (m === mode && !debouncedQuery) return;
    soundEngine.click();
    setMode(m);
    setQuery("");
    setDebouncedQuery("");
  };

  const handleAnimeSelect = (anime: AnimeMedia) => {
    setSelectedAnime(anime);
    setDetailLoading(true);
    setTimeout(() => setDetailLoading(false), 600);
    soundEngine.click();
  };

  const handleBack = () => {
    setSelectedAnime(null);
    setDetailLoading(false);
  };

  // Load watchlist from API when session is available
  useEffect(() => {
    if (!currentSession?.token || watchlistInitialized.current) return;
    watchlistInitialized.current = true;
    import("@/lib/userAuth").then(({ fetchWatchlist }) =>
      fetchWatchlist(currentSession.token).then(items => setWatchlist(items))
    );
  }, [currentSession]);

  // Save watchlist to API (debounced) whenever it changes
  useEffect(() => {
    if (!currentSession?.token || !watchlistInitialized.current) return;
    if (watchlistSaveRef.current) clearTimeout(watchlistSaveRef.current);
    watchlistSaveRef.current = setTimeout(() => {
      import("@/lib/userAuth").then(({ saveWatchlist }) =>
        saveWatchlist(currentSession.token, watchlist)
      );
    }, 800);
    return () => { if (watchlistSaveRef.current) clearTimeout(watchlistSaveRef.current); };
  }, [watchlist, currentSession]);

  const handleWatchlistToggle = (anime: AnimeMedia, ws: WatchlistEntry["watchStatus"] | null) => {
    let next: WatchlistEntry[];
    if (ws === null) {
      next = watchlist.filter(e => e.id !== anime.id);
    } else {
      const existing = watchlist.find(e => e.id === anime.id);
      if (existing) {
        next = watchlist.map(e => e.id === anime.id ? { ...e, watchStatus: ws } : e);
      } else {
        next = [...watchlist, {
          id: anime.id,
          title: anime.title.english || anime.title.romaji,
          coverImage: anime.coverImage.large,
          genres: anime.genres,
          status: anime.status,
          watchStatus: ws,
          addedAt: Date.now(),
        }];
      }
    }
    setWatchlist(next);
  };

  const getWatchStatus = (id: number): WatchlistEntry["watchStatus"] | null =>
    watchlist.find(e => e.id === id)?.watchStatus ?? null;

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
    soundEngine.click();
  };

  const filteredResults = selectedGenres.length > 0
    ? results.filter(a => selectedGenres.every(g => a.genres.includes(g)))
    : results;

  const isSearching = !!debouncedQuery;

  return (
    <section id="anime" className="py-20 md:py-32 px-4 sm:px-6 relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 60% 30%, rgba(59,130,246,0.05) 0%, transparent 60%)" }} />
      <div className="max-w-6xl mx-auto">

        <div ref={headerRef} className="mb-10 md:mb-14">
          <motion.p initial={{ opacity: 0, y: 20 }} animate={headerInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="text-xs font-mono tracking-[0.5em] uppercase text-blue-400/45 mb-3">Top Picks</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={headerInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.08 }} className="text-4xl sm:text-5xl font-black tracking-tight text-white/90 mb-5">Anime</motion.h2>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={headerInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.16 }} className="space-y-3 max-w-2xl">
            {/* Mode tabs */}
            <div className="flex items-center gap-2">
              <button onClick={() => handleModeChange("upcoming")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-wider uppercase transition-all cursor-pointer"
                style={{ background: mode === "upcoming" && !isSearching ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)", border: mode === "upcoming" && !isSearching ? "1px solid rgba(168,85,247,0.38)" : "1px solid rgba(255,255,255,0.08)", color: mode === "upcoming" && !isSearching ? "rgba(196,132,252,0.9)" : "rgba(255,255,255,0.35)" }}
                onMouseEnter={() => soundEngine.hover()}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z"/></svg>
                Upcoming
              </button>
              <button onClick={() => handleModeChange("trending")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-wider uppercase transition-all cursor-pointer"
                style={{ background: mode === "trending" && !isSearching ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.04)", border: mode === "trending" && !isSearching ? "1px solid rgba(236,72,153,0.35)" : "1px solid rgba(255,255,255,0.08)", color: mode === "trending" && !isSearching ? "rgba(249,168,212,0.9)" : "rgba(255,255,255,0.35)" }}
                onMouseEnter={() => soundEngine.hover()}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                Trending
              </button>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: isSearching ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.09)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input ref={inputRef} type="text" placeholder="Search anime..." value={query} onChange={e => { setQuery(e.target.value); soundEngine.hover(); }} maxLength={100} className="flex-1 bg-transparent text-white/80 placeholder-white/20 text-sm outline-none" />
              {query && <button onClick={() => { setQuery(""); setDebouncedQuery(""); inputRef.current?.focus(); soundEngine.click(); }} className="text-white/25 hover:text-white/55 cursor-pointer transition-colors text-lg leading-none">×</button>}
            </div>

            {/* Genre filter — shown when searching */}
            <AnimatePresence>
              {(isSearching || results.length > 0) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {GENRE_OPTIONS.map(genre => (
                      <button key={genre}
                        onClick={() => toggleGenre(genre)}
                        className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer"
                        style={{
                          background: selectedGenres.includes(genre) ? "rgba(168,85,247,0.22)" : "rgba(255,255,255,0.04)",
                          border: selectedGenres.includes(genre) ? "1px solid rgba(168,85,247,0.45)" : "1px solid rgba(255,255,255,0.07)",
                          color: selectedGenres.includes(genre) ? "rgba(196,132,252,0.9)" : "rgba(255,255,255,0.28)",
                        }}
                        onMouseEnter={() => soundEngine.hover()}>
                        {genre}
                      </button>
                    ))}
                    {selectedGenres.length > 0 && (
                      <button onClick={() => { setSelectedGenres([]); soundEngine.click(); }}
                        className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer text-white/30 hover:text-white/60"
                        style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                        onMouseEnter={() => soundEngine.hover()}>
                        Clear filters
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status line */}
            <p className="text-[10px] font-mono text-white/18 tracking-wider">
              {isSearching
                ? `Results for "${debouncedQuery}"${selectedGenres.length > 0 ? ` · filtered by ${selectedGenres.join(", ")}` : ""}${!loading && filteredResults.length > 0 ? ` · ${filteredResults.length} titles` : ""}`
                : mode === "trending"
                  ? `Currently trending${selectedGenres.length > 0 ? ` · filtered by ${selectedGenres.join(", ")}` : ""}${!loading && filteredResults.length > 0 ? ` · ${filteredResults.length} titles` : ""}`
                  : `Top upcoming releases${selectedGenres.length > 0 ? ` · filtered by ${selectedGenres.join(", ")}` : ""}${!loading && filteredResults.length > 0 ? ` · ${filteredResults.length} titles` : ""}`
              }
            </p>
          </motion.div>
        </div>

        {error && (
          <div className="text-center py-16 text-white/25 text-sm">
            <p className="text-3xl mb-3">⚠️</p><p>{error}</p>
            <button onClick={() => fetchData(debouncedQuery, mode)} className="mt-4 px-4 py-2 rounded-xl text-xs border border-white/10 text-white/35 hover:text-white/65 cursor-pointer transition-colors">Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !selectedAnime && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="rounded-2xl overflow-hidden aspect-[3/4] animate-pulse" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.07), rgba(236,72,153,0.05))" }} />)}
          </div>
        )}

        {/* Detail view (card selected) */}
        <AnimatePresence mode="wait">
          {selectedAnime && (
            <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <motion.div
                    className="w-14 h-14 rounded-full border-2"
                    style={{ borderColor: "rgba(168,85,247,0.3)", borderTopColor: "#a855f7" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  />
                  <p className="text-white/25 text-xs font-mono tracking-widest">Loading details...</p>
                </div>
              ) : (
                <AnimeDetail
                  anime={selectedAnime}
                  onBack={handleBack}
                  onWatchlistToggle={handleWatchlistToggle}
                  watchStatus={getWatchStatus(selectedAnime.id)}
                />
              )}
            </motion.div>
          )}

          {/* Grid view */}
          {!selectedAnime && !loading && !error && filteredResults.length > 0 && (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
              {filteredResults.map((anime, i) => (
                <AnimeCard key={anime.id} anime={anime} index={i} onSelect={handleAnimeSelect} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && !error && filteredResults.length === 0 && isSearching && (
          <div className="text-center py-20 text-white/20"><p className="text-4xl mb-4">🔮</p><p className="text-sm">No results for "{debouncedQuery}"</p></div>
        )}

        {!loading && !error && results.length > 0 && filteredResults.length === 0 && selectedGenres.length > 0 && (
          <div className="text-center py-16 text-white/20">
            <p className="text-3xl mb-3">🎭</p>
            <p className="text-sm mb-4">No titles match: {selectedGenres.join(" + ")}</p>
            <button onClick={() => setSelectedGenres([])} className="px-4 py-2 rounded-xl text-xs border border-white/10 text-white/35 hover:text-white/65 cursor-pointer transition-colors">Clear genre filter</button>
          </div>
        )}

        {/* Your Anime List */}
        {!selectedAnime && (
          <WatchlistSection
            session={currentSession}
            watchlist={watchlist}
            setWatchlist={setWatchlist}
          />
        )}
      </div>
    </section>
  );
}
