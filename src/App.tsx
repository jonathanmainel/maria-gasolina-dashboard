import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { LoginPage, PendingPage } from "./pages/Login";
import { useAuth } from "./auth";
import { isDemoMode } from "./lib/api";
import { brandLogoUrl } from "./lib/app-path";
import { supabase } from "./lib/supabase";

const DashboardPage = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage })));

function ScreenState({ message }: { message: string }) {
  return <div className="screen-state"><img src={brandLogoUrl} alt="Maria Gasolina" /><div className="spinner" /><p>{message}</p></div>;
}

function AuthCallback() {
  const { session, loading } = useAuth();
  const [exchangeComplete, setExchangeComplete] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (!code || !supabase) {
      setExchangeComplete(true);
      return;
    }

    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setExchangeError(error.message);
      setExchangeComplete(true);
    });
  }, []);

  if (!exchangeComplete || loading) return <ScreenState message="Concluindo seu login..." />;

  if (exchangeError) {
    return (
      <main className="pending-page">
        <div className="pending-card">
          <span className="pending-icon">!</span>
          <h1>Não foi possível concluir o login</h1>
          <p>{exchangeError}</p>
          <Link className="secondary-button" to="/login">Voltar para o login</Link>
        </div>
      </main>
    );
  }

  return <Navigate to={session ? "/dashboard/maria-gasolina" : "/login"} replace />;
}

function ProtectedRoute() {
  const { session, loading } = useAuth();
  const membership = useQuery({
    queryKey: ["dashboard-membership", session?.user.id],
    enabled: Boolean(session && supabase && !isDemoMode),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("dashboard_client_users")
        .select("client_id")
        .eq("user_id", session!.user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    retry: false,
  });

  if (isDemoMode) return <Outlet />;
  if (loading || (session && membership.isLoading)) return <ScreenState message="Validando seu acesso..." />;
  if (!session) return <Navigate to="/login" replace />;
  if (!membership.data || membership.isError) return <Navigate to="/acesso-pendente" replace />;
  return <Outlet />;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<AuthCallback />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/acesso-pendente" element={<PendingPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard/maria-gasolina" element={<Suspense fallback={<ScreenState message="Preparando o relatório..." />}><DashboardPage /></Suspense>} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
