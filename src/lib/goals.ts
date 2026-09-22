import { useCallback, useEffect, useState } from "react";
import { demoGoals } from "../data/demo";
import type { Goals } from "../types";

const KEY = "mg-dashboard-goals-v1";
const listeners = new Set<() => void>();

export function readGoals(): Goals {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...demoGoals, ...(JSON.parse(raw) as Partial<Goals>) };
  } catch { /* ignore */ }
  return demoGoals;
}

export function writeGoals(goals: Goals) {
  try { window.localStorage.setItem(KEY, JSON.stringify(goals)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function resetGoals() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function useGoals(): [Goals, (next: Goals) => void, () => void] {
  const [goals, setGoals] = useState<Goals>(readGoals);
  useEffect(() => {
    const fn = () => setGoals(readGoals());
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const save = useCallback((next: Goals) => writeGoals(next), []);
  return [goals, save, resetGoals];
}
