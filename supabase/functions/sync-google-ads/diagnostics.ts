export type GoogleAdsStage = "oauth" | "google_ads_api" | "persistence";

const OAUTH_CODES = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "invalid_scope",
  "invalid_request",
  "unsupported_grant_type",
  "access_denied",
  "deleted_client",
  "temporarily_unavailable",
  "server_error",
]);
const API_CODES = new Set([
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "INVALID_ARGUMENT",
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "NOT_FOUND",
  "DEVELOPER_TOKEN_INVALID",
  "DEVELOPER_TOKEN_NOT_APPROVED",
  "DEVELOPER_TOKEN_PROHIBITED",
  "USER_PERMISSION_DENIED",
  "CUSTOMER_NOT_ENABLED",
  "NOT_ADS_USER",
  "LOGIN_CUSTOMER_ID_PARAMETER_MISSING",
  "INVALID_LOGIN_CUSTOMER_ID",
  "CLIENT_CUSTOMER_ID_INVALID",
  "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
  "ACCESS_TOKEN_EXPIRED",
  "OAUTH_TOKEN_INVALID",
  "OAUTH_TOKEN_EXPIRED",
]);

export type GoogleAdsDiagnostic = {
  stage: GoogleAdsStage;
  code: string;
  upstream_status: number | null;
  retryable: boolean;
  subtype?: "invalid_rapt";
};

export class GoogleAdsIntegrationError extends Error {
  constructor(public readonly diagnostic: GoogleAdsDiagnostic) {
    // Never include provider messages, response bodies or credentials.
    super(`Google Ads ${diagnostic.stage}: ${diagnostic.code}`);
    this.name = "GoogleAdsIntegrationError";
  }
}

export function integrationError(
  stage: GoogleAdsStage,
  code: string,
  status: number | null,
) {
  return new GoogleAdsIntegrationError({
    stage,
    code,
    upstream_status: status,
    retryable: [
      "TRANSPORT_ERROR",
      "temporarily_unavailable",
      "server_error",
      "UNAVAILABLE",
      "RESOURCE_EXHAUSTED",
    ].includes(code) || status === 429 ||
      (status !== null && status >= 500),
  });
}

export function oauthFailure(payload: unknown, status: number) {
  const error = (payload as { error?: unknown } | null)?.error;
  const code = typeof error === "string" && OAUTH_CODES.has(error)
    ? error
    : "OAUTH_REJECTED";
  const failure = integrationError("oauth", code, status);
  if (
    (payload as { error_subtype?: unknown } | null)?.error_subtype ===
      "invalid_rapt"
  ) {
    failure.diagnostic.subtype = "invalid_rapt";
  }
  return failure;
}

export function apiFailure(payload: unknown, status: number) {
  const batches = Array.isArray(payload) ? payload : [payload];
  for (const batch of batches) {
    const error = batch?.error;
    for (const detail of Array.isArray(error?.details) ? error.details : []) {
      for (const entry of Array.isArray(detail?.errors) ? detail.errors : []) {
        for (const value of Object.values(entry?.errorCode ?? {})) {
          if (typeof value === "string" && API_CODES.has(value)) {
            return integrationError("google_ads_api", value, status);
          }
        }
      }
    }
    if (typeof error?.status === "string" && API_CODES.has(error.status)) {
      return integrationError("google_ads_api", error.status, status);
    }
  }
  return integrationError("google_ads_api", "API_REJECTED", status);
}

export function safeDiagnostic(
  error: unknown,
  stage: GoogleAdsStage,
): GoogleAdsDiagnostic {
  if (error instanceof GoogleAdsIntegrationError) return error.diagnostic;
  return {
    stage,
    code: "UNEXPECTED_ERROR",
    upstream_status: null,
    retryable: false,
  };
}

// The coordinator accepts only these fields; neither details nor arbitrary codes are persisted.
export function diagnosticSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const d = value as GoogleAdsDiagnostic;
  const stage = ["oauth", "google_ads_api", "persistence"].includes(d.stage)
    ? d.stage
    : null;
  const code = OAUTH_CODES.has(d.code) || API_CODES.has(d.code) ||
      [
        "OAUTH_REJECTED",
        "API_REJECTED",
        "TRANSPORT_ERROR",
        "INVALID_RESPONSE",
        "UNEXPECTED_ERROR",
        "WRITE_FAILED",
      ].includes(d.code)
    ? d.code
    : null;
  const status = d.upstream_status === null
    ? "unknown"
    : Number.isInteger(d.upstream_status) && d.upstream_status >= 100 &&
        d.upstream_status <= 599
    ? String(d.upstream_status)
    : null;
  return stage && code && status
    ? `Google Ads ${stage}: ${code} (upstream HTTP ${status}).`
    : null;
}
