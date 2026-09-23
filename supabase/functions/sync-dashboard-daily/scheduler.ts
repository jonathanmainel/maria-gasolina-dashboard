export type AutomatedClient = { id: number; slug: string; name: string };

type SourceAccountRow = {
  source?: string;
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

export function uniqueAutomatedClients(
  rows: SourceAccountRow[],
): AutomatedClient[] {
  const clients = new Map<number, AutomatedClient>();
  for (const row of rows) {
    if (
      row.source !== "google_ads" || row.active !== true ||
      row.automation_enabled !== true
    ) continue;
    const nested = Array.isArray(row.dashboard_clients)
      ? row.dashboard_clients[0]
      : row.dashboard_clients;
    if (!nested?.active || clients.has(nested.id)) continue;
    clients.set(nested.id, {
      id: nested.id,
      slug: nested.slug,
      name: nested.name,
    });
  }
  return [...clients.values()].sort((left, right) => left.id - right.id);
}

export function isSuccessfulSync(httpOk: boolean, bodyOk: unknown): boolean {
  return httpOk && bodyOk === true;
}
