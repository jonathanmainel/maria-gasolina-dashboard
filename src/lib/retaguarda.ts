import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { Channel, DateRange } from "../types";

export const organicChannelLabels = {
  "Organic Search": "Busca orgânica",
  "Organic Social": "Redes sociais orgânicas",
  "Organic Video": "Vídeo orgânico",
  "Organic Shopping": "Shopping orgânico",
} as const;

type OrganicChannel = keyof typeof organicChannelLabels;

export interface PaidCampaignDay {
  source: Channel;
  account_id: string;
  campaign_id: string;
  metric_date: string;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

export interface OrganicAcquisitionDay {
  metric_date: string;
  channel_group: string;
  sessions: number;
}

export interface PaidMetrics {
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

const emptyPaidMetrics: PaidMetrics = { impressions: null, clicks: null, conversions: null };

function addKnown(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function addPaid(a: PaidMetrics, b: PaidMetrics): PaidMetrics {
  return {
    impressions: addKnown(a.impressions, b.impressions),
    clicks: addKnown(a.clicks, b.clicks),
    conversions: addKnown(a.conversions, b.conversions),
  };
}

export function summarizePaid(rows: PaidCampaignDay[]) {
  const days = new Map<string, PaidMetrics>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.source, row.account_id, row.campaign_id, row.metric_date]);
    if (seen.has(key)) continue;
    seen.add(key);
    days.set(row.metric_date, addPaid(days.get(row.metric_date) ?? emptyPaidMetrics, row));
  }
  const total = [...days.values()].reduce(addPaid, emptyPaidMetrics);
  return { days, total };
}

function isOrganicChannel(channel: string): channel is OrganicChannel {
  return Object.hasOwn(organicChannelLabels, channel);
}

export function summarizeOrganic(rows: OrganicAcquisitionDay[]) {
  const days = new Map<string, number>();
  const channels = new Set<OrganicChannel>();
  let total: number | null = null;
  for (const row of rows) {
    if (!isOrganicChannel(row.channel_group)) continue;
    channels.add(row.channel_group);
    days.set(row.metric_date, (days.get(row.metric_date) ?? 0) + row.sessions);
    total = (total ?? 0) + row.sessions;
  }
  const channelLabels = [...channels].sort().map((channel) => organicChannelLabels[channel]);
  return { days, total, channelLabels };
}

export function historyDates(range: DateRange): string[] {
  return eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
    .reverse()
    .map((date) => format(date, "yyyy-MM-dd"));
}
