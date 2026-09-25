import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { buildMunicipalityIndex, prepareImport } from "./domain.ts";
import {
  GEOGRAPHY_SOURCE,
  MUNICIPALITIES,
} from "./municipalities.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ROWS = 5_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CLIENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MUNICIPALITY_INDEX = buildMunicipalityIndex(MUNICIPALITIES);

interface ImportRequest {
  client_slug?: unknown;
  filename?: unknown;
  dry_run?: unknown;
  rows?: unknown;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: CORS_HEADERS,
  });
}

function safeFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const filename = value.trim().split(/[\\/]/u).pop() ?? "";
  if (filename.length === 0 || filename.length > 255) return null;
  return filename;
}

function primaryErrorCode(result: ReturnType<typeof prepareImport>): string {
  return result.error_code ?? result.errors[0]?.code ?? "VALIDATION_FAILED";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error_code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error_code: "PAYLOAD_TOO_LARGE" }, 413);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ ok: false, error_code: "UNAUTHENTICATED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY")
    ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !publicKey || !serviceKey) {
    return json({ ok: false, error_code: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ ok: false, error_code: "UNAUTHENTICATED" }, 401);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ ok: false, error_code: "INVALID_JSON" }, 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error_code: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let body: ImportRequest;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error_code: "INVALID_JSON" }, 400);
  }

  const clientSlug = typeof body.client_slug === "string"
    ? body.client_slug.trim()
    : "";
  const filename = safeFilename(body.filename);
  const dryRun = body.dry_run === true;
  if (!CLIENT_SLUG_PATTERN.test(clientSlug)) {
    return json({ ok: false, error_code: "INVALID_CLIENT_SLUG" }, 400);
  }
  if (!filename) {
    return json({ ok: false, error_code: "INVALID_FILENAME" }, 400);
  }
  if (Array.isArray(body.rows) && body.rows.length > MAX_ROWS) {
    return json({
      ok: false,
      error_code: "TOO_MANY_ROWS",
      max_rows: MAX_ROWS,
    }, 413);
  }

  const { data: client, error: clientError } = await userClient
    .from("dashboard_clients")
    .select("id, slug")
    .eq("slug", clientSlug)
    .eq("active", true)
    .maybeSingle();
  if (clientError) {
    return json({ ok: false, error_code: "CLIENT_LOOKUP_FAILED" }, 500);
  }
  if (!client) {
    return json({ ok: false, error_code: "CLIENT_FORBIDDEN" }, 403);
  }

  const prepared = prepareImport(body.rows, MUNICIPALITY_INDEX);
  const common = {
    client_slug: clientSlug,
    filename,
    dry_run: dryRun,
    summary: prepared.summary,
    errors: prepared.errors,
    geography: GEOGRAPHY_SOURCE,
  };

  if (dryRun) {
    return json({
      ok: prepared.ok,
      status: prepared.ok ? "validated" : "validation_failed",
      error_code: prepared.ok ? null : primaryErrorCode(prepared),
      database_write_performed: false,
      snapshot_replaced: false,
      ...common,
    }, prepared.ok ? 200 : 422);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const completedAt = prepared.ok ? null : new Date().toISOString();
  const { data: importRow, error: importError } = await admin
    .from("dashboard_network_unit_imports")
    .insert({
      client_id: client.id,
      filename,
      status: prepared.ok ? "processing" : "failed",
      ...prepared.summary,
      created_by: userData.user.id,
      error_code: prepared.ok ? null : primaryErrorCode(prepared),
      error_details: prepared.errors,
      geography_source: GEOGRAPHY_SOURCE.repository,
      geography_source_commit: GEOGRAPHY_SOURCE.commit,
      geography_source_checksum: GEOGRAPHY_SOURCE.sourceChecksum,
      completed_at: completedAt,
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return json({
      ok: false,
      error_code: "IMPORT_AUDIT_WRITE_FAILED",
      database_write_performed: false,
      snapshot_replaced: false,
      ...common,
    }, 500);
  }

  if (!prepared.ok) {
    return json({
      ok: false,
      status: "validation_failed",
      error_code: primaryErrorCode(prepared),
      import_id: importRow.id,
      database_write_performed: true,
      snapshot_replaced: false,
      ...common,
    }, 422);
  }

  const { data: replaceResult, error: replaceError } = await admin.rpc(
    "replace_dashboard_network_units",
    {
      p_import_id: importRow.id,
      p_units: prepared.units,
    },
  );

  if (replaceError) {
    await admin
      .from("dashboard_network_unit_imports")
      .update({
        status: "failed",
        error_code: "SNAPSHOT_REPLACE_FAILED",
        error_details: [{
          row: null,
          code: "SNAPSHOT_REPLACE_FAILED",
          message: replaceError.message,
        }],
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRow.id)
      .eq("status", "processing");

    return json({
      ok: false,
      status: "failed",
      error_code: "SNAPSHOT_REPLACE_FAILED",
      import_id: importRow.id,
      database_write_performed: true,
      snapshot_replaced: false,
      ...common,
    }, 500);
  }

  return json({
    ok: true,
    status: "success",
    error_code: null,
    import_id: importRow.id,
    database_write_performed: true,
    snapshot_replaced: true,
    replace_result: replaceResult,
    ...common,
  });
});
