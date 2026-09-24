-- Private, reusable creative preview dimension.
-- Meta Ads writes ad previews now. The entity columns keep the contract open
-- for a future Google Ads Performance Max asset integration.

create table public.dashboard_creative_previews (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  account_id text not null,
  entity_type text not null,
  entity_id text not null,
  ad_id text,
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  creative_id text,
  creative_name text,
  creative_type text not null default 'unknown',
  preview_kind text not null default 'unavailable',
  preview_storage_path text,
  preview_mime_type text,
  preview_sha256 text,
  preview_available boolean generated always as (preview_storage_path is not null) stored,
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  source_updated_at timestamptz,
  refreshed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_creative_previews_source_check
    check (source in ('meta_ads', 'google_ads')),
  constraint dashboard_creative_previews_entity_type_check
    check (entity_type in ('ad', 'pmax_asset')),
  constraint dashboard_creative_previews_meta_entity_check
    check (source <> 'meta_ads' or (entity_type = 'ad' and ad_id = entity_id)),
  constraint dashboard_creative_previews_type_check
    check (creative_type in ('image', 'video', 'carousel', 'dynamic', 'unknown')),
  constraint dashboard_creative_previews_kind_check
    check (preview_kind in (
      'image',
      'video_thumbnail',
      'carousel_representative',
      'dynamic_representative',
      'unavailable'
    )),
  constraint dashboard_creative_previews_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint dashboard_creative_previews_preview_consistency_check
    check (
      (preview_storage_path is null and preview_mime_type is null and preview_sha256 is null)
      or
      (preview_storage_path is not null and preview_mime_type is not null and preview_sha256 is not null)
    ),
  unique (client_id, source, account_id, entity_type, entity_id)
);

create index dashboard_creative_previews_client_source_ad_idx
  on public.dashboard_creative_previews (client_id, source, ad_id)
  where ad_id is not null;

create index dashboard_creative_previews_refresh_idx
  on public.dashboard_creative_previews (client_id, source, refreshed_at);

alter table public.dashboard_creative_previews enable row level security;

create policy dashboard_creative_previews_member_select
on public.dashboard_creative_previews
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

revoke all on table public.dashboard_creative_previews from anon, authenticated;
grant select on table public.dashboard_creative_previews to authenticated;
grant select, insert, update, delete on table public.dashboard_creative_previews to service_role;

revoke all on sequence public.dashboard_creative_previews_id_seq from anon, authenticated;
grant usage, select on sequence public.dashboard_creative_previews_id_seq to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dashboard-creatives',
  'dashboard-creatives',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy dashboard_creatives_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dashboard-creatives'
  and exists (
    select 1
    from public.dashboard_clients as client
    where client.id::text = (storage.foldername(name))[1]
      and (select private.is_dashboard_client_member(client.id))
  )
);
