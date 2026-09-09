export type Source = "google_ads" | "meta_ads";
export type EntityLevel = "campaign" | "group" | "ad";
export type PmaxLevel = "asset_group" | "asset";

export interface Kpis {
  has_data: boolean;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  link_clicks?: number;
  results: number;
  all_conversions?: number;
  conversion_value?: number;
  ctr: number | null;
  link_ctr?: number | null;
  cpc: number | null;
  link_cpc?: number | null;
  cpm: number | null;
  cost_per_result: number | null;
}

export interface DailyMetric {
  date: string;
  source: Source;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  results: number;
}

export interface OverviewResponse {
  client: { id: number; slug: string; name: string; timezone: string };
  period: { start: string; end: string; days: number };
  comparison_period: { start: string; end: string; days: number };
  available_range: { start: string | null; end: string | null };
  last_sync: Record<string, { status: string; completed_at: string; range_start: string; range_end: string }>;
  current: { consolidated: Kpis; sources: Partial<Record<Source, Kpis>> };
  previous: { consolidated: Kpis; sources: Partial<Record<Source, Kpis>> };
  daily: DailyMetric[];
}

export interface EntityItem extends Kpis {
  level: EntityLevel;
  source: Source;
  item_id: string;
  item_name: string;
  item_status: string | null;
  parent_id: string | null;
  parent_name: string | null;
}

export interface PmaxItem extends Kpis {
  level: PmaxLevel;
  item_id: string;
  item_name: string;
  item_status: string | null;
  campaign_id: string;
  campaign_name: string;
  asset_group_id: string | null;
  asset_group_name: string | null;
  field_type: string | null;
  performance_label: string | null;
  text_content: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  ad_strength: string | null;
}

export interface CursorPage<T> {
  items: T[];
  total_count: number;
  next_cursor: Record<string, string | number> | null;
}

export interface DateRange {
  start: string;
  end: string;
}
