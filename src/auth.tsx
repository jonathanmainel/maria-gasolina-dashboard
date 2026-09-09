import { createContext, useContext, useEffect, useState } from "react";
import { appUrl } from "./lib/app-path";
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

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setSession(null);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) {
      throw new Error("A conexão com o Supabase ainda não foi configurada.");
    }

    const redirectTo = new URL(appUrl("auth/callback"), window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) throw error;
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {props.children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
