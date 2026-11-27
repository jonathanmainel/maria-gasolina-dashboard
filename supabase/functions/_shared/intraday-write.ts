type Admin = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export async function saveIntradayMetrics(
  admin: Admin, runId: string | undefined, batches: Record<string, unknown[]>, diagnostics: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc("save_dashboard_intraday_metrics", { p_run_id: runId, p_batches: batches });
  if (error || (data !== "success" && data !== "no_data")) {
    // A transport/gateway error can arrive after a commit. Let the runner keep
    // the reservation indeterminate until the database can confirm the result.
    const databaseRejected = /^[0-9A-Z]{5}$/.test(error?.code ?? "") && !error?.code?.startsWith("PGRST");
    return Response.json({
      ok: !databaseRejected, error_code: "INTRADAY_WRITE_FAILED", database_write_status: null,
    }, { status: databaseRejected ? 500 : 503 });
  }
  return Response.json({
    ok: true, database_write_performed: data === "success", database_write_status: data, ...diagnostics,
  });
}
