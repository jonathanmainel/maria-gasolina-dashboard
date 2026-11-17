-- Apply only in a fresh disposable loopback database after the base migrations.
begin;
do $$
begin
  -- The native CLI's loopback proxy may hand off to a local Unix socket.
  if inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'The Retaguarda test baseline requires a PostgreSQL loopback connection or Unix socket';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'The Retaguarda test baseline requires an empty Auth database';
  end if;
end;
$$;

-- Reproduce the production role constraint in this test database. I05 synced
-- the production constraint separately from the repository migrations.
alter table public.dashboard_client_users drop constraint dashboard_client_users_role_check;
alter table public.dashboard_client_users add constraint dashboard_client_users_role_check
  check (role in ('viewer', 'editor', 'admin'));

create table private.retaguarda_homolog_marker (
  token text primary key check (token = 'local-synthetic-only')
);
revoke all on private.retaguarda_homolog_marker from public, anon, authenticated, service_role;
insert into private.retaguarda_homolog_marker values ('local-synthetic-only');
commit;
