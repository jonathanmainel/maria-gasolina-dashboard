import { AlertCircle, ArrowRight, BarChart3, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { isDemoMode } from "../lib/api";
import { brandLogoUrl } from "../lib/app-path";
import { isSupabaseConfigured } from "../lib/supabase";

export function LoginPage() {
  const { session, signIn, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!loading && (session || isDemoMode)) {
    return <Navigate to={`/dashboard/maria-gasolina${isDemoMode ? "?demo=1" : ""}`} replace />;
  }

  const handleLogin = async () => {
    setError(null);
    try {
      await signIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-copy">
          <img src={brandLogoUrl} alt="Maria Gasolina Express" />
          <span>Relatórios de mídia</span>
          <h1>Os números que movem sua marca, em um só lugar.</h1>
          <p>Acompanhe campanhas, investimento e resultados com atualização diária e acesso protegido.</p>
          <div className="auth-feature"><BarChart3 size={20} /><span><strong>Visão integrada</strong>Google Ads e Meta Ads em uma leitura simples.</span></div>
          <div className="auth-feature"><LockKeyhole size={20} /><span><strong>Acesso privado</strong>Somente usuários autorizados pela Maria Gasolina.</span></div>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="login-card">
          <div className="login-logo"><img src={brandLogoUrl} alt="" /></div>
          <p className="eyebrow">Portal de resultados</p>
          <h2>Bem-vindo</h2>
          <p className="login-description">Entre com sua conta Google autorizada para acessar o dashboard.</p>
          {error && <div className="login-error"><AlertCircle size={17} />{error}</div>}
          {!isSupabaseConfigured && !isDemoMode && <div className="login-error"><AlertCircle size={17} />As credenciais públicas do Supabase ainda precisam ser configuradas.</div>}
          <button className="google-button" onClick={() => void handleLogin()} disabled={!isSupabaseConfigured || loading}>
            <span className="google-g">G</span><strong>{loading ? "Verificando acesso..." : "Continuar com Google"}</strong><ArrowRight size={17} />
          </button>
          {import.meta.env.DEV && <Link className="demo-link" to="/dashboard/maria-gasolina?demo=1">Abrir demonstração local</Link>}
          <small>Ao continuar, você concorda com o uso dos seus dados apenas para autenticação e controle de acesso.</small>
        </div>
      </section>
    </main>
  );
}

export function PendingPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);

    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível encerrar a sessão.");
      setIsSigningOut(false);
    }
  };

  return (
    <main className="pending-page">
      <div className="pending-card">
        <img src={brandLogoUrl} alt="Maria Gasolina" />
        <span className="pending-icon"><LockKeyhole size={28} /></span>
        <h1>Acesso pendente</h1>
        <p>Seu login foi reconhecido, mas ainda precisa ser vinculado ao painel Maria Gasolina. Solicite a liberação ao responsável pelo dashboard.</p>
        {error && <div className="login-error"><AlertCircle size={17} />{error}</div>}
        <button className="secondary-button" onClick={() => void handleSignOut()} disabled={isSigningOut}>
          {isSigningOut ? "Saindo..." : "Sair e usar outra conta"}
        </button>
      </div>
    </main>
  );
}
