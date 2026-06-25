import { useState, useEffect, useCallback } from "react";
import Home from "./pages/Home";
import MaintenancePage from "./components/MaintenancePage";
import AdminPanel from "./components/AdminPanel";
import AuthGateway from "./components/AuthGateway";
import { getUserSession, setUserSession, fetchMe, type UserSession } from "./lib/userAuth";

type MaintenanceState = {
  enabled: boolean;
  message: string;
  eta: string;
};

export default function App() {
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [checked, setChecked] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [session, setSession] = useState<UserSession | null>(() => getUserSession());
  const [authError, setAuthError] = useState<string | null>(null);

  const checkMaintenance = useCallback(() => {
    fetch("/api/maintenance")
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (data && typeof data === "object") setMaintenance(data as MaintenanceState);
        setChecked(true);
      });
  }, []);

  // Handle Discord OAuth redirect: ?nw_token=... or ?auth_error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("nw_token");
    const error = params.get("auth_error");

    if (token || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (error) {
      const messages: Record<string, string> = {
        alt_account_blocked: "An account already exists from your network. One account per household.",
        access_denied: "You cancelled the Discord login.",
        token_exchange_failed: "Discord authentication failed. Please try again.",
        server_error: "Server error during login. Please try again.",
        invalid_state: "Security check failed. Please try again.",
      };
      setAuthError(messages[error] ?? `Login failed: ${error}`);
      setTimeout(() => setAuthError(null), 6000);
    }

    if (token) {
      fetchMe(token).then(s => {
        if (s) {
          setUserSession(s);
          setSession(s);
          if (s.role === "admin") {
            setTimeout(() => setAdminPanelOpen(true), 400);
          }
        }
      });
    }

    checkMaintenance();
  }, [checkMaintenance]);

  if (!checked) return null;

  if (maintenance?.enabled) {
    return (
      <>
        <MaintenancePage message={maintenance.message} eta={maintenance.eta} />
        <AuthGateway
          session={session}
          onSessionChange={s => { setSession(s); if (s?.role === "admin") setAdminPanelOpen(true); }}
          forceOpen
        />
        <AdminPanel isOpen={adminPanelOpen} onClose={() => setAdminPanelOpen(false)} onRefresh={checkMaintenance} />
        {authError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-3 rounded-xl text-sm font-mono text-red-300/90 max-w-sm text-center"
            style={{ background: "rgba(30,10,10,0.97)", border: "1px solid rgba(239,68,68,0.35)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
            {authError}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Home session={session} onSessionChange={s => { setSession(s); if (s?.role === "admin") setAdminPanelOpen(true); }} onOpenAdmin={() => setAdminPanelOpen(true)} />
      <AdminPanel isOpen={adminPanelOpen} onClose={() => setAdminPanelOpen(false)} onRefresh={checkMaintenance} />
      {authError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-3 rounded-xl text-sm font-mono text-red-300/90 max-w-sm text-center"
          style={{ background: "rgba(30,10,10,0.97)", border: "1px solid rgba(239,68,68,0.35)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
          {authError}
        </div>
      )}
    </>
  );
}
