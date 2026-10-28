import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGoogleAdsAccessTokenProvider, getGoogleAdsConfiguration } from "./auth.ts";
import { serviceAccountFixture } from "./test-fixtures.ts";

let fixture: Awaited<ReturnType<typeof serviceAccountFixture>>;
beforeAll(async () => { fixture = await serviceAccountFixture(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

function configuration(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    GOOGLE_ADS_AUTH_MODE: "service_account",
    GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify(fixture.json),
    GOOGLE_ADS_DEVELOPER_TOKEN: "synthetic-developer-token",
    ...overrides,
  };
  return getGoogleAdsConfiguration((name) => env[name]);
}

function provider(overrides: Record<string, string | undefined> = {}) {
  const config = configuration(overrides);
  if (!config.ok) throw new Error("Invalid test configuration");
  return createGoogleAdsAccessTokenProvider(config.value);
}

const tokenResponse = (token = "synthetic-access-token", expires = 3600) =>
  Response.json({ access_token: token, expires_in: expires, token_type: "Bearer" });

describe("Google Ads service account authentication", () => {
  it("uses explicitly selected direct service account access without reading legacy credentials", () => {
    const env: Record<string, string> = {
      GOOGLE_ADS_AUTH_MODE: "service_account",
      GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify(fixture.json),
      GOOGLE_ADS_DEVELOPER_TOKEN: "synthetic-developer-token",
    };
    const readEnv = vi.fn((name: string) => env[name]);
    const result = getGoogleAdsConfiguration(readEnv);
    expect(result.ok && result.value.authMode).toBe("service_account");
    expect(readEnv.mock.calls.flat()).not.toContain("GOOGLE_ADS_REFRESH_TOKEN");
    expect(readEnv.mock.calls.flat()).not.toContain("GOOGLE_ADS_CLIENT_SECRET");
    expect(readEnv.mock.calls.flat()).not.toContain(
      "GOOGLE_ADS_DEVELOPER_TOKEN",
    );
  });

  it.each([undefined, "", "legacy-ignored"])(
    "does not require or read a developer token in either mode: %s",
    (developerToken) => {
      for (const authMode of ["service_account", "oauth"]) {
        const env: Record<string, string | undefined> = {
          GOOGLE_ADS_AUTH_MODE: authMode,
          GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify(fixture.json),
          GOOGLE_ADS_CLIENT_ID: "client",
          GOOGLE_ADS_CLIENT_SECRET: "secret",
          GOOGLE_ADS_REFRESH_TOKEN: "refresh",
          GOOGLE_ADS_DEVELOPER_TOKEN: developerToken,
        };
        const read = vi.fn((name: string) => env[name]);
        const result = getGoogleAdsConfiguration(read);
        expect(result.ok).toBe(true);
        expect(result.ok && result.value).not.toHaveProperty("developerToken");
        expect(read.mock.calls.flat()).not.toContain(
          "GOOGLE_ADS_DEVELOPER_TOKEN",
        );
      }
      expect(configuration({ GOOGLE_ADS_SERVICE_ACCOUNT_JSON: undefined }))
        .toMatchObject({
          ok: false,
          missing: ["GOOGLE_ADS_SERVICE_ACCOUNT_JSON"],
        });
    },
  );

  it("keeps OAuth selected until an explicit mode change and ignores the legacy MCC in SA mode", () => {
    const legacy = configuration({
      GOOGLE_ADS_AUTH_MODE: undefined,
      GOOGLE_ADS_CLIENT_ID: "client",
      GOOGLE_ADS_CLIENT_SECRET: "secret",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    });
    expect(legacy.ok && legacy.value.authMode).toBe("oauth");
    const direct = configuration({
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "5958313391",
    });
    expect(direct.ok && direct.value.loginCustomerId).toBeUndefined();
  });

  it.each([
    "not-json-private-material", "{}", "null", "[]",
    JSON.stringify({ type: "authorized_user", client_secret: "secret" }),
  ])("rejects invalid credential JSON without echoing its contents: %s", (json) => {
    const result = configuration({ GOOGLE_ADS_SERVICE_ACCOUNT_JSON: json });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("not-json-private-material");
    expect(JSON.stringify(result)).not.toContain("client_secret");
  });

  it("rejects credentials with an alternate token URI", () => {
    expect(configuration({ GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify({
      ...fixture.json, token_uri: "https://untrusted.invalid/token",
    }) }).ok).toBe(false);
  });

  it.each([
    { GOOGLE_ADS_AUTH_MODE: "automatic" },
    { GOOGLE_ADS_API_VERSION: "v25/../../other" },
    { GOOGLE_ADS_SERVICE_ACCOUNT_LOGIN_CUSTOMER_ID: "not-an-id" },
  ])("rejects invalid runtime configuration: %j", (overrides) => {
    expect(configuration(overrides).ok).toBe(false);
  });

  it("signs a verifiable RS256 JWT for adwords without a delegated subject", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(init.redirect).toBe("error");
      const params = new URLSearchParams(init.body as URLSearchParams);
      expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(params.has("refresh_token")).toBe(false);
      const [header, payload, signature] = params.get("assertion")!.split(".");
      const decode = (part: string) => Uint8Array.from(atob(part.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
      expect(JSON.parse(new TextDecoder().decode(decode(header)))).toEqual({ alg: "RS256", typ: "JWT" });
      const claims = JSON.parse(new TextDecoder().decode(decode(payload)));
      expect(claims).toEqual({
        iss: fixture.json.client_email,
        scope: "https://www.googleapis.com/auth/adwords",
        aud: "https://oauth2.googleapis.com/token",
        iat: expect.any(Number), exp: expect.any(Number),
      });
      expect(claims.exp - claims.iat).toBe(3600);
      expect(Math.abs(claims.iat - Math.floor(Date.now() / 1000))).toBeLessThan(5);
      expect(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5", fixture.publicKey, decode(signature),
        new TextEncoder().encode(`${header}.${payload}`),
      )).toBe(true);
      return tokenResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider()()).resolves.toBe("synthetic-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shares an exchange between concurrent queries and renews before expiry", async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn().mockImplementationOnce(async () => tokenResponse("first"))
      .mockImplementationOnce(async () => tokenResponse("second"));
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider();
    expect(await Promise.all(Array.from({ length: 8 }, () => getToken()))).toEqual(Array(8).fill("first"));
    now += 3_500_000;
    expect(await getToken()).toBe("first");
    expect(fetchMock).toHaveBeenCalledOnce();
    now += 41_000;
    expect(await Promise.all([getToken(), getToken()])).toEqual(["second", "second"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports explicit invalidation for a rejected access token", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => tokenResponse("first"))
      .mockImplementationOnce(async () => tokenResponse("renewed"));
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider();
    expect(await getToken()).toBe("first");
    expect(await getToken(true)).toBe("renewed");
    expect(await getToken()).toBe("renewed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a signing failure without exposing key material or calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider({ GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify({
      ...fixture.json, private_key: "-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----\n",
    }) });
    await expect(getToken()).rejects.toThrow("JWT signing failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never falls back to OAuth after a failed exchange and permits a subsequent retry", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => Response.json({
      error: "invalid_grant", error_description: "do-not-expose-this-secret",
    }, { status: 400 })).mockImplementationOnce(async () => tokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider({ GOOGLE_ADS_CLIENT_ID: "old", GOOGLE_ADS_CLIENT_SECRET: "old", GOOGLE_ADS_REFRESH_TOKEN: "old" });
    await expect(getToken()).rejects.toThrow(/^Google Ads OAuth token exchange failed: HTTP 400; invalid_grant\.$/);
    await expect(getToken()).resolves.toBe("synthetic-access-token");
    for (const [, init] of fetchMock.mock.calls) {
      expect(new URLSearchParams(init.body).has("refresh_token")).toBe(false);
    }
  });

  it("does not expose unexpected transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret URL?assertion=do-not-expose"); }));
    await expect(provider()()).rejects.toThrow(/^Google Ads OAuth token exchange failed: transport error or timeout\.$/);
  });

  it.each([
    {}, { access_token: "secret", token_type: "Bearer" },
    { access_token: "secret", token_type: "Bearer", expires_in: 0 },
    { access_token: "secret", token_type: "Bearer", expires_in: -1 },
    { access_token: "secret", token_type: "Other", expires_in: 3600 },
  ])("rejects invalid successful token responses: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(provider()()).rejects.toThrow(/^Google Ads OAuth token exchange returned an invalid token response\.$/);
  });

  it("does not expose non-JSON or unknown error bodies", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => new Response("private-key-secret", { status: 502 }))
      .mockImplementationOnce(async () => Response.json({ error: "private-key-secret" }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider();
    await expect(getToken()).rejects.toThrow("HTTP 502; invalid JSON response");
    await expect(getToken()).rejects.toThrow("HTTP 400; UNKNOWN");
  });

  it("uses user OAuth only after explicit operator selection for rollback", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(new URLSearchParams(init.body as URLSearchParams).get("grant_type")).toBe("refresh_token");
      expect(new URLSearchParams(init.body as URLSearchParams).get("refresh_token")).toBe("synthetic-old-refresh-token");
      return tokenResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = provider({
      GOOGLE_ADS_AUTH_MODE: "oauth", GOOGLE_ADS_SERVICE_ACCOUNT_JSON: undefined,
      GOOGLE_ADS_CLIENT_ID: "synthetic-old-client", GOOGLE_ADS_CLIENT_SECRET: "synthetic-old-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "synthetic-old-refresh-token",
    });
    await expect(getToken()).resolves.toBe("synthetic-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
