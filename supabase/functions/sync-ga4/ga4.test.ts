import { afterEach, describe, expect, it, vi } from "vitest";
import { getGa4AccessToken, runGa4Report } from "./ga4-auth.ts";
import { fetchGa4Dataset, normalizeGa4Rows, sha256 } from "./ga4.ts";

const row = (dimensions: string[], metrics: string[]) => ({
  dimensionValues: dimensions.map((value) => ({ value })),
  metricValues: metrics.map((value) => ({ value })),
});

describe("GA4 native ingestion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a missing or malformed service account without calling Google", async () => {
    await expect(getGa4AccessToken(undefined)).rejects.toThrow("not configured");
    await expect(getGa4AccessToken("{}")) .rejects.toThrow("invalid service account fields");
  });

  it("signs a service-account assertion and exchanges it without exposing credentials", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateBytes).toString("base64")}\n-----END PRIVATE KEY-----`;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const params = new URLSearchParams(init.body as string);
      expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(params.get("assertion")?.split(".")).toHaveLength(3);
      return Response.json({ access_token: "test-access-token" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getGa4AccessToken(JSON.stringify({
      client_email: "test@project.iam.gserviceaccount.com",
      private_key: pem,
      token_uri: "https://oauth2.googleapis.com/token",
    }));
    expect(result).toBe("test-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("normalizes daily metrics without inventing paid-media metrics", () => {
    const daily = normalizeGa4Rows("daily", [row(
      ["20260922"], ["59", "30", "51", "50", "77", "339", "0", "0"],
    )], "508003193");
    expect(daily[0]).toMatchObject({
      metric_date: "2026-09-22", sessions: 59, engaged_sessions: 30,
      active_users: 51, new_users: 50, views: 77, events: 339, conversions: 0,
    });
    expect(daily[0]).not.toHaveProperty("spend");
    expect(daily[0]).not.toHaveProperty("clicks");
  });

  it("normalizes acquisition, events and landing page paths separately", () => {
    const acquisition = normalizeGa4Rows("acquisition", [row(
      ["20260922", "Organic Search", "google / organic"], ["6", "2", "3", "7", "26", "0"],
    )], "508003193");
    const events = normalizeGa4Rows("events", [row(
      ["20260922", "form_submit", "Organic Search", "google / organic"], ["4", "0"],
    )], "508003193");
    const pages = normalizeGa4Rows("landing_pages", [row(
      ["20260922", "/contato"], ["6", "2", "5", "3", "7", "26", "0"],
    )], "508003193");
    expect(acquisition[0]).toMatchObject({ channel_group: "Organic Search", source_medium: "google / organic", sessions: 6 });
    expect(events[0]).toMatchObject({ event_name: "form_submit", event_count: 4, key_events: 0 });
    expect(pages[0]).toMatchObject({ landing_page: "/contato", primary_conversions: null });
  });

  it("uses a stable hash for identical normalized payloads", async () => {
    expect(await sha256([{ metric_date: "2026-09-22" }])).toBe(await sha256([{ metric_date: "2026-09-22" }]));
    expect(await sha256([{ metric_date: "2026-09-22" }])).not.toBe(await sha256([{ metric_date: "2026-09-23" }]));
  });

  it("fetches a date-bounded report and preserves the property timezone", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.dateRanges).toEqual([{ startDate: "2026-09-22", endDate: "2026-09-23" }]);
      expect(body.dimensions).toEqual([{ name: "date" }]);
      return Response.json({
        rowCount: 1, metadata: { timeZone: "America/Sao_Paulo" },
        rows: [row(["20260922"], ["59", "30", "51", "50", "77", "339", "0", "0"])],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchGa4Dataset("test-token", "508003193", "daily", "2026-09-22", "2026-09-23");
    expect(result.timeZone).toBe("America/Sao_Paulo");
    expect(result.rows).toHaveLength(1);
  });

  it("reports Google API failures with status codes and no response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: { status: "PERMISSION_DENIED", message: "Permission denied for test@example.com" },
    }, { status: 403 })));
    await expect(runGa4Report("test-token", "508003193", {}))
      .rejects.toThrow("GA4 Data API HTTP 403 PERMISSION_DENIED");
  });
});
