import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { CLIENT_SLUG, isDemoMode } from "./api";
import { reloadDashboardData } from "./data-refresh";
import { getMarketingSyncStatus, requestIntradaySync, type MarketingSource } from "./marketing-sync";

const checkInterval = 30 * 60_000;
const checkOptions = { queryFn: requestIntradaySync, staleTime: 1500, retry: false } as const;

export function useIntradaySync(view: string, today: string) {
  const { session } = useAuth();
  const userId = session?.user?.id as string | undefined;
  const client = useQueryClient();
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const enabled = Boolean(userId) && !isDemoMode && import.meta.env.VITE_ENABLE_INTRADAY_SYNC === "1";
  const queryKey = ["dashboard-intraday", CLIENT_SLUG, userId, today] as const;
  const check = useQuery({
    ...checkOptions, queryKey, enabled: enabled && visible,
    refetchInterval: checkInterval, refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const verify = () => {
      const active = document.visibilityState === "visible";
      setVisible(active);
      if (!active) return;
      const queryKey = ["dashboard-intraday", CLIENT_SLUG, userId, today];
      const state = client.getQueryState(queryKey);
      if (state?.status === "error" && Date.now() - state.errorUpdatedAt < 60_000) return;
      // The query cache coalesces in-flight checks, including StrictMode setup
      // and focus/visibility events from the same interaction.
      void client.fetchQuery({ ...checkOptions, queryKey }).catch(() => {});
    };
    verify();
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", verify);
    return () => {
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", verify);
    };
  }, [client, enabled, today, userId, view]);

  const ids = check.data?.results.flatMap(row =>
    (row.state === "accepted" || row.state === "active") && row.run_id ? [row.run_id] : [],
  ) ?? [];
  const status = useQuery({
    queryKey: ["dashboard-intraday-runs", CLIENT_SLUG, userId, ids.join(",")],
    queryFn: () => getMarketingSyncStatus(ids),
    enabled: enabled && visible && ids.length > 0, retry: false, staleTime: 0,
    refetchInterval: query => {
      const data = query.state.data;
      return !data || data.requested_runs.length < ids.length || data.requested_runs.some(
        run => !run.overdue && (run.status === "queued" || run.status === "running"),
      ) ? 3000 : false;
    },
  });
  const handled = useRef(new Set<string>());
  useEffect(() => {
    handled.current.clear();
  }, [userId, today]);
  useEffect(() => {
    if (check.data?.results.some(row => row.state === "accepted" || row.state === "active")) {
      void client.invalidateQueries({ queryKey: ["marketing-sync", CLIENT_SLUG, userId] });
    }
  }, [check.dataUpdatedAt, client, userId]);

  useEffect(() => {
    if (!enabled || !visible || !check.data) return;
    const changed = new Set<MarketingSource>();
    let recheck = false;
    let lifecycleChanged = false;
    for (const run of status.data?.requested_runs ?? []) {
      if (!run.overdue && !["success", "failed", "indeterminate"].includes(run.status)) continue;
      if (handled.current.has(run.id)) continue;
      if (run.status === "success" || run.status === "failed") handled.current.add(run.id);
      lifecycleChanged = true;
      if (run.status === "success" && run.operation !== "previews" && run.database_write_status !== "no_data") {
        changed.add(run.source);
      }
      // A preview, historical run or old-day collection may have held the same
      // reservation when the page opened. Check D0 again after it releases it.
      if ((run.status === "success" || run.status === "failed") && (run.operation === "previews" || run.range_start > today || run.range_end < today)) recheck = true;
    }
    for (const row of check.data.results) {
      if (row.state !== "fresh" || !row.run_id || handled.current.has(row.run_id)) continue;
      handled.current.add(row.run_id);
      if (row.write_status !== "no_data") changed.add(row.source);
      lifecycleChanged = true;
    }
    if (changed.size) void reloadDashboardData(client, changed).catch(() => {});
    if (lifecycleChanged) void client.invalidateQueries({ queryKey: ["marketing-sync", CLIENT_SLUG, userId] });
    if (recheck) void check.refetch({ cancelRefetch: false });
  }, [check.data, check.refetch, client, enabled, status.data, today, userId, visible]);
}
