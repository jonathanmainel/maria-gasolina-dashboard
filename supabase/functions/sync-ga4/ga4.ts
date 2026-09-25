import { type Ga4Report, runGa4Report } from "./ga4-auth.ts";

const PAGE_SIZE = 10000;
const MAX_ROWS = 100000;

type ReportRow = NonNullable<Ga4Report["rows"]>[number];
type Dataset = "daily" | "acquisition" | "events" | "landing_pages";

const REPORTS: Record<Dataset, { dimensions: string[]; metrics: string[] }> = {
  daily: {
    dimensions: ["date"],
    metrics: ["sessions", "engagedSessions", "activeUsers", "newUsers", "screenPageViews", "eventCount", "keyEvents", "totalRevenue"],
  },
  acquisition: {
    dimensions: ["date", "sessionDefaultChannelGroup", "sessionSourceMedium"],
    metrics: ["sessions", "engagedSessions", "newUsers", "screenPageViews", "eventCount", "keyEvents"],
  },
  events: {
    dimensions: ["date", "eventName", "sessionDefaultChannelGroup", "sessionSourceMedium"],
    metrics: ["eventCount", "keyEvents"],
  },
  landing_pages: {
    dimensions: ["date", "landingPage"],
    metrics: ["sessions", "engagedSessions", "activeUsers", "newUsers", "screenPageViews", "eventCount", "keyEvents"],
  },
};

export type Ga4Datasets = {
  daily: Array<Record<string, unknown>>;
  acquisition: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  landing_pages: Array<Record<string, unknown>>;
};

function dimension(row: ReportRow, index: number): string {
  return row.dimensionValues?.[index]?.value ?? "";
}

function metric(row: ReportRow, index: number): number {
  const value = Number(row.metricValues?.[index]?.value ?? 0);
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid GA4 metric value.");
  return value;
}

function metricDate(row: ReportRow): string {
  const value = dimension(row, 0);
  if (!/^\d{8}$/.test(value)) throw new Error("Invalid GA4 date dimension.");
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

function label(value: string): string {
  return value.trim() || "(not set)";
}

export function normalizeGa4Rows(dataset: Dataset, rows: ReportRow[], accountId: string): Array<Record<string, unknown>> {
  const normalized = rows.map((row) => {
    const base = { account_id: accountId, metric_date: metricDate(row) };
    switch (dataset) {
      case "daily":
        return {
          ...base, sessions: metric(row, 0), engaged_sessions: metric(row, 1),
          active_users: metric(row, 2), new_users: metric(row, 3), views: metric(row, 4),
          events: metric(row, 5), conversions: metric(row, 6), revenue: metric(row, 7),
          extra_metrics: { key_events: metric(row, 6) },
        };
      case "acquisition":
        return {
          ...base, channel_group: label(dimension(row, 1)), source_medium: label(dimension(row, 2)),
          sessions: metric(row, 0), engaged_sessions: metric(row, 1), new_users: metric(row, 2),
          views: metric(row, 3), events: metric(row, 4), key_events: metric(row, 5),
        };
      case "events":
        return {
          ...base, event_name: label(dimension(row, 1)),
          channel_group: label(dimension(row, 2)), source_medium: label(dimension(row, 3)),
          event_count: metric(row, 0), key_events: metric(row, 1),
        };
      case "landing_pages":
        return {
          ...base, landing_page: label(dimension(row, 1)),
          sessions: metric(row, 0), engaged_sessions: metric(row, 1), active_users: metric(row, 2),
          new_users: metric(row, 3), views: metric(row, 4), events: metric(row, 5),
          key_events: metric(row, 6), primary_conversions: null,
        };
    }
  });
  return normalized.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function fetchGa4Dataset(
  accessToken: string,
  propertyId: string,
  dataset: Dataset,
  startDate: string,
  endDate: string,
): Promise<{ rows: Array<Record<string, unknown>>; timeZone: string | null }> {
  const spec = REPORTS[dataset];
  const raw: ReportRow[] = [];
  let timeZone: string | null = null;
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const report = await runGa4Report(accessToken, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: spec.dimensions.map((name) => ({ name })),
      metrics: spec.metrics.map((name) => ({ name })),
      limit: String(PAGE_SIZE), offset: String(offset),
      keepEmptyRows: false,
    });
    timeZone = report.metadata?.timeZone ?? timeZone;
    raw.push(...(report.rows ?? []));
    if (raw.length >= MAX_ROWS) throw new Error(`GA4 ${dataset} report exceeds row safety limit.`);
    if (raw.length >= (report.rowCount ?? raw.length) || (report.rows ?? []).length < PAGE_SIZE) break;
  }
  return { rows: normalizeGa4Rows(dataset, raw, propertyId), timeZone };
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchGa4FormAudit(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ event_name: string; page_path: string; event_count: number }>> {
  const report = await runGa4Report(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }, { name: "pagePath" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: ["form_start", "form_submit", "form_submit_sindicos", "generate_lead"] },
      },
    },
    limit: String(PAGE_SIZE),
  });
  if ((report.rowCount ?? 0) > PAGE_SIZE) throw new Error("GA4 form audit exceeds row safety limit.");
  return (report.rows ?? []).map((row) => ({
    event_name: dimension(row, 0), page_path: label(dimension(row, 1)),
    event_count: metric(row, 0),
  })).sort((a, b) => a.event_name.localeCompare(b.event_name) || b.event_count - a.event_count || a.page_path.localeCompare(b.page_path));
}
