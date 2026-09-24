drop policy if exists dashboard_creatives_member_select
  on storage.objects;

create policy dashboard_creatives_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dashboard-creatives'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and (
    select private.is_dashboard_client_member(
      ((storage.foldername(name))[1])::bigint
    )
  )
);
