export type DashboardSource = "google_ads" | "meta_ads";

export type AutomatedTarget = {
  id: number;
  slug: string;
  name: string;
  source: DashboardSource;
  accountIds: string[];
};

type SourceAccountRow = {
  source?: string;
  account_id?: string;
  active?: boolean;
  automation_enabled?: boolean;
  dashboard_clients?:
    | { id: number; slug: string; name: string; active: boolean }
    | Array<{ id: number; slug: string; name: string; active: boolean }>
    | null;
};

function addUtcDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateInTimeZone(
  instant: Date,
  timeZone = "America/Sao_Paulo",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function getLastCompleteDaysRange(
  instant: Date,
  days: number,
  timeZone = "America/Sao_Paulo",
) {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("days must be a positive integer");
  }
  const today = dateInTimeZone(instant, timeZone);
  return {
    startDate: addUtcDays(today, -days),
    endDate: addUtcDays(today, -1),
  };
}

export function uniqueAutomatedTargets(
  rows: SourceAccountRow[],
): AutomatedTarget[] {
  const targets = new Map<string, AutomatedTarget>();
  for (const row of rows) {
    if (
      (row.source !== "google_ads" && row.source !== "meta_ads") ||
      row.active !== true ||
      row.automation_enabled !== true
    ) continue;
    const nested = Array.isArray(row.dashboard_clients)
      ? row.dashboard_clients[0]
      : row.dashboard_clients;
    if (!nested?.active) continue;

    const key = `${nested.id}|${row.source}`;
    const target = targets.get(key) ?? {
      id: nested.id,
      slug: nested.slug,
      name: nested.name,
      source: row.source,
      accountIds: [],
    };

    if (row.account_id && !target.accountIds.includes(row.account_id)) {
      target.accountIds.push(row.account_id);
      target.accountIds.sort();
    }
    targets.set(key, target);
  }
  return [...targets.values()].sort((left, right) =>
    left.id - right.id || left.source.localeCompare(right.source)
  );
}

export function isSuccessfulSync(httpOk: boolean, bodyOk: unknown): boolean {
  return httpOk && bodyOk === true;
}

export async function executeIsolatedTargets<T, R>(
  targets: T[],
  execute: (target: T) => Promise<R>,
) {
  const results: Array<
    | { target: T; ok: true; value: R; error: null }
    | { target: T; ok: false; value: null; error: string }
  > = [];

  for (const target of targets) {
    try {
      results.push({ target, ok: true, value: await execute(target), error: null });
    } catch (error) {
      results.push({
        target,
        ok: false,
        value: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
