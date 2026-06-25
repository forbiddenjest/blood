import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { clearUserSession, type UserSession } from "@/lib/userAuth";
import { soundEngine } from "@/lib/sound";

// ─── HexesGuard ───────────────────────────────────────────────────────────────

function HexesGuard({ onVerify, onReset }: { onVerify: () => void; onReset: () => void }) {
  const [a, setA] = useState(() => 1 + Math.floor(Math.random() * 50));
  const [b, setB] = useState(() => 1 + Math.floor(Math.random() * 50));
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    setA(1 + Math.floor(Math.random() * 50));
    setB(1 + Math.floor(Math.random() * 50));
    setAnswer(""); setErr(""); onReset();
  }, [onReset]);

  const check = () => {
    if (parseInt(answer, 10) === a + b) { setErr(""); onVerify(); }
    else { setErr("Incorrect. Refreshing..."); setTimeout(refresh, 600); }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(16,185,129,0.25)" }}>
      <div className="px-3.5 py-2.5 flex items-center justify-between" style={{ background: "rgba(16,185,129,0.06)" }}>
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
            <polyline points="12 8 12 12" stroke="rgba(16,185,129,0.8)"/>
            <circle cx="12" cy="16" r="0.5" fill="rgba(16,185,129,0.8)"/>
          </svg>
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "rgba(16,185,129,0.85)" }}>HexesGuard</span>
        </div>
        <span className="text-[9px] font-mono text-emerald-400/40">Verification</span>
      </div>
      <div className="px-3.5 py-3 space-y-2.5" style={{ background: "rgba(16,185,129,0.03)" }}>
        <p className="text-white/50 text-xs">Solve: <span className="font-bold text-white/75">{a} + {b} = ?</span></p>
        <div className="flex gap-2">
          <input
            type="number"
            value={answer}
            onChange={e => { setAnswer(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && check()}
            placeholder="Answer"
            className="flex-1 px-3 py-2 rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(16,185,129,0.2)" }}
          />
          <button onClick={check} className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "rgba(16,185,129,0.9)" }}>
            Verify
          </button>
          <button onClick={refresh} className="px-2.5 py-2 rounded-lg text-xs text-white/30 cursor-pointer transition-colors hover:text-white/60"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} title="New question">↻</button>
        </div>
        {err && <p className="text-red-400/70 text-[10px] font-mono">{err}</p>}
        <p className="text-[9px] text-emerald-400/30 font-mono">Protected by HexesGuard</p>
      </div>
    </div>
  );
}

// ─── Discord button ────────────────────────────────────────────────────────────

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuthGateway({
  session,
  onSessionChange,
  forceOpen = false,
}: {
  session: UserSession | null;
  onSessionChange: (s: UserSession | null) => void;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const captchaKeyRef = useRef(0);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const close = useCallback(() => {
    if (forceOpen) return;
    setOpen(false);
    setCaptchaVerified(false);
    captchaKeyRef.current += 1;
  }, [forceOpen]);

  const handleLoginWithDiscord = () => {
    if (!captchaVerified) return;
    soundEngine.click();
    window.location.href = "/api/auth/discord";
  };

  const handleLogout = () => {
    clearUserSession();
    onSessionChange(null);
    soundEngine.uiTone(440, 0.1);
    if (!forceOpen) setOpen(false);
  };

  const triggerBtn = (
    <button
      onClick={() => { setOpen(true); soundEngine.click(); }}
      className="fixed top-4 right-4 z-[100] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all cursor-pointer"
      style={{
        background: session ? "rgba(88,101,242,0.2)" : "rgba(255,255,255,0.05)",
        border: session ? "1px solid rgba(88,101,242,0.4)" : "1px solid rgba(255,255,255,0.1)",
        color: session ? "rgba(147,162,255,0.9)" : "rgba(255,255,255,0.45)",
        backdropFilter: "blur(8px)",
      }}
      onMouseEnter={() => soundEngine.hover()}
    >
      {session ? (
        <>
          <img src={session.avatarUrl} alt="" className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="max-w-[80px] truncate">{session.displayName}</span>
        </>
      ) : (
        <>
          <DiscordIcon />
          <span>Login</span>
        </>
      )}
    </button>
  );

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={close} />
          <motion.div
            className="relative z-10 w-full max-w-md"
            initial={{ scale: 0.94, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            style={{
              background: "linear-gradient(160deg, rgba(14,6,34,0.99), rgba(5,2,15,0.99))",
              border: "1px solid rgba(168,85,247,0.2)",
              borderRadius: "1.25rem",
              boxShadow: "0 0 0 1px rgba(168,85,247,0.06), 0 40px 80px rgba(0,0,0,0.7), 0 0 60px rgba(168,85,247,0.08)",
            }}>

            {/* Top accent line */}
            <div className="absolute top-0 left-6 right-6 h-px rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, rgba(88,101,242,0.6), rgba(168,85,247,0.4), transparent)" }} />

            {/* Header */}
            <div className="px-6 pt-7 pb-5 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(88,101,242,0.25), rgba(168,85,247,0.15))", border: "1px solid rgba(88,101,242,0.3)" }}>
                  <DiscordIcon />
                </div>
                <div>
                  <p className="text-sm font-black tracking-[0.1em] uppercase text-white/90">
                    {session ? "Your Profile" : forceOpen ? "Enter the New World" : "Access"}
                  </p>
                  <p className="text-[10px] text-white/25 font-mono mt-0.5">
                    {session ? session.displayName : "New World Community"}
                  </p>
                </div>
              </div>
              {!forceOpen && (
                <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/30 hover:text-white/70 hover:bg-white/5 transition-all cursor-pointer" onMouseEnter={() => soundEngine.hover()}>✕</button>
              )}
            </div>

            <div className="px-6 py-6">
              <AnimatePresence mode="wait">
                {session ? (
                  <motion.div key="profile" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
                    <div className="space-y-4">
                      {/* Discord profile card */}
                      <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(88,101,242,0.07)", border: "1px solid rgba(88,101,242,0.2)" }}>
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            <img
                              src={session.avatarUrl}
                              alt=""
                              className="w-16 h-16 rounded-full object-cover"
                              style={{ border: "2px solid rgba(88,101,242,0.5)" }}
                              onError={e => {
                                (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                              }}
                            />
                            {session.role === "admin" && (
                              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", border: "2px solid rgba(5,2,15,1)" }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-white/90 font-black text-base truncate">{session.displayName}</p>
                              {session.role === "admin" && (
                                <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)", color: "rgba(196,132,252,0.9)" }}>
                                  Admin
                                </span>
                              )}
                            </div>
                            <p className="text-white/35 text-xs font-mono">@{session.username}</p>
                            {session.country && <p className="text-white/20 text-[10px] font-mono mt-0.5">{session.country}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(88,101,242,0.7)" strokeWidth="2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                          <p className="text-[10px] text-white/30 font-mono">Connected via Discord</p>
                        </div>
                      </div>

                      <button
                        onClick={handleLogout}
                        className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wider cursor-pointer transition-all hover:bg-red-400/10 border border-white/[0.07] hover:border-red-400/25 text-white/40 hover:text-red-400/70"
                        onMouseEnter={() => soundEngine.hover()}>
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="login" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
                    <div className="space-y-4">
                      <p className="text-white/40 text-xs leading-relaxed text-center">
                        {forceOpen
                          ? "An admin must authenticate to access the site during maintenance."
                          : "Join the crew. Sign in with your Discord account to track bubbles and save your anime watchlist."}
                      </p>

                      {/* HexesGuard */}
                      {!captchaVerified ? (
                        <HexesGuard
                          key={captchaKeyRef.current}
                          onVerify={() => { setCaptchaVerified(true); soundEngine.uiTone(660, 0.08); }}
                          onReset={() => setCaptchaVerified(false)}
                        />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          <p className="text-emerald-400/70 text-[10px] font-mono flex-1">HexesGuard verified</p>
                          <span className="text-[9px] text-emerald-400/30 font-mono">Protected by HexesGuard</span>
                        </div>
                      )}

                      {/* Discord Login Button */}
                      {!captchaVerified ? (
                        <button
                          disabled
                          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-3 opacity-40 cursor-not-allowed"
                          style={{ background: "linear-gradient(135deg, #5865F2, #7289da)", color: "white" }}>
                          <DiscordIcon />
                          Complete HexesGuard First
                        </button>
                      ) : (
                        <button
                          onClick={handleLoginWithDiscord}
                          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
                          style={{ background: "linear-gradient(135deg, #5865F2, #7289da)", color: "white", boxShadow: "0 4px 24px rgba(88,101,242,0.35)" }}
                          onMouseEnter={() => soundEngine.hover()}>
                          <DiscordIcon />
                          Login with Discord
                        </button>
                      )}

                      <p className="text-center text-[9px] text-white/15 font-mono leading-relaxed">
                        We only request your username and avatar.<br/>No messages or server access.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {!open && triggerBtn}
      {createPortal(modal, document.body)}
    </>
  );
}
