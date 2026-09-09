import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const AuthContext = createContext<any>({
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: any }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Processa a sessão e captura tokens da URL
    supabase.auth.getSession().then((res: any) => {
      setSession(res.data?.session ?? null);
      setLoading(false);
    });

    // Escuta mudanças no estado de login
    const { data } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) return;

    // Redireciona removendo a subrota /login para voltar à raiz
    const origin = window.location.origin;
    const basePath = window.location.pathname.replace(/\/login\/?$/, "");

    const redirectUrl = import.meta.env.VITE_SITE_URL
      ? `${import.meta.env.VITE_SITE_URL.replace(/\/$/, "")}/`
      : `${origin}${basePath}/`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
