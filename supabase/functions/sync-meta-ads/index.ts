import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type SyncMetaAdsRequest = {
  client_slug?: string;
  start_date?: string;
  end_date?: string;
  dry_run?: boolean;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export default {
  fetch: withSupabase(
    { auth: ["publishable", "secret"] },
    async (req) => {
      if (req.method !== "POST") {
        return Response.json(
          {
            ok: false,
            error: "Method not allowed. Use POST.",
          },
          { status: 405 },
        );
      }

      let body: SyncMetaAdsRequest;

      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            ok: false,
            error: "Invalid JSON body.",
          },
          { status: 400 },
        );
      }

      const {
        client_slug,
        start_date,
        end_date,
        dry_run,
      } = body;

      if (!client_slug) {
        return Response.json(
          {
            ok: false,
            error: "client_slug is required.",
          },
          { status: 400 },
        );
      }

      if (!start_date || !isValidDate(start_date)) {
        return Response.json(
          {
            ok: false,
            error: "start_date must be a valid YYYY-MM-DD date.",
          },
          { status: 400 },
        );
      }

      if (!end_date || !isValidDate(end_date)) {
        return Response.json(
          {
            ok: false,
            error: "end_date must be a valid YYYY-MM-DD date.",
          },
          { status: 400 },
        );
      }

      if (start_date > end_date) {
        return Response.json(
          {
            ok: false,
            error: "start_date cannot be after end_date.",
          },
          { status: 400 },
        );
      }

      if (dry_run !== true) {
        return Response.json(
          {
            ok: false,
            error:
              "For now, dry_run must be true. Database writes are disabled.",
          },
          { status: 400 },
        );
      }

      const metaAdAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
      const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");

      return Response.json({
        ok: true,
        mode: "dry_run",

        request: {
          client_slug,
          start_date,
          end_date,
          dry_run,
        },

        meta_configuration: {
          account_configured: Boolean(metaAdAccountId),
          account_id: metaAdAccountId ?? null,
          token_configured: Boolean(metaAccessToken),
        },

        meta_api_called: false,
        database_write_performed: false,

        message:
          "Meta Ads configuration validated. No external API call or database write was performed.",
      });
    },
  ),
};
