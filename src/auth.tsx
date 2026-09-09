import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const AuthContext = createContext<any>({
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider(props: any) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Processa a sessão e lê os tokens presentes na URL Hash
    supabase.auth.getSession().then((res: any) => {
      setSession(res.data?.session ?? null);
      setLoading(false);
    });

    // Escuta atualizações de login/logout
    const { data } = supabase.auth.onAuthStateChange((event: any, newSession: any) => {
      if (event) {
        // Evento processado
      }
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) return;

    // Garante que a URL enviada ao Supabase seja exatamente a cadastrada no painel
    const redirectUrl = "https://jonathanmainel.github.io/maria-gasolina-dashboard/";

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
      {props.children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
