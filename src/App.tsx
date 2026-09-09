import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { LoginPage, PendingPage } from "./pages/Login";
import { useAuth } from "./auth";
import { isDemoMode } from "./lib/api";
import { supabase } from "./lib/supabase";

const DashboardPage = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage })));

function ProtectedRoute() {
  const { session, loading } = useAuth();
  const membership = useQuery({
    queryKey: ["dashboard-membership", session?.user.id],
    enabled: Boolean(session && supabase && !isDemoMode),
    queryFn: async () => {
      const { data, error } = await supabase!.from("dashboard_clients").select("id, slug").eq("slug", "maria-gasolina").maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  if (isDemoMode) return <Outlet />;
  if (loading || (session && membership.isLoading)) return <div className="screen-state"><img src="/brand/maria-gasolina.svg" alt="Maria Gasolina" /><div className="spinner" /><p>Validando seu acesso...</p></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!membership.data || membership.isError) return <Navigate to="/acesso-pendente" replace />;
  return <Outlet />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/acesso-pendente" element={<PendingPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard/maria-gasolina" element={<Suspense fallback={<div className="screen-state"><div className="spinner" /><p>Preparando o relatório...</p></div>}><DashboardPage /></Suspense>} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
