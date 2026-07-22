-- Phase 03: minimize learner-authored SRS labels and report text during the established account tombstone transaction.

create or replace function private.reject_append_only_srs_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_subject uuid;
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
begin
  v_subject := nullif(pg_catalog.current_setting('lumen.account_deletion_subject', true), '')::uuid;
  v_old := pg_catalog.to_jsonb(old);
  v_new := pg_catalog.to_jsonb(new);
  if tg_op = 'UPDATE' and v_subject is not null then
    v_actor := coalesce(
      nullif(v_old->>'reporter_account_id', '')::uuid,
      nullif(v_old->>'actor_account_id', '')::uuid
    );
    if v_actor = v_subject and v_old ? 'device_id' and v_old->'device_id' <> 'null'::jsonb
      and v_new = pg_catalog.jsonb_set(v_old, '{device_id}', 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'study_content_reports'
      and (v_old->>'reporter_account_id')::uuid = v_subject
      and v_new = pg_catalog.jsonb_set(v_old, '{details}', 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'srs_preset_versions'
      and exists(
        select 1 from public.learner_profiles as learner
        where learner.id = (v_old->>'learner_profile_id')::uuid and learner.owner_account_id = v_subject
      )
      and v_new = pg_catalog.jsonb_set(
        v_old, '{snapshot,name}', '"Deleted preset"'::jsonb
      ) then
      return new;
    end if;
  end if;
  raise exception using errcode = '55000', message = 'SRS evidence is append-only';
end;
$function$;

create or replace function private.capture_srs_preset_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject uuid;
begin
  v_subject := nullif(pg_catalog.current_setting('lumen.account_deletion_subject', true), '')::uuid;
  if tg_op = 'UPDATE' and v_subject is not null and exists(
    select 1 from public.learner_profiles as learner
    where learner.id = new.learner_profile_id and learner.owner_account_id = v_subject
  ) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.version <> old.version + 1 then
    raise exception using errcode = '40001', message = 'SRS_STALE_PRESET';
  end if;
  insert into public.srs_preset_versions (preset_id, learner_profile_id, version, snapshot)
  values (new.id, new.learner_profile_id, new.version, pg_catalog.to_jsonb(new));
  return new;
end;
$function$;

create or replace function private.tombstone_account_srs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.account_status <> 'deleted' and new.account_status = 'deleted' then
    if pg_catalog.current_setting('lumen.account_deletion_subject', true) is distinct from new.id::text then
      raise exception using errcode = '42501', message = 'SRS deletion minimization requires the account-deletion worker';
    end if;

    update public.study_content_reports as report
    set details = null
    where report.reporter_account_id = new.id and report.details is not null;

    update public.srs_preset_versions as version
    set snapshot = pg_catalog.jsonb_set(version.snapshot, '{name}', '"Deleted preset"'::jsonb)
    where version.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    ) and version.snapshot->>'name' is distinct from 'Deleted preset';

    update public.srs_presets as preset
    set name = 'Deleted preset ' || pg_catalog.substr(preset.id::text, 1, 8)
    where preset.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );

    update public.study_filters as filter
    set name = 'Deleted filter ' || pg_catalog.substr(filter.id::text, 1, 8),
      definition = '{}'::jsonb,
      deleted_at = coalesce(filter.deleted_at, new.deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      version = filter.version + 1
    where filter.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );

    update public.study_sessions as session
    set timezone = 'UTC', queue_seed = 'deleted-' || session.id::text
    where session.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
  end if;
  return new;
end;
$function$;

create trigger profiles_tombstone_account_srs
after update of account_status on public.profiles
for each row execute function private.tombstone_account_srs();

revoke all on function private.reject_append_only_srs_mutation() from public, anon, authenticated, service_role;
revoke all on function private.capture_srs_preset_version() from public, anon, authenticated, service_role;
revoke all on function private.tombstone_account_srs() from public, anon, authenticated, service_role;
