begin;

create schema if not exists extensions;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgtap with schema extensions;

create schema if not exists private;
comment on schema private is
  'Non-exposed helpers. Functions require explicit grants and hardened search paths.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

alter default privileges for role postgres in schema private
  revoke execute on functions from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

comment on function private.set_updated_at() is
  'Sets a row updated_at timestamp. Attach only to tables with an updated_at column.';

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon, authenticated;

commit;
