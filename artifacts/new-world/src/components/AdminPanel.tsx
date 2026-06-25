import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  loadDataSync, saveData, sanitize,
  TIMELINE_ICONS, KANJI_OPTIONS, COLOR_PRESETS,
  type Member, type TimelineItem, type NewsItem, type SiteData,
} from "@/lib/store";
import {
  isAuthed, getToken, getCurrentUser,
  deleteAdminUser,
  type AdminUserRecord,
} from "@/lib/auth";
import { soundEngine } from "@/lib/sound";

async function resizeImage(file: File, maxPx = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/webp", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image failed")); };
    img.src = url;
  });
}

const EMPTY_MEMBER = (): Partial<Member> => ({
  handle: "", role: "", name: "", quote: "", traits: ["", "", ""], avatar: "", kanji: "力", colors: COLOR_PRESETS[0], isAwaiting: false,
});

type Tab = "members" | "timeline" | "news" | "bubbles" | "users" | "site";

const TabIcons: Record<Tab, React.ReactElement> = {
  members: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  timeline: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  news: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>,
  bubbles: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M7 12a5 5 0 0 1 5-5"/><path d="M15 9a3 3 0 0 1 3 3"/></svg>,
  users: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  site: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
};

const GripIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-30 group-hover:opacity-60 transition-opacity">
    <circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>
    <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
    <circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>
  </svg>
);

function MemberForm({ initial, onSave, onCancel, title }: {
  initial: Partial<Member>; onSave: (m: Partial<Member>) => void; onCancel: () => void; title: string;
}) {
  const [m, setM] = useState<Partial<Member>>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgErr, setImgErr] = useState("");

  const ic = "w-full bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-purple-500/50 placeholder-white/15 transition-colors";
  const lc = "text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1 block";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setImgErr("Max 5MB"); return; }
    try { setM(prev => ({ ...prev, avatar: "" })); const b64 = await resizeImage(file); setM(prev => ({ ...prev, avatar: b64 })); setImgErr(""); }
    catch { setImgErr("Image error"); }
  };

  return (
    <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)" }}>
      <p className="text-[10px] font-bold text-purple-300/60 tracking-widest uppercase mb-1">{title}</p>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={!!m.isAwaiting} onChange={e => setM(prev => ({ ...prev, isAwaiting: e.target.checked }))} />
        <span className="text-xs text-white/40">Awaiting slot (empty card)</span>
      </label>
      {!m.isAwaiting && (<>
        <div><label className={lc}>Discord Handle</label><input className={ic} placeholder="@username" maxLength={50} value={m.handle ?? ""} onChange={e => setM(p => ({ ...p, handle: e.target.value }))} /></div>
        <div><label className={lc}>Real Name</label><input className={ic} placeholder="Name" maxLength={80} value={m.name ?? ""} onChange={e => setM(p => ({ ...p, name: e.target.value }))} /></div>
        <div><label className={lc}>Role</label><input className={ic} placeholder="e.g. Tax Deputy" maxLength={80} value={m.role ?? ""} onChange={e => setM(p => ({ ...p, role: e.target.value }))} /></div>
        <div><label className={lc}>Tagline</label><input className={ic} placeholder="Creating chaos since..." maxLength={200} value={m.quote ?? ""} onChange={e => setM(p => ({ ...p, quote: e.target.value }))} /></div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            <div key={i}><label className={lc}>Skill {i + 1}</label>
              <input className={ic} placeholder="Skill" maxLength={40} value={m.traits?.[i] ?? ""} onChange={e => { const t = [...(m.traits || ["", "", ""])] as [string, string, string]; t[i] = e.target.value; setM(p => ({ ...p, traits: t })); }} />
            </div>
          ))}
        </div>
        <div>
          <label className={lc}>Avatar</label>
          <div className="flex gap-2">
            <input className={ic} placeholder="https://..." maxLength={500}
              value={typeof m.avatar === "string" && m.avatar.startsWith("http") ? m.avatar : ""}
              onChange={e => setM(p => ({ ...p, avatar: e.target.value }))} />
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg text-xs border border-white/10 text-white/40 hover:text-white/70 transition-colors shrink-0 cursor-pointer" onMouseEnter={() => soundEngine.hover()}>Upload</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          {imgErr && <p className="text-red-400/60 text-xs mt-1 font-mono">{imgErr}</p>}
          {m.avatar && <img src={m.avatar} alt="" className="w-12 h-12 rounded-full object-cover mt-2 border border-purple-500/30" />}
        </div>
        <div>
          <label className={lc}>Kanji Tag</label>
          <div className="flex flex-wrap gap-1.5">
            {KANJI_OPTIONS.map(k => (
              <button key={k} onClick={() => setM(p => ({ ...p, kanji: k }))} className="w-8 h-8 rounded-lg text-sm font-bold transition-all cursor-pointer"
                style={{ background: m.kanji === k ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.04)", border: m.kanji === k ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)", color: m.kanji === k ? "#c084fc" : "rgba(255,255,255,0.35)" }}>{k}</button>
            ))}
          </div>
        </div>
        <div>
          <label className={lc}>Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_PRESETS.map((c, ci) => (
              <button key={ci} onClick={() => setM(p => ({ ...p, colors: c }))} className="w-7 h-7 rounded-full border-2 transition-all cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})`, borderColor: JSON.stringify(m.colors) === JSON.stringify(c) ? "white" : "transparent" }} />
            ))}
          </div>
        </div>
      </>)}
      <div className="flex gap-2 pt-1">
        <button onClick={() => { soundEngine.uiTone(660, 0.08); onSave(m); }} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer active:scale-[0.97] transition-transform" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white" }} onMouseEnter={() => soundEngine.hover()}>Save</button>
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs text-white/35 hover:text-white/60 border border-white/[0.08] cursor-pointer transition-colors" onMouseEnter={() => soundEngine.hover()}>Cancel</button>
      </div>
    </div>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

export default function AdminPanel({ isOpen, onClose, onRefresh }: { isOpen: boolean; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<Tab>("members");
  const [data, setDataState] = useState<SiteData>(loadDataSync);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [addingTimeline, setAddingTimeline] = useState(false);
  const [newTl, setNewTl] = useState<Partial<TimelineItem>>({ date: "", label: "", icon: "⚡" });
  const [editingTlId, setEditingTlId] = useState<string | null>(null);
  const [editTl, setEditTl] = useState<Partial<TimelineItem>>({});
  const [addingNews, setAddingNews] = useState(false);
  const [newNews, setNewNews] = useState<Partial<NewsItem>>({ date: "", title: "", body: "" });
  const [discordLink, setDiscordLink] = useState("");
  const [saved, setSaved] = useState(false);
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintMessage, setMaintMessage] = useState(""); const [maintEta, setMaintEta] = useState("");
  const [maintSaving, setMaintSaving] = useState(false); const [maintSaved, setMaintSaved] = useState(false);
  const [bubbleBoard, setBubbleBoard] = useState<{ rank: number; discordId: string; username: string; displayName: string; avatarUrl: string; count: number }[]>([]);
  const [bubbleTotal, setBubbleTotal] = useState(0);
  const [resetBubbleMsg, setResetBubbleMsg] = useState("");

  // Users tab state
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [deleteUserTarget, setDeleteUserTarget] = useState("");

  const ic = "w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-purple-500/50 placeholder-white/15 transition-colors";
  const lc = "text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1 block";

  const persistData = useCallback(async (next: SiteData) => {
    const token = getToken(); if (!token) return;
    setSaving(true); setDataState(next);
    const ok = await saveData(next, token);
    setSaving(false); if (ok) onRefresh();
  }, [onRefresh]);

  const loadBubbles = useCallback(async () => {
    try {
      const res = await fetch("/api/bubbles/leaderboard");
      if (res.ok) { const d = await res.json(); setBubbleBoard(d.leaderboard ?? []); setBubbleTotal(d.total ?? 0); }
    } catch {}
  }, []);

  const fetchMaintenance = useCallback(async () => {
    try {
      const res = await fetch("/api/maintenance");
      if (res.ok) { const d = await res.json(); setMaintEnabled(d.enabled ?? false); setMaintMessage(d.message ?? ""); setMaintEta(d.eta ?? ""); }
    } catch {}
  }, []);

  const loadAdminUsers = useCallback(async () => {
    const token = getToken(); if (!token) return;
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAdminUsers(await res.json());
    } catch {}
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !isAuthed()) return;
    setCurrentUser(getCurrentUser());
    fetch("/api/sitedata")
      .then(r => r.ok ? r.json() : null)
      .then(f => { if (f) { setDataState(f); setDiscordLink(f.discordInvite ?? ""); } })
      .catch(() => {});
    Promise.all([fetchMaintenance(), loadBubbles()]);
  }, [isOpen, fetchMaintenance, loadBubbles]);

  useEffect(() => {
    if (isOpen && !discordLink) setDiscordLink(data.discordInvite);
  }, [isOpen, data.discordInvite, discordLink]);

  useEffect(() => {
    if (tab === "users" && isOpen && isAuthed()) loadAdminUsers();
  }, [tab, isOpen, loadAdminUsers]);

  const handleDrop = useCallback(async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const members = [...data.members];
    const fromIdx = members.findIndex(m => m.id === dragId);
    const toIdx = members.findIndex(m => m.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [item] = members.splice(fromIdx, 1);
    members.splice(toIdx, 0, item);
    setDragId(null); setDragOverId(null);
    soundEngine.uiTone(660, 0.07);
    await persistData({ ...data, members });
  }, [dragId, data, persistData]);

  const saveSettings = async () => {
    soundEngine.click(); await persistData({ ...data, discordInvite: sanitize(discordLink) });
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };

  const saveMaintenance = async () => {
    const token = getToken(); if (!token) return; soundEngine.click(); setMaintSaving(true);
    try {
      const res = await fetch("/api/maintenance", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled: maintEnabled, message: maintMessage, eta: maintEta }) });
      if (res.ok) { setMaintSaved(true); setTimeout(() => setMaintSaved(false), 2400); soundEngine.uiTone(maintEnabled ? 440 : 880, 0.14); onRefresh(); }
    } catch {} setMaintSaving(false);
  };

  const addMember = async (nm: Partial<Member>) => {
    if (!nm.handle && !nm.isAwaiting) return;
    const m: Member = { id: `m${Date.now()}`, handle: sanitize(nm.handle || ""), role: sanitize(nm.role || ""), name: sanitize(nm.name || ""), quote: sanitize(nm.quote || ""), traits: [sanitize(nm.traits?.[0] || ""), sanitize(nm.traits?.[1] || ""), sanitize(nm.traits?.[2] || "")] as [string, string, string], avatar: nm.avatar || "", kanji: nm.kanji || "力", colors: nm.colors || COLOR_PRESETS[0], isAwaiting: !!nm.isAwaiting };
    await persistData({ ...data, members: [...data.members, m] });
    setAddingMember(false);
  };

  const editMember = async (id: string, nm: Partial<Member>) => {
    const updated = data.members.map(m => m.id !== id ? m : { ...m, handle: sanitize(nm.handle || ""), role: sanitize(nm.role || ""), name: sanitize(nm.name || ""), quote: sanitize(nm.quote || ""), traits: [sanitize(nm.traits?.[0] || ""), sanitize(nm.traits?.[1] || ""), sanitize(nm.traits?.[2] || "")] as [string, string, string], avatar: nm.avatar || "", kanji: nm.kanji || m.kanji, colors: nm.colors || m.colors, isAwaiting: !!nm.isAwaiting });
    await persistData({ ...data, members: updated });
    setEditingMemberId(null);
  };

  const removeMember = async (id: string) => { soundEngine.click(); await persistData({ ...data, members: data.members.filter(m => m.id !== id) }); };

  const addTimeline = async () => {
    if (!newTl.date || !newTl.label) return;
    soundEngine.uiTone(660, 0.1);
    await persistData({ ...data, timeline: [...data.timeline, { id: `t${Date.now()}`, date: sanitize(newTl.date!), label: sanitize(newTl.label!), icon: newTl.icon || "⚡" }] });
    setNewTl({ date: "", label: "", icon: "⚡" }); setAddingTimeline(false);
  };

  const updateTimeline = async (id: string) => {
    if (!editTl.label) return; soundEngine.uiTone(660, 0.1);
    await persistData({ ...data, timeline: data.timeline.map(t => t.id !== id ? t : { ...t, date: sanitize(editTl.date || t.date), label: sanitize(editTl.label!), icon: editTl.icon || t.icon }) });
    setEditingTlId(null); setEditTl({});
  };

  const removeTl = async (id: string) => { soundEngine.click(); await persistData({ ...data, timeline: data.timeline.filter(t => t.id !== id) }); };

  const addNews = async () => {
    if (!newNews.title) return; soundEngine.uiTone(660, 0.1);
    await persistData({ ...data, news: [{ id: `n${Date.now()}`, date: sanitize(newNews.date || ""), title: sanitize(newNews.title!), body: sanitize(newNews.body || "") }, ...data.news] });
    setNewNews({ date: "", title: "", body: "" }); setAddingNews(false);
  };
  const removeNews = async (id: string) => { soundEngine.click(); await persistData({ ...data, news: data.news.filter(n => n.id !== id) }); };

  const resetBubbles = async () => {
    const token = getToken(); if (!token) return;
    setResetBubbleMsg("");
    try {
      const res = await fetch("/api/bubbles/reset", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setResetBubbleMsg("Leaderboard cleared."); await loadBubbles(); soundEngine.uiTone(440, 0.1); setTimeout(() => setResetBubbleMsg(""), 3000); }
    } catch {}
  };

  const deleteUser = async (discordId: string) => {
    const token = getToken(); if (!token) return;
    const res = await deleteAdminUser(token, discordId);
    if (res.ok) { soundEngine.click(); await loadAdminUsers(); setDeleteUserTarget(""); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "members", label: "Crew" },
    { key: "timeline", label: "Story" },
    { key: "news", label: "News" },
    { key: "bubbles", label: "Bubbles" },
    { key: "users", label: "Users" },
    { key: "site", label: "Site" },
  ];

  const filteredUsers = adminUsers.filter(u =>
    !userSearch ||
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.discordId.includes(userSearch)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-[116] flex flex-col overflow-hidden"
            style={{ width: "min(500px, 100vw)", height: "100dvh", background: "linear-gradient(160deg, rgba(12,5,28,0.99), rgba(4,1,12,0.99))", borderLeft: "1px solid rgba(168,85,247,0.15)", boxShadow: "-24px 0 80px rgba(0,0,0,0.6)" }}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 280, damping: 32 }}>
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.4), rgba(236,72,153,0.3), transparent)" }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] shrink-0">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3), rgba(236,72,153,0.2))" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(196,132,252,0.9)" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </div>
                  <span className="text-sm font-black tracking-widest uppercase" style={{ background: "linear-gradient(135deg, #c084fc, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Command Centre</span>
                </div>
                {currentUser && <p className="text-[10px] text-white/20 font-mono mt-0.5 pl-8">{currentUser}</p>}
                {saving && <p className="text-[10px] text-purple-400/45 font-mono pl-8">Saving...</p>}
              </div>
              <button onClick={onClose} className="text-white/25 hover:text-white/70 transition-colors cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5" onMouseEnter={() => soundEngine.hover()}>×</button>
            </div>

            {/* Tabs — compact to fit all 7 */}
            <div className="flex border-b border-white/[0.05] overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => { soundEngine.click(); setTab(t.key); }}
                  className="flex-shrink-0 flex items-center gap-1 py-2.5 px-2 text-[9px] font-bold tracking-wide uppercase transition-all cursor-pointer whitespace-nowrap"
                  style={{ color: tab === t.key ? "rgba(196,132,252,0.9)" : "rgba(255,255,255,0.22)", borderBottom: tab === t.key ? "2px solid #a855f7" : "2px solid transparent", background: tab === t.key ? "rgba(168,85,247,0.06)" : "transparent" }}
                  onMouseEnter={() => soundEngine.hover()}>
                  <span style={{ color: tab === t.key ? "rgba(196,132,252,0.8)" : "rgba(255,255,255,0.18)" }}>{TabIcons[t.key]}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Panel Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(168,85,247,0.2) transparent" }}>

              {/* CREW TAB */}
              {tab === "members" && (<>
                <p className="text-[10px] font-mono text-white/20 pb-1">Drag the grip handle to reorder crew members.</p>
                <div className="space-y-2">
                  {data.members.map(m => (
                    editingMemberId === m.id ? (
                      <MemberForm key={m.id} initial={m} title="Edit Member" onSave={nm => editMember(m.id, nm)} onCancel={() => setEditingMemberId(null)} />
                    ) : (
                      <motion.div key={m.id} layout
                        draggable={editingMemberId === null}
                        onDragStart={() => setDragId(m.id)}
                        onDragOver={e => { e.preventDefault(); setDragOverId(m.id); }}
                        onDrop={() => handleDrop(m.id)}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        className="flex items-center gap-2 p-3 rounded-xl group cursor-default transition-all"
                        style={{
                          background: dragOverId === m.id && dragId !== m.id ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.025)",
                          border: dragOverId === m.id && dragId !== m.id ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(255,255,255,0.06)",
                          opacity: dragId === m.id ? 0.45 : 1,
                          transition: "opacity 0.15s, border-color 0.15s, background 0.15s",
                        }}>
                        <div className="cursor-grab active:cursor-grabbing text-white/20 shrink-0 pl-0.5" title="Drag to reorder"><GripIcon /></div>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {m.avatar ? <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-purple-500/30 shrink-0" /> : <div className="w-8 h-8 rounded-full bg-white/5 border border-white/[0.08] flex items-center justify-center text-white/20 text-xs shrink-0">{m.kanji || "?"}</div>}
                          <div className="min-w-0">
                            <p className="text-white/70 text-xs font-semibold truncate">{m.isAwaiting ? "Awaiting" : (m.handle || m.name)}</p>
                            <p className="text-white/25 text-[10px] font-mono truncate">{m.isAwaiting ? "Empty slot" : m.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { soundEngine.click(); setEditingMemberId(m.id); }} className="text-purple-400/50 hover:text-purple-400/90 text-[10px] font-mono tracking-widest px-2 py-1 rounded cursor-pointer transition-colors" onMouseEnter={() => soundEngine.hover()}>EDIT</button>
                          <button onClick={() => removeMember(m.id)} className="text-red-400/40 hover:text-red-400/80 text-[10px] font-mono px-2 py-1 rounded cursor-pointer transition-colors" onMouseEnter={() => soundEngine.hover()}>×</button>
                        </div>
                      </motion.div>
                    )
                  ))}
                </div>
                {!addingMember && editingMemberId === null ? (
                  <button onClick={() => { soundEngine.click(); setAddingMember(true); }} className="w-full py-3 rounded-xl text-xs font-bold tracking-widest uppercase border border-dashed border-purple-500/20 text-purple-400/40 hover:border-purple-500/45 hover:text-purple-400/70 transition-all cursor-pointer mt-2" onMouseEnter={() => soundEngine.hover()}>+ Add Member</button>
                ) : addingMember ? (
                  <MemberForm initial={EMPTY_MEMBER()} title="New Member" onSave={addMember} onCancel={() => setAddingMember(false)} />
                ) : null}
              </>)}

              {/* STORY TAB */}
              {tab === "timeline" && (<>
                <div className="space-y-2">
                  {data.timeline.map(item => (
                    editingTlId === item.id ? (
                      <div key={item.id} className="p-4 rounded-xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)" }}>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className={lc}>Date</label><input className={ic} maxLength={30} value={editTl.date ?? item.date} onChange={e => setEditTl(p => ({ ...p, date: e.target.value }))} /></div>
                          <div><label className={lc}>Icon</label>
                            <div className="grid grid-cols-7 gap-1">{TIMELINE_ICONS.slice(0, 14).map(icon => <button key={icon} onClick={() => setEditTl(p => ({ ...p, icon }))} className="h-8 rounded-md text-sm transition-all cursor-pointer" style={{ background: (editTl.icon ?? item.icon) === icon ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.04)", border: (editTl.icon ?? item.icon) === icon ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)" }}>{icon}</button>)}</div>
                          </div>
                        </div>
                        <div><label className={lc}>Label</label><input className={ic} maxLength={200} value={editTl.label ?? item.label} onChange={e => setEditTl(p => ({ ...p, label: e.target.value }))} /></div>
                        <div className="flex gap-2">
                          <button onClick={() => updateTimeline(item.id)} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white" }} onMouseEnter={() => soundEngine.hover()}>Save</button>
                          <button onClick={() => { setEditingTlId(null); setEditTl({}); }} className="px-4 py-2 rounded-xl text-xs text-white/35 border border-white/[0.08] cursor-pointer hover:text-white/60 transition-colors" onMouseEnter={() => soundEngine.hover()}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-xl group" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center gap-3 flex-1 min-w-0"><span className="text-xl shrink-0">{item.icon}</span><div className="min-w-0"><p className="text-white/70 text-xs truncate">{item.label}</p><p className="text-white/25 text-[10px] font-mono">{item.date}</p></div></div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { soundEngine.click(); setEditingTlId(item.id); setEditTl({ date: item.date, label: item.label, icon: item.icon }); }} className="text-purple-400/50 hover:text-purple-400/90 text-[10px] font-mono px-2 py-1 cursor-pointer transition-colors" onMouseEnter={() => soundEngine.hover()}>EDIT</button>
                          <button onClick={() => removeTl(item.id)} className="text-red-400/40 hover:text-red-400/80 text-xs cursor-pointer px-2 transition-colors" onMouseEnter={() => soundEngine.hover()}>×</button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
                {!addingTimeline ? (
                  <button onClick={() => { soundEngine.click(); setAddingTimeline(true); }} className="w-full py-3 rounded-xl text-xs font-bold tracking-widest uppercase border border-dashed border-purple-500/20 text-purple-400/40 hover:border-purple-500/45 hover:text-purple-400/70 transition-all cursor-pointer" onMouseEnter={() => soundEngine.hover()}>+ Add Event</button>
                ) : (
                  <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)" }}>
                    <div><label className={lc}>Date</label><input className={ic} placeholder="Jul 2026" maxLength={30} value={newTl.date} onChange={e => setNewTl(p => ({ ...p, date: e.target.value }))} /></div>
                    <div><label className={lc}>Label</label><input className={ic} placeholder="Event description" maxLength={200} value={newTl.label} onChange={e => setNewTl(p => ({ ...p, label: e.target.value }))} /></div>
                    <div><label className={lc}>Icon</label><div className="grid grid-cols-7 gap-1.5">{TIMELINE_ICONS.map(icon => <button key={icon} onClick={() => setNewTl(p => ({ ...p, icon }))} className="h-9 rounded-lg text-lg transition-all cursor-pointer" style={{ background: newTl.icon === icon ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.04)", border: newTl.icon === icon ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)" }}>{icon}</button>)}</div></div>
                    <div className="flex gap-2">
                      <button onClick={addTimeline} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white" }} onMouseEnter={() => soundEngine.hover()}>Add</button>
                      <button onClick={() => setAddingTimeline(false)} className="px-4 py-2 rounded-xl text-xs text-white/35 border border-white/[0.08] cursor-pointer hover:text-white/60 transition-colors" onMouseEnter={() => soundEngine.hover()}>Cancel</button>
                    </div>
                  </div>
                )}
              </>)}

              {/* NEWS TAB */}
              {tab === "news" && (<>
                <div className="mb-4 p-4 rounded-2xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.12)" }}>
                  <p className="text-[10px] font-bold text-purple-300/50 tracking-widest uppercase">Discord Link</p>
                  <input className={ic} value={discordLink} maxLength={200} onChange={e => setDiscordLink(e.target.value)} placeholder="https://discord.gg/..." />
                  <button onClick={saveSettings} className="w-full py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.98]" style={{ background: saved ? "rgba(16,185,129,0.25)" : "linear-gradient(135deg, #a855f7, #ec4899)", color: "white", border: saved ? "1px solid rgba(16,185,129,0.4)" : "none" }} onMouseEnter={() => soundEngine.hover()}>{saved ? "Saved" : "Save Link"}</button>
                </div>
                <div className="space-y-2.5">
                  {data.news.map(item => (
                    <div key={item.id} className="p-3 rounded-xl group" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex justify-between mb-1"><p className="text-white/65 text-xs font-semibold flex-1 min-w-0 truncate">{item.title}</p><button onClick={() => removeNews(item.id)} className="text-red-400/35 hover:text-red-400/75 text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2" onMouseEnter={() => soundEngine.hover()}>×</button></div>
                      <p className="text-white/20 text-[10px] font-mono">{item.date}</p>
                      <p className="text-white/30 text-[11px] mt-1 leading-relaxed line-clamp-2">{item.body}</p>
                    </div>
                  ))}
                </div>
                {!addingNews ? (
                  <button onClick={() => { soundEngine.click(); setAddingNews(true); }} className="w-full py-3 rounded-xl text-xs font-bold tracking-widest uppercase border border-dashed border-purple-500/20 text-purple-400/40 hover:border-purple-500/45 hover:text-purple-400/70 transition-all cursor-pointer" onMouseEnter={() => soundEngine.hover()}>+ Add News</button>
                ) : (
                  <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)" }}>
                    <div><label className={lc}>Date</label><input className={ic} placeholder="Jun 2026" maxLength={30} value={newNews.date} onChange={e => setNewNews(p => ({ ...p, date: e.target.value }))} /></div>
                    <div><label className={lc}>Title</label><input className={ic} placeholder="Headline" maxLength={200} value={newNews.title} onChange={e => setNewNews(p => ({ ...p, title: e.target.value }))} /></div>
                    <div><label className={lc}>Body</label><textarea className={ic} rows={3} placeholder="Details..." maxLength={1000} value={newNews.body} onChange={e => setNewNews(p => ({ ...p, body: e.target.value }))} /></div>
                    <div className="flex gap-2">
                      <button onClick={addNews} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white" }} onMouseEnter={() => soundEngine.hover()}>Add</button>
                      <button onClick={() => setAddingNews(false)} className="px-4 py-2 rounded-xl text-xs text-white/35 border border-white/[0.08] cursor-pointer hover:text-white/60 transition-colors" onMouseEnter={() => soundEngine.hover()}>Cancel</button>
                    </div>
                  </div>
                )}
              </>)}

              {/* BUBBLES TAB */}
              {tab === "bubbles" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(236,72,153,0.07)", border: "1px solid rgba(236,72,153,0.16)" }}>
                      <p className="text-2xl font-black" style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{bubbleTotal.toLocaleString()}</p>
                      <p className="text-white/35 text-[10px] font-mono mt-1">Total Pops</p>
                    </div>
                    <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.16)" }}>
                      <p className="text-2xl font-black text-purple-300">{bubbleBoard.length}</p>
                      <p className="text-white/35 text-[10px] font-mono mt-1">Players</p>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    {bubbleBoard.length === 0 ? (
                      <div className="py-8 text-center text-white/25 text-xs font-mono">No pops recorded</div>
                    ) : bubbleBoard.map((e, i) => (
                      <div key={e.discordId} className="flex items-center gap-2 justify-between px-4 py-2.5 border-b border-white/[0.04] last:border-0" style={{ background: i === 0 ? "rgba(251,191,36,0.05)" : "transparent" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-white/25 w-5">#{e.rank}</span>
                          <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }} onError={ev => { (ev.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"; }} />
                          <span className="text-white/65 text-xs font-semibold">{e.displayName}</span>
                        </div>
                        <span className="text-xs font-black tabular-nums text-white/50">{e.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={resetBubbles} className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wider cursor-pointer transition-all active:scale-[0.98]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.7)" }} onMouseEnter={() => soundEngine.hover()}>Reset Leaderboard</button>
                  {resetBubbleMsg && <p className="text-center text-emerald-400/70 text-xs font-mono">{resetBubbleMsg}</p>}
                </div>
              )}


              {/* USERS TAB */}
              {tab === "users" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      <input type="text" placeholder="Search members..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="flex-1 bg-transparent text-white/70 placeholder-white/20 text-xs outline-none" />
                    </div>
                    <button onClick={loadAdminUsers} disabled={usersLoading} className="px-3 py-2 rounded-xl text-xs text-white/40 border border-white/[0.08] hover:text-white/70 transition-colors cursor-pointer" onMouseEnter={() => soundEngine.hover()}>
                      {usersLoading ? "..." : "↻"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-mono text-white/25">{filteredUsers.length} member{filteredUsers.length !== 1 ? "s" : ""} registered</p>
                    {adminUsers.length > 0 && (
                      <p className="text-[10px] font-mono text-white/20">{adminUsers.reduce((s, u) => s + u.bubbleCount, 0).toLocaleString()} total pops</p>
                    )}
                  </div>

                  {usersLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />)}
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-10 text-center text-white/20 text-xs font-mono">
                      {userSearch ? "No members found" : "No Discord members registered yet"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredUsers.map(user => (
                        <div key={user.discordId} className="group rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.025)", border: deleteUserTarget === user.discordId ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(255,255,255,0.06)" }}>
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className="relative shrink-0">
                              <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full"
                                style={{ border: "1px solid rgba(168,85,247,0.25)" }}
                                onError={e => { (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"; }}
                              />
                              {user.isAdmin && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)", border: "1.5px solid rgba(4,1,12,1)" }}>
                                  <svg width="7" height="7" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white/75 text-xs font-bold truncate">{user.displayName}</p>
                                {user.country && <span className="text-[9px] font-mono text-white/20 shrink-0">{user.country}</span>}
                                {user.isAdmin && <span className="text-[9px] font-bold tracking-wide uppercase px-1 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "rgba(196,132,252,0.7)" }}>Admin</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[9px] font-mono text-white/20 truncate">@{user.username}</span>
                                <span className="text-[9px] font-mono text-white/20 shrink-0">· {formatTime(user.lastActive)}</span>
                                <span className="text-[9px] font-mono text-pink-400/40 shrink-0">{user.bubbleCount.toLocaleString()} pops</span>
                                {user.altIpCount > 0 && <span className="text-[9px] font-mono text-amber-400/50 shrink-0">⚠ {user.altIpCount} IPs</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!user.isAdmin && (
                                <button
                                  onClick={() => { setDeleteUserTarget(deleteUserTarget === user.discordId ? "" : user.discordId); }}
                                  className="text-red-400/40 hover:text-red-400/80 text-[10px] font-mono px-1.5 py-1 rounded cursor-pointer transition-colors"
                                  onMouseEnter={() => soundEngine.hover()}>×</button>
                              )}
                            </div>
                          </div>
                          {deleteUserTarget === user.discordId && (
                            <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: "rgba(239,68,68,0.06)", borderTop: "1px solid rgba(239,68,68,0.15)" }}>
                              <p className="text-red-400/70 text-[10px] font-mono flex-1">Remove {user.displayName}? Deletes account + bubbles + watchlist.</p>
                              <button onClick={() => deleteUser(user.discordId)} className="px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all" style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.35)", color: "rgba(239,68,68,0.85)" }} onMouseEnter={() => soundEngine.hover()}>Delete</button>
                              <button onClick={() => setDeleteUserTarget("")} className="px-3 py-1 rounded-lg text-[10px] text-white/35 border border-white/[0.08] cursor-pointer hover:text-white/60 transition-colors" onMouseEnter={() => soundEngine.hover()}>Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SITE TAB */}
              {tab === "site" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.14)" }}>
                    <p className="text-[10px] font-bold text-purple-300/55 tracking-widest uppercase">Maintenance Mode</p>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" checked={maintEnabled} onChange={e => setMaintEnabled(e.target.checked)} className="sr-only" />
                        <div className="w-10 h-5 rounded-full transition-colors" style={{ background: maintEnabled ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.1)" }}>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: maintEnabled ? "translateX(20px)" : "translateX(0)" }} />
                        </div>
                      </div>
                      <span className="text-xs text-white/55">{maintEnabled ? "Maintenance active" : "Site is live"}</span>
                    </label>
                    <div><label className={lc}>Message</label><input className={ic} placeholder="We'll be back soon..." maxLength={200} value={maintMessage} onChange={e => setMaintMessage(e.target.value)} /></div>
                    <div><label className={lc}>ETA</label><input className={ic} placeholder="e.g. 30 minutes" maxLength={80} value={maintEta} onChange={e => setMaintEta(e.target.value)} /></div>
                    <button onClick={saveMaintenance} disabled={maintSaving}
                      className="w-full py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.98]"
                      style={{ background: maintSaved ? "rgba(16,185,129,0.25)" : maintEnabled ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.18))", color: maintSaved ? "rgba(52,211,153,0.9)" : maintEnabled ? "rgba(239,68,68,0.9)" : "rgba(196,132,252,0.9)", border: maintSaved ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(168,85,247,0.28)" }}
                      onMouseEnter={() => soundEngine.hover()}>
                      {maintSaving ? "Saving..." : maintSaved ? "Saved" : "Save Maintenance"}
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.14)" }}>
                    <p className="text-[10px] font-bold text-purple-300/55 tracking-widest uppercase">Discord Link</p>
                    <input className={ic} value={discordLink} maxLength={200} onChange={e => setDiscordLink(e.target.value)} placeholder="https://discord.gg/..." />
                    <button onClick={saveSettings} className="w-full py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.98]"
                      style={{ background: saved ? "rgba(16,185,129,0.25)" : "linear-gradient(135deg, #a855f7, #ec4899)", color: "white", border: saved ? "1px solid rgba(16,185,130,0.4)" : "none" }}
                      onMouseEnter={() => soundEngine.hover()}>{saved ? "Saved" : "Save Link"}</button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
