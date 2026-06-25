import { useEffect, useState, useCallback, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { fetchLeaderboard, fetchMyStats, type UserSession, type LeaderboardEntry } from "@/lib/userAuth";

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["#fbbf24", "#e2e8f0", "#f97316"];

export default function BubblesLeaderboard({ session, popTick }: { session: UserSession | null; popTick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [activePlayers, setActivePlayers] = useState(0);
  const [myCount, setMyCount] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const prevTick = useRef(-1);
  const fetchingRef = useRef(false);

  const load = useCallback(async (showLoading = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (showLoading) setLoading(true);
    try {
      const [boardData, stats] = await Promise.all([
        fetchLeaderboard(),
        session ? fetchMyStats(session.token) : Promise.resolve(null),
      ]);
      setBoard(boardData.leaderboard);
      setTotal(boardData.total);
      setActivePlayers(boardData.activePlayers ?? 0);
      if (stats) { setMyCount(stats.bubbleCount); setMyRank(stats.rank); }
      else { setMyCount(0); setMyRank(null); }
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (popTick !== prevTick.current) {
      prevTick.current = popTick;
      load();
    }
  }, [popTick, load]);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const meOnBoard = session && board.some(e => e.discordId === session.discordId);

  return (
    <section id="bubbles" className="py-20 md:py-32 px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 60% 30%, rgba(236,72,153,0.06) 0%, transparent 55%)" }} />
      <div className="max-w-3xl mx-auto">
        <div ref={ref} className="mb-12">
          <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55 }}
            className="text-[10px] font-mono tracking-[0.45em] uppercase mb-3" style={{ color: "rgba(236,72,153,0.55)" }}>
            Pop the bubbles
          </motion.p>
          <motion.h2 initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55, delay: 0.07 }}
            className="text-4xl sm:text-[3.25rem] font-black tracking-[-0.02em] text-white/90 leading-none mb-4">
            Bubble Smashers
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55, delay: 0.14 }}
            className="text-sm text-white/35 leading-relaxed max-w-sm">
            Pop bubbles on the homepage and climb the crew leaderboard. Sign in with Discord to track your rank.
          </motion.p>
        </div>

        {/* Stats row */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.18 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="px-5 py-4 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.08), rgba(168,85,247,0.05))", border: "1px solid rgba(236,72,153,0.15)" }}>
            <p className="text-2xl font-black tabular-nums" style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {loading ? "..." : total.toLocaleString()}
            </p>
            <p className="text-white/35 text-[11px] font-mono mt-1">Total Crew Pops</p>
          </div>
          <div className="px-5 py-4 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.07), rgba(6,182,212,0.04))", border: "1px solid rgba(16,185,129,0.15)" }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: activePlayers > 0 ? "#10b981" : "rgba(255,255,255,0.2)" }} />
              <p className="text-2xl font-black tabular-nums text-emerald-300">{loading ? "..." : activePlayers}</p>
            </div>
            <p className="text-white/35 text-[11px] font-mono mt-1">Active Now</p>
          </div>
          {session ? (
            <div className="px-5 py-4 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(59,130,246,0.05))", border: "1px solid rgba(168,85,247,0.15)" }}>
              <p className="text-2xl font-black tabular-nums text-purple-300">{loading ? "..." : myCount.toLocaleString()}</p>
              <p className="text-white/35 text-[11px] font-mono mt-1">{myRank ? `Your Pops / Rank #${myRank}` : "Your Pops"}</p>
            </div>
          ) : (
            <div className="px-5 py-4 rounded-2xl flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(88,101,242,0.2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(88,101,242,0.5)" stroke="none"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
              <p className="text-white/25 text-[11px] font-mono leading-snug">Sign in with Discord to track your rank</p>
            </div>
          )}
        </motion.div>

        {/* Leaderboard card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.22 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(160deg, rgba(12,5,28,0.96), rgba(4,1,12,0.98))", border: "1px solid rgba(168,85,247,0.1)", boxShadow: "0 0 60px rgba(0,0,0,0.4)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.6)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/45">Top 10 Leaderboard</p>
            </div>
            {loading && <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-500/30 border-t-purple-400/60 animate-spin" />}
          </div>

          {board.length === 0 && !loading ? (
            <div className="py-16 text-center">
              <p className="text-4xl mb-4 opacity-30">🫧</p>
              <p className="text-white/25 text-sm font-mono">No pops recorded yet.</p>
              <p className="text-white/15 text-xs font-mono mt-1">Pop bubbles on the homepage to start!</p>
            </div>
          ) : (
            <div>
              {board.map((entry, i) => {
                const isMe = session?.discordId === entry.discordId;
                const medal = MEDALS[i];
                const medalColor = MEDAL_COLORS[i];
                return (
                  <motion.div key={entry.discordId}
                    initial={{ opacity: 0, translateX: -12 }}
                    animate={inView ? { opacity: 1, translateX: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.28 + i * 0.035 }}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-0 transition-colors"
                    style={{ background: isMe ? "rgba(88,101,242,0.06)" : "transparent" }}>
                    {/* Rank / medal */}
                    <div className="w-8 text-center shrink-0">
                      {medal ? (
                        <span className="text-base">{medal}</span>
                      ) : (
                        <span className="text-[11px] font-black font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.2)" }}>{entry.rank}</span>
                      )}
                    </div>
                    {/* Discord Avatar */}
                    <img
                      src={entry.avatarUrl}
                      alt=""
                      className="w-7 h-7 rounded-full shrink-0"
                      style={{ border: isMe ? "1.5px solid rgba(88,101,242,0.6)" : "1.5px solid rgba(255,255,255,0.08)" }}
                      onError={e => { (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"; }}
                    />
                    {/* Username + you badge */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: medal ? medalColor : isMe ? "rgba(147,162,255,0.9)" : "rgba(255,255,255,0.65)" }}>
                          {entry.displayName}
                        </p>
                        {entry.displayName !== entry.username && (
                          <p className="text-[9px] font-mono text-white/25 truncate">@{entry.username}</p>
                        )}
                      </div>
                      {isMe && (
                        <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "rgba(88,101,242,0.2)", border: "1px solid rgba(88,101,242,0.4)", color: "rgba(147,162,255,0.9)" }}>
                          you
                        </span>
                      )}
                    </div>
                    {/* Pop count */}
                    <p className="text-sm font-black tabular-nums shrink-0" style={{ color: medal ? medalColor : "rgba(255,255,255,0.5)" }}>
                      {entry.count.toLocaleString()}
                    </p>
                  </motion.div>
                );
              })}

              {/* Off-board "you" row */}
              {session && !meOnBoard && myCount > 0 && (
                <div className="flex items-center gap-3 px-5 py-3.5 border-t border-indigo-500/10" style={{ background: "rgba(88,101,242,0.04)" }}>
                  <div className="w-8 text-center shrink-0">
                    <span className="text-[11px] font-black font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>{myRank ?? "..."}</span>
                  </div>
                  <img src={session.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" style={{ border: "1.5px solid rgba(88,101,242,0.4)" }} onError={e => { (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"; }} />
                  <div className="flex-1 flex items-center gap-2">
                    <p className="text-sm font-bold text-indigo-300/75">{session.displayName}</p>
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded-full" style={{ background: "rgba(88,101,242,0.2)", border: "1px solid rgba(88,101,242,0.4)", color: "rgba(147,162,255,0.9)" }}>you</span>
                  </div>
                  <p className="text-sm font-black tabular-nums text-white/50">{myCount.toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
