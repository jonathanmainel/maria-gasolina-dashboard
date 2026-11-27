-- Only loaded into an empty, network-isolated PostgreSQL container.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema vault;
create schema net;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
insert into vault.decrypted_secrets values ('dashboard_project_url','https://transport.invalid'),('dashboard_cron_secret_key','SYNTHETIC_ONLY');
create table net.dispatches(id bigint generated always as identity primary key,body jsonb not null);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
returns bigint language sql as $$ insert into net.dispatches(body) values($2) returning id $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
