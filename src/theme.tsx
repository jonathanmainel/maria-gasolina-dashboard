import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type Theme = "dark" | "light";
interface ThemeContextValue { theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void }

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", setTheme: () => undefined, toggle: () => undefined });
const STORAGE_KEY = "mg-dashboard-theme";

function readInitial(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* ignore */ }
  return "dark";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(readInitial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
