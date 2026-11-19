import { BalanceError, META_BALANCE_PARSER_VERSION, parseMetaAvailableFunds } from "./meta-balance.ts";
import { META_BALANCE_ACCOUNT_ID } from "./meta-balance-config.ts";

/** No raw display string: preserve only known labels and formatting punctuation. */
export function fundingDisplayShape(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null;
  return value.replace(/Saldo disponível/g, "\u0001").replace(/Available balance/g, "\u0002")
    .replace(/R\$/g, "\u0003").replace(/BRL/g, "\u0004")
    .replace(/[0-9]/g, "#").replace(/[^#.,:() \u00a0\u0001-\u0004]/g, "?")
    // A literal NBSP can be rendered indistinguishably from ASCII space by the
    // dashboard/accessibility tree. Make it explicit without relaxing the parser.
    .replace(/\u00a0/g, "{NBSP}")
    .replace(/\u0001/g, "{AVAILABLE_PT}").replace(/\u0002/g, "{AVAILABLE_EN}")
    .replace(/\u0003/g, "{BRL_SYMBOL}").replace(/\u0004/g, "{BRL_CODE}");
}

export interface DiagnosticDependencies {
  authorize: (req: Request) => Promise<boolean>;
  enabled: boolean;
  expiresAt: string;
  now: () => Date;
  read: () => Promise<{ payload: unknown; measuredAt: string }>;
}

// The quota is intentionally PER RUNTIME INSTANCE, not a distributed counter.
// A global exactly-once quota would require a write, forbidden for this probe.
export function createMetaBalanceDiagnostic(deps: DiagnosticDependencies) {
  let consumed = false;
  const boot = deps.now().getTime();
  const expires = Date.parse(deps.expiresAt);
  return async (req: Request) => {
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    if (req.method !== "POST") return reply({ error_code: "METHOD_NOT_ALLOWED" }, 405);
    try { if (!await deps.authorize(req)) return reply({ error_code: "FORBIDDEN" }, 403); }
    catch { return reply({ error_code: "FORBIDDEN" }, 403); }
    if (!deps.enabled || !Number.isFinite(expires) || expires <= deps.now().getTime() || expires > boot + 15 * 60000)
      return reply({ error_code: "DIAGNOSTIC_DISABLED_OR_EXPIRED" }, 503);
    // No account, token, target URL or arbitrary query can be provided by caller.
    if (req.body) {
      const reader = req.body.getReader(); let size = 0; let text = "";
      const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > 64) { await reader.cancel(); return reply({ error_code: "INVALID_REQUEST" }, 400); }
        text += decoder.decode(value, { stream: true }); }
      text += decoder.decode();
      if (text.trim() && text.trim() !== "{}") return reply({ error_code: "INVALID_REQUEST" }, 400);
    }
    if (consumed) return reply({ error_code: "DIAGNOSTIC_INSTANCE_QUOTA" }, 429);
    consumed = true;
    try {
      const { payload, measuredAt } = await deps.read();
      const data = payload as Record<string, unknown>;
      if (data?.id !== `act_${META_BALANCE_ACCOUNT_ID}` || data.account_id !== META_BALANCE_ACCOUNT_ID) throw new BalanceError("META_ACCOUNT_MISMATCH");
      if (data.currency !== "BRL") throw new BalanceError("META_CURRENCY_UNSUPPORTED");
      if (data.is_prepay_account !== true) throw new BalanceError("META_NOT_PREPAID");
      const funding = data.funding_source_details as Record<string, unknown> | null;
      if (funding?.type !== 20) throw new BalanceError("META_FUNDING_UNSUPPORTED");
      let amount: string | null = null; let parserError: string | null = null;
      try { amount = parseMetaAvailableFunds(payload, META_BALANCE_ACCOUNT_ID); }
      catch (error) { parserError = error instanceof BalanceError ? error.code : "META_INVALID_RESPONSE"; }
      return reply({ account_id: META_BALANCE_ACCOUNT_ID, currency: "BRL", is_prepay_account: true, funding_type: 20,
        measured_at: measuredAt, display_shape: fundingDisplayShape(funding.display_string), parser: META_BALANCE_PARSER_VERSION, parser_accepted: amount !== null,
        available_balance_brl: amount, error_code: parserError, database_write_performed: false });
    } catch (error) { return reply({ error_code: error instanceof BalanceError ? error.code : "META_API_FAILED", database_write_performed: false }, 502); }
  };
}
