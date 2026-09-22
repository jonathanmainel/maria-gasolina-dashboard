import { differenceInCalendarDays, getDaysInMonth, parseISO } from "date-fns";
import type { Channel, DateRange, Front, FrontDaily, FrontTotals, OrganicDaily, OrganicSummary, Platform } from "../types";

export const emptyTotals: FrontTotals = { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, cpl: null, ctr: null, cpc: null, cpm: null, conv_rate: null };

export function totals(rows: FrontDaily[]): FrontTotals {
  const t = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, reach: acc.reach + r.reach, clicks: acc.clicks + r.clicks, leads: acc.leads + r.leads }), { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0 });
  return {
    ...t,
    cpl: t.leads ? t.spend / t.leads : null,
    ctr: t.impressions ? (t.clicks * 100) / t.impressions : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpm: t.impressions ? (t.spend * 1000) / t.impressions : null,
    conv_rate: t.clicks ? (t.leads * 100) / t.clicks : null,
  };
}

export function inRange(rows: FrontDaily[], range: DateRange) {
  return rows.filter((r) => r.date >= range.start && r.date <= range.end);
}

export function previousRange(range: DateRange): DateRange {
  const days = differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;
  const end = new Date(parseISO(range.start).getTime() - 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { start: f(start), end: f(end) };
}

export function byFront(rows: FrontDaily[], front: Front) { return rows.filter((r) => r.front === front); }
export function byChannel(rows: FrontDaily[], channel: Channel) { return rows.filter((r) => r.channel === channel); }

export function dailySeries(rows: FrontDaily[]) {
  const map = new Map<string, { date: string; spend: number; leads: number; clicks: number; impressions: number; franchise: number; condominium: number; meta: number; google: number; spend_franchise: number; spend_condominium: number }>();
  rows.forEach((r) => {
    const e = map.get(r.date) ?? { date: r.date, spend: 0, leads: 0, clicks: 0, impressions: 0, franchise: 0, condominium: 0, meta: 0, google: 0, spend_franchise: 0, spend_condominium: 0 };
    e.spend += r.spend; e.leads += r.leads; e.clicks += r.clicks; e.impressions += r.impressions;
    e[r.front] += r.leads;
    e[r.front === "franchise" ? "spend_franchise" : "spend_condominium"] += r.spend;
    if (r.channel === "meta_ads") e.meta += r.leads; else e.google += r.leads;
    map.set(r.date, e);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ ...e, cpl: e.leads ? e.spend / e.leads : null }));
}

export function weeklySeries(rows: FrontDaily[]) {
  const daily = dailySeries(rows);
  const weeks: Array<{ label: string; spend: number; leads: number; cpl: number | null }> = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const spend = chunk.reduce((s, d) => s + d.spend, 0);
    const leads = chunk.reduce((s, d) => s + d.leads, 0);
    weeks.push({ label: chunk[0].date.slice(5).split("-").reverse().join("/"), spend, leads, cpl: leads ? spend / leads : null });
  }
  return weeks;
}

export function organicSummary(rows: OrganicDaily[], platform: Platform): OrganicSummary {
  const list = rows.filter((r) => r.platform === platform).sort((a, b) => a.date.localeCompare(b.date));
  const first = list[0];
  const last = list[list.length - 1];
  const sum = (k: keyof OrganicDaily) => list.reduce((s, r) => s + (r[k] as number), 0);
  const reach = sum("reach");
  const interactions = sum("likes") + sum("comments") + sum("shares") + sum("saves");
  const followersStart = first ? first.followers - first.new_followers + first.unfollows : 0;
  return {
    platform,
    followers: last?.followers ?? 0,
    followers_start: followersStart,
    new_followers: sum("new_followers"),
    unfollows: sum("unfollows"),
    growth_rate: followersStart ? (((last?.followers ?? 0) - followersStart) * 100) / followersStart : null,
    reach, impressions: sum("impressions"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares"), saves: sum("saves"),
    dms: sum("dms"), profile_visits: sum("profile_visits"),
    engagement_rate: reach ? (interactions * 100) / reach : null,
    posts: sum("posts"), stories: sum("stories"),
  };
}

export function monthProgress(range: DateRange) {
  const end = parseISO(range.end);
  const daysInMonth = getDaysInMonth(end);
  const elapsed = end.getDate();
  return { daysInMonth, elapsed, ratio: elapsed / daysInMonth };
}

export function pacing(actual: number, goal: number, ratio: number) {
  const expected = goal * ratio;
  const projected = ratio > 0 ? actual / ratio : 0;
  return { expected, projected, attainment: goal ? (actual * 100) / goal : null, delta: expected ? ((actual - expected) * 100) / expected : null };
}
