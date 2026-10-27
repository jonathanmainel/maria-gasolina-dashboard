import type { GoogleAdsCredentials } from "./google-ads.ts";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const REFRESH_MARGIN_MS = 60_000;

type ServiceAccount = { clientEmail: string; privateKey: string };
export type GoogleAdsConfiguration = GoogleAdsCredentials & (
  | { authMode: "service_account"; serviceAccount: ServiceAccount }
  | {
    authMode: "oauth";
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }
);

type ConfigurationResult =
  | { ok: true; value: GoogleAdsConfiguration }
  | { ok: false; missing: string[]; invalid?: string };

export class GoogleAdsAuthError extends Error {}

function parseServiceAccount(raw: string): ServiceAccount {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GoogleAdsAuthError("GOOGLE_ADS_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (
    typeof value !== "object" || value === null ||
    !("type" in value) || value.type !== "service_account" ||
    !("client_email" in value) || typeof value.client_email !== "string" ||
    !/^[a-z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(value.client_email) ||
    !("private_key" in value) || typeof value.private_key !== "string" ||
    !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\s*$/.test(value.private_key) ||
    ("token_uri" in value && value.token_uri !== TOKEN_URI)
  ) {
    throw new GoogleAdsAuthError("GOOGLE_ADS_SERVICE_ACCOUNT_JSON has invalid service account fields.");
  }
  return { clientEmail: value.client_email, privateKey: value.private_key };
}

export function getGoogleAdsConfiguration(
  readEnv: (name: string) => string | undefined,
): ConfigurationResult {
  // Switching identity is an explicit operational action, separate from deploy.
  const authMode = readEnv("GOOGLE_ADS_AUTH_MODE") ?? "oauth";
  if (authMode !== "service_account" && authMode !== "oauth") {
    return {
      ok: false,
      missing: [],
      invalid: "GOOGLE_ADS_AUTH_MODE must be service_account or oauth.",
    };
  }
  const requiredNames = authMode === "service_account"
    ? ["GOOGLE_ADS_SERVICE_ACCOUNT_JSON"]
    : [
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
    ];
  const values = Object.fromEntries(
    requiredNames.map((name) => [name, readEnv(name)]),
  );
  const missing = requiredNames.filter((name) => !values[name]?.trim());
  if (missing.length) return { ok: false, missing };

  const apiVersion = readEnv("GOOGLE_ADS_API_VERSION") ?? "v25";
  if (!/^v\d+$/.test(apiVersion)) {
    return {
      ok: false,
      missing: [],
      invalid:
        "GOOGLE_ADS_API_VERSION must use a major REST version such as v25.",
    };
  }
  const loginCustomerIdName = authMode === "service_account"
    ? "GOOGLE_ADS_SERVICE_ACCOUNT_LOGIN_CUSTOMER_ID"
    : "GOOGLE_ADS_LOGIN_CUSTOMER_ID";
  const loginCustomerId = readEnv(loginCustomerIdName)?.trim() || undefined;
  if (
    loginCustomerId && !/^(?:\d{10}|\d{3}-\d{3}-\d{4})$/.test(loginCustomerId)
  ) {
    return {
      ok: false,
      missing: [],
      invalid:
        `${loginCustomerIdName} must be a ten-digit customer ID, optionally dashed.`,
    };
  }
  // Developer tokens have been optional and ignored since 2026-09-09.
  // Do not read or forward a legacy credential that has no authorization role.
  const common = { apiVersion, loginCustomerId };
  if (authMode === "oauth") {
    return {
      ok: true,
      value: {
        ...common,
        authMode,
        clientId: values.GOOGLE_ADS_CLIENT_ID!,
        clientSecret: values.GOOGLE_ADS_CLIENT_SECRET!,
        refreshToken: values.GOOGLE_ADS_REFRESH_TOKEN!,
      },
    };
  }
  try {
    return {
      ok: true,
      value: {
        ...common,
        authMode,
        serviceAccount: parseServiceAccount(
          values.GOOGLE_ADS_SERVICE_ACCOUNT_JSON!,
        ),
      },
    };
  } catch (error) {
    return {
      ok: false,
      missing: [],
      invalid: error instanceof GoogleAdsAuthError
        ? error.message
        : "Invalid Google Ads authentication configuration.",
    };
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function createAssertion(account: ServiceAccount): Promise<string> {
  try {
    const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + 3600,
    })}`;
    const pem = account.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    const key = await crypto.subtle.importKey(
      "pkcs8", Uint8Array.from(atob(pem), (char) => char.charCodeAt(0)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  } catch {
    throw new GoogleAdsAuthError("Google Ads service account JWT signing failed; check the configured private key.");
  }
}

const OAUTH_ERRORS = new Set([
  "invalid_grant", "invalid_client", "invalid_scope", "unauthorized_client",
  "invalid_request", "access_denied", "temporarily_unavailable", "server_error",
]);

async function exchangeAccessToken(config: GoogleAdsConfiguration) {
  const params = config.authMode === "service_account"
    ? new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await createAssertion(config.serviceAccount),
    })
    : new URLSearchParams({
      grant_type: "refresh_token", client_id: config.clientId,
      client_secret: config.clientSecret, refresh_token: config.refreshToken,
    });
  let response: Response;
  const requestedAt = Date.now();
  try {
    response = await fetch(TOKEN_URI, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: params,
    });
  } catch {
    throw new GoogleAdsAuthError("Google Ads OAuth token exchange failed: transport error or timeout.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleAdsAuthError(`Google Ads OAuth token exchange failed: HTTP ${response.status}; invalid JSON response.`);
  }
  if (!response.ok) {
    const code = typeof payload === "object" && payload !== null && "error" in payload &&
        typeof payload.error === "string" && OAUTH_ERRORS.has(payload.error)
      ? payload.error : "UNKNOWN";
    throw new GoogleAdsAuthError(`Google Ads OAuth token exchange failed: HTTP ${response.status}; ${code}.`);
  }
  if (
    typeof payload !== "object" || payload === null ||
    !("access_token" in payload) || typeof payload.access_token !== "string" || !payload.access_token.trim() ||
    !("expires_in" in payload) || typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) || payload.expires_in <= 0 ||
    !("token_type" in payload) || payload.token_type !== "Bearer"
  ) {
    throw new GoogleAdsAuthError("Google Ads OAuth token exchange returned an invalid token response.");
  }
  return { value: payload.access_token, expiresAt: requestedAt + payload.expires_in * 1000 };
}

// Cache only inside one invocation. No credential or token is persisted or logged.
// Concurrent GAQL queries share one exchange; failures never switch auth modes.
export function createGoogleAdsAccessTokenProvider(
  config: GoogleAdsConfiguration,
) {
  let cached: { value: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;
  return (forceRefresh = false): Promise<string> => {
    if (forceRefresh) cached = undefined;
    if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
      return Promise.resolve(cached.value);
    }
    if (!pending) {
      pending = exchangeAccessToken(config).then((token) => {
        cached = token;
        return token.value;
      }).finally(() => {
        pending = undefined;
      });
    }
    return pending;
  };
}
