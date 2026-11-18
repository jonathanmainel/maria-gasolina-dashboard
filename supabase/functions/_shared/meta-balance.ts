/** Financial reads only. Never interpret balance, spend_cap or coupons as funds. */
export class BalanceError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export interface BalanceMeasurement {
  amount: string;
  measuredAt: string;
  currency: "BRL";
  parser: "meta-stored-balance-pt-br-v1";
}

export function parseMetaAvailableFunds(payload: unknown, accountId: string): string {
  if (!payload || typeof payload !== "object") throw new BalanceError("META_INVALID_RESPONSE");
  const data = payload as Record<string, unknown>;
  if (data.id !== `act_${accountId}` || data.account_id !== accountId) throw new BalanceError("META_ACCOUNT_MISMATCH");
  if (data.currency !== "BRL") throw new BalanceError("META_CURRENCY_UNSUPPORTED");
  if (data.is_prepay_account !== true) throw new BalanceError("META_NOT_PREPAID");
  const funding = data.funding_source_details as Record<string, unknown> | null;
  if (!funding || funding.type !== 20) throw new BalanceError("META_FUNDING_UNSUPPORTED");
  // Provisional sanitized fixture contract: activation requires confirmation of
  // this exact display format with the real backend credential. No fuzzy parsing.
  const match = typeof funding.display_string === "string"
    ? /^Saldo disponível \(R\$[ \u00a0]((?:0|[1-9]\d{0,2}(?:\.\d{3})*|[1-9]\d*)),(\d{2})\)$/.exec(funding.display_string) : null;
  if (!match) throw new BalanceError("META_BALANCE_FORMAT_UNSUPPORTED");
  const integer = match[1].replaceAll(".", "");
  if (integer.length > 12) throw new BalanceError("META_BALANCE_OUT_OF_RANGE");
  return `${integer}.${match[2]}`;
}

export async function readMetaFundingResponse(options: {
  accountId: string; token: string; version: string; fetcher?: typeof fetch; now?: () => Date;
}): Promise<{ payload: unknown; measuredAt: string }> {
  if (!/^\d{1,30}$/.test(options.accountId) || !/^v\d{1,3}\.0$/.test(options.version) || !options.token)
    throw new BalanceError("BALANCE_CONFIGURATION_ERROR");
  const url = new URL(`https://graph.facebook.com/${options.version}/act_${options.accountId}`);
  url.searchParams.set("fields", "id,account_id,currency,is_prepay_account,funding_source_details");
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: "GET", headers: { Authorization: `Bearer ${options.token}` },
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new BalanceError("META_NETWORK_OR_TIMEOUT"); }
  // Do not retain provider messages, URLs, tokens, payment method details or raw bodies.
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new BalanceError("META_PERMISSION_OR_AUTH");
    throw new BalanceError(response.status === 429 ? "META_RATE_LIMIT" : "META_API_FAILED");
  }
  let text = "";
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new BalanceError("META_INVALID_RESPONSE");
    const decoder = new TextDecoder(); let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new BalanceError("META_INVALID_RESPONSE"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    throw error instanceof BalanceError ? error : new BalanceError("META_NETWORK_OR_TIMEOUT");
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(text); } catch { throw new BalanceError("META_INVALID_RESPONSE"); }
  if (payload?.error) throw new BalanceError("META_PERMISSION_OR_AUTH");
  return { payload, measuredAt: (options.now ?? (() => new Date()))().toISOString() };
}

export async function readMetaAvailableFunds(options: Parameters<typeof readMetaFundingResponse>[0]): Promise<BalanceMeasurement> {
  const { payload, measuredAt } = await readMetaFundingResponse(options);
  const amount = parseMetaAvailableFunds(payload, options.accountId);
  return { amount, currency: "BRL", measuredAt, parser: "meta-stored-balance-pt-br-v1" };
}
