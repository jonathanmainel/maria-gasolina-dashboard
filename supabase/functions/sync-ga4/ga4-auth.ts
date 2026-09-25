type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

function encodeBase64Url(input: Uint8Array): string {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON is not configured.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (
    typeof parsed !== "object" || parsed === null ||
    !("client_email" in parsed) || typeof parsed.client_email !== "string" ||
    !("private_key" in parsed) || typeof parsed.private_key !== "string" ||
    !parsed.client_email.endsWith(".iam.gserviceaccount.com") ||
    !parsed.private_key.includes("BEGIN PRIVATE KEY") ||
    ("token_uri" in parsed && parsed.token_uri !== TOKEN_URI)
  ) {
    throw new Error("GA4_SERVICE_ACCOUNT_JSON has invalid service account fields.");
  }
  return parsed as ServiceAccount;
}

export async function getGa4AccessToken(raw: string | undefined): Promise<string> {
  const credentials = parseServiceAccount(raw);
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = encodeBase64Url(encoder.encode(JSON.stringify({
    iss: credentials.client_email,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  })));
  const keyBytes = Uint8Array.from(atob(
    credentials.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
  ), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsigned),
  ));
  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${encodeBase64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`GA4 OAuth token exchange failed: HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" || body === null ||
    !("access_token" in body) || typeof body.access_token !== "string"
  ) throw new Error("GA4 OAuth response is missing an access token.");
  return body.access_token;
}

export type Ga4Report = {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
  metadata?: { timeZone?: string };
};

export async function runGa4Report(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<Ga4Report> {
  if (!/^\d+$/.test(propertyId)) throw new Error("GA4 property ID is invalid.");
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    let code = "UNKNOWN";
    let reason = "UNKNOWN";
    let description = "";
    try {
      const errorBody = await response.json();
      if (typeof errorBody?.error?.status === "string") code = errorBody.error.status;
      if (typeof errorBody?.error?.message === "string") {
        const message = errorBody.error.message as string;
        description = message.includes("has not been used") || message.includes("is disabled")
          ? "API_DISABLED"
          : message.includes("permission") || message.includes("Permission")
          ? "PROPERTY_PERMISSION_DENIED"
          : message.includes("quota")
          ? "QUOTA"
          : "OTHER";
      }
      const details = errorBody?.error?.details;
      if (Array.isArray(details)) {
        const info = details.find((item) => typeof item?.reason === "string");
        if (info) reason = info.reason;
      }
    } catch { /* Preserve only safe status metadata. */ }
    throw new Error(`GA4 Data API HTTP ${response.status} ${code}; reason=${reason}; category=${description}.`);
  }
  return await response.json();
}
