-- Phase 06: owner-scoped import, export, backup, restore, and artifact jobs.
-- Source bytes and object paths remain private. Public tables expose only safe
-- operational summaries and are never directly writable by browser roles.

create type public.portability_job_status as enum (
  'uploaded',
  'inspecting',
  'awaiting_mapping',
  'ready',
  'queued',
  'running',
  'pausing',
  'paused',
  'cancelling',
  'cancelled',
  'completed',
  'completed_with_warnings',
  'failed',
  'retryable',
  'expired'
);

create type public.portability_format as enum (
  'plain_text',
  'quizlet_text',
  'csv',
  'tsv',
  'lumen_json',
  'markdown_bundle',
  'anki_apkg',
  'anki_colpkg',
  'lumen_archive',
  'encrypted_lumen_archive',
  'print_html'
);

create type public.portability_job_kind as enum ('import', 'export', 'restore');

create table public.import_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete restrict,
  learner_profile_id uuid references public.learner_profiles (id) on delete restrict,
  kind public.portability_job_kind not null default 'import',
  status public.portability_job_status not null default 'uploaded',
  adapter_code text not null,
  source_format public.portability_format not null,
  source_display_name text not null,
  source_byte_size bigint not null,
  source_sha256 text not null,
  requested_policy jsonb not null default '{}'::jsonb,
  inspection_summary jsonb not null default '{}'::jsonb,
  current_phase text not null default 'uploaded',
  processed_count bigint not null default 0,
  total_count bigint,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  safe_error_code text,
  safe_error_summary text,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  requested_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '7 days'),
  cancelled_at timestamptz,
  constraint import_jobs_kind check (kind in ('import', 'restore')),
  constraint import_jobs_adapter_code check (
    pg_catalog.char_length(pg_catalog.btrim(adapter_code)) between 1 and 100
  ),
  constraint import_jobs_source_display_name check (
    pg_catalog.char_length(pg_catalog.btrim(source_display_name)) between 1 and 255
  ),
  constraint import_jobs_source_size check (source_byte_size between 0 and 67108864),
  constraint import_jobs_sha256 check (source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint import_jobs_policy_object check (pg_catalog.jsonb_typeof(requested_policy) = 'object'),
  constraint import_jobs_inspection_object check (
    pg_catalog.jsonb_typeof(inspection_summary) = 'object'
  ),
  constraint import_jobs_current_phase check (
    pg_catalog.char_length(pg_catalog.btrim(current_phase)) between 1 and 80
  ),
  constraint import_jobs_counts check (
    processed_count >= 0
    and (total_count is null or total_count >= processed_count)
    and warning_count >= 0
    and error_count >= 0
  ),
  constraint import_jobs_error_code check (
    safe_error_code is null or pg_catalog.char_length(safe_error_code) between 1 and 80
  ),
  constraint import_jobs_error_summary check (
    safe_error_summary is null or pg_catalog.char_length(safe_error_summary) between 1 and 500
  ),
  constraint import_jobs_fingerprint check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint import_jobs_expiration check (expires_at > requested_at),
  unique (account_id, idempotency_key)
);

create index import_jobs_account_requested_idx
on public.import_jobs (account_id, requested_at desc);
create index import_jobs_account_status_idx
on public.import_jobs (account_id, status, updated_at desc);
create index import_jobs_expiry_idx
on public.import_jobs (expires_at)
where status not in ('expired', 'cancelled');

create table public.export_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete restrict,
  learner_profile_id uuid references public.learner_profiles (id) on delete restrict,
  status public.portability_job_status not null default 'queued',
  adapter_code text not null,
  export_format public.portability_format not null,
  export_scope jsonb not null,
  requested_options jsonb not null default '{}'::jsonb,
  current_phase text not null default 'queued',
  processed_count bigint not null default 0,
  total_count bigint,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  safe_error_code text,
  safe_error_summary text,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  requested_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '7 days'),
  cancelled_at timestamptz,
  constraint export_jobs_adapter_code check (
    pg_catalog.char_length(pg_catalog.btrim(adapter_code)) between 1 and 100
  ),
  constraint export_jobs_scope_object check (pg_catalog.jsonb_typeof(export_scope) = 'object'),
  constraint export_jobs_options_object check (
    pg_catalog.jsonb_typeof(requested_options) = 'object'
  ),
  constraint export_jobs_current_phase check (
    pg_catalog.char_length(pg_catalog.btrim(current_phase)) between 1 and 80
  ),
  constraint export_jobs_counts check (
    processed_count >= 0
    and (total_count is null or total_count >= processed_count)
    and warning_count >= 0
    and error_count >= 0
  ),
  constraint export_jobs_error_code check (
    safe_error_code is null or pg_catalog.char_length(safe_error_code) between 1 and 80
  ),
  constraint export_jobs_error_summary check (
    safe_error_summary is null or pg_catalog.char_length(safe_error_summary) between 1 and 500
  ),
  constraint export_jobs_fingerprint check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint export_jobs_expiration check (expires_at > requested_at),
  unique (account_id, idempotency_key)
);

create index export_jobs_account_requested_idx
on public.export_jobs (account_id, requested_at desc);
create index export_jobs_account_status_idx
on public.export_jobs (account_id, status, updated_at desc);
create index export_jobs_expiry_idx
on public.export_jobs (expires_at)
where status not in ('expired', 'cancelled');

create table public.export_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  export_job_id uuid not null references public.export_jobs (id) on delete restrict,
  account_id uuid not null references public.profiles (id) on delete restrict,
  format public.portability_format not null,
  display_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  warning_count integer not null default 0,
  loss_summary jsonb not null default '[]'::jsonb,
  available boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint export_artifacts_display_name check (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 255
  ),
  constraint export_artifacts_mime_type check (
    pg_catalog.char_length(pg_catalog.btrim(mime_type)) between 1 and 200
  ),
  constraint export_artifacts_byte_size check (byte_size between 0 and 1073741824),
  constraint export_artifacts_sha256 check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint export_artifacts_warning_count check (warning_count >= 0),
  constraint export_artifacts_loss_array check (pg_catalog.jsonb_typeof(loss_summary) = 'array'),
  constraint export_artifacts_expiration check (expires_at > created_at)
);

create index export_artifacts_account_created_idx
on public.export_artifacts (account_id, created_at desc);
create index export_artifacts_expiry_idx
on public.export_artifacts (expires_at)
where available and deleted_at is null;

create table private.portability_upload_objects (
  id uuid primary key default extensions.gen_random_uuid(),
  import_job_id uuid not null unique references public.import_jobs (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete restrict,
  storage_bucket text not null default 'lumen-portability',
  storage_path text not null unique,
  detected_mime_type text not null,
  declared_mime_type text,
  byte_size bigint not null,
  sha256 text not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint portability_upload_bucket check (storage_bucket = 'lumen-portability'),
  constraint portability_upload_path check (
    pg_catalog.char_length(storage_path) between 1 and 500
    and storage_path !~ '(^/|(^|/)\.\.?(/|$)|\\)'
  ),
  constraint portability_upload_mime check (
    pg_catalog.char_length(detected_mime_type) between 1 and 200
    and (
      declared_mime_type is null
      or pg_catalog.char_length(declared_mime_type) between 1 and 200
    )
  ),
  constraint portability_upload_size check (byte_size between 0 and 67108864),
  constraint portability_upload_sha256 check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint portability_upload_expiry check (expires_at > created_at)
);

create index portability_upload_expiry_idx
on private.portability_upload_objects (expires_at)
where deleted_at is null;

create table private.portability_artifact_objects (
  artifact_id uuid primary key references public.export_artifacts (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete restrict,
  storage_bucket text not null default 'lumen-portability',
  storage_path text not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint portability_artifact_bucket check (storage_bucket = 'lumen-portability'),
  constraint portability_artifact_path check (
    pg_catalog.char_length(storage_path) between 1 and 500
    and storage_path !~ '(^/|(^|/)\.\.?(/|$)|\\)'
  )
);

create table private.portability_job_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  phase text not null,
  priority smallint not null default 100,
  available_at timestamptz not null default pg_catalog.now(),
  attempt_count smallint not null default 0,
  maximum_attempts smallint not null default 5,
  lease_owner uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint portability_queue_phase check (
    pg_catalog.char_length(pg_catalog.btrim(phase)) between 1 and 80
  ),
  constraint portability_queue_attempts check (
    attempt_count between 0 and 20
    and maximum_attempts between 1 and 20
    and attempt_count <= maximum_attempts
  ),
  constraint portability_queue_lease_shape check (
    (lease_owner is null and lease_token is null and lease_expires_at is null)
    or (lease_owner is not null and lease_token is not null and lease_expires_at is not null)
  ),
  unique (job_kind, job_id)
);

create index portability_queue_claim_idx
on private.portability_job_queue (available_at, priority, created_at)
where lease_token is null;
create index portability_queue_lease_idx
on private.portability_job_queue (lease_expires_at)
where lease_token is not null;

create table private.portability_job_attempts (
  id bigint generated always as identity primary key,
  queue_id uuid references private.portability_job_queue (id) on delete set null,
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  attempt_number smallint not null,
  worker_id uuid not null,
  lease_token uuid not null,
  result text not null default 'running',
  safe_error_code text,
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint portability_attempt_result check (
    result in (
      'running',
      'completed',
      'completed_with_warnings',
      'cancelled',
      'retryable',
      'failed',
      'lease_expired'
    )
  ),
  constraint portability_attempt_error check (
    safe_error_code is null or pg_catalog.char_length(safe_error_code) between 1 and 80
  ),
  unique (queue_id, attempt_number)
);

create table private.portability_job_checkpoints (
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  checkpoint_key text not null,
  ordinal integer not null,
  payload_fingerprint text not null,
  result_summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default pg_catalog.now(),
  primary key (job_kind, job_id, checkpoint_key),
  constraint portability_checkpoint_key check (
    pg_catalog.char_length(pg_catalog.btrim(checkpoint_key)) between 1 and 120
  ),
  constraint portability_checkpoint_ordinal check (ordinal >= 0),
  constraint portability_checkpoint_fingerprint check (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint portability_checkpoint_summary check (
    pg_catalog.jsonb_typeof(result_summary) = 'object'
  )
);

create table private.portability_job_items (
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  item_key text not null,
  source_fingerprint text not null,
  canonical_id uuid,
  result text not null,
  safe_warning_codes text[] not null default '{}'::text[],
  processed_at timestamptz not null default pg_catalog.now(),
  primary key (job_kind, job_id, item_key),
  constraint portability_item_key check (
    pg_catalog.char_length(pg_catalog.btrim(item_key)) between 1 and 200
  ),
  constraint portability_item_fingerprint check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint portability_item_result check (
    result in ('created', 'updated', 'skipped', 'failed')
  )
);

create table private.portability_job_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  account_id uuid not null references public.profiles (id) on delete restrict,
  payload_fingerprint text not null,
  source_sha256 text,
  canonical_id_map jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  warning_codes text[] not null default '{}'::text[],
  result text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint portability_receipt_fingerprint check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint portability_receipt_source_sha check (
    source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint portability_receipt_id_map check (
    pg_catalog.jsonb_typeof(canonical_id_map) = 'object'
  ),
  constraint portability_receipt_counts check (pg_catalog.jsonb_typeof(counts) = 'object'),
  constraint portability_receipt_result check (
    result in ('completed', 'completed_with_warnings', 'cancelled', 'failed')
  ),
  unique (job_kind, job_id)
);

create table private.portability_diagnostic_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  job_kind public.portability_job_kind not null,
  job_id uuid not null,
  account_id uuid not null references public.profiles (id) on delete restrict,
  storage_bucket text not null default 'lumen-portability',
  storage_path text not null unique,
  category text not null,
  byte_size bigint not null,
  sha256 text not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  deleted_at timestamptz,
  constraint portability_diagnostic_bucket check (storage_bucket = 'lumen-portability'),
  constraint portability_diagnostic_path check (
    pg_catalog.char_length(storage_path) between 1 and 500
    and storage_path !~ '(^/|(^|/)\.\.?(/|$)|\\)'
  ),
  constraint portability_diagnostic_category check (
    pg_catalog.char_length(pg_catalog.btrim(category)) between 1 and 80
  ),
  constraint portability_diagnostic_size check (byte_size between 0 and 10485760),
  constraint portability_diagnostic_sha256 check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint portability_diagnostic_expiry check (expires_at > created_at)
);

alter table public.data_export_jobs
add column portability_export_job_id uuid references public.export_jobs (id) on delete set null;

create unique index data_export_jobs_portability_job_idx
on public.data_export_jobs (portability_export_job_id)
where portability_export_job_id is not null;

alter table public.import_jobs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.export_artifacts enable row level security;

create policy import_jobs_select_self
on public.import_jobs for select to authenticated
using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);

create policy export_jobs_select_self
on public.export_jobs for select to authenticated
using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);

create policy export_artifacts_select_self
on public.export_artifacts for select to authenticated
using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);

revoke all on public.import_jobs from public, anon, authenticated;
revoke all on public.export_jobs from public, anon, authenticated;
revoke all on public.export_artifacts from public, anon, authenticated;
grant select on public.import_jobs to authenticated;
grant select on public.export_jobs to authenticated;
grant select on public.export_artifacts to authenticated;

create or replace function private.portability_job_exists(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_account_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_job_kind in ('import', 'restore') then exists(
      select 1
      from public.import_jobs as job
      where job.id = p_job_id
        and (p_account_id is null or job.account_id = p_account_id)
        and job.kind = p_job_kind
    )
    else exists(
      select 1
      from public.export_jobs as job
      where job.id = p_job_id
        and (p_account_id is null or job.account_id = p_account_id)
    )
  end;
$function$;

create or replace function public.current_create_import_job(
  p_learner_profile_id uuid,
  p_kind public.portability_job_kind,
  p_adapter_code text,
  p_source_format public.portability_format,
  p_source_display_name text,
  p_source_byte_size bigint,
  p_source_sha256 text,
  p_requested_policy jsonb,
  p_payload_fingerprint text,
  p_idempotency_key uuid
)
returns public.import_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_existing public.import_jobs;
  v_job public.import_jobs;
begin
  if p_kind not in ('import', 'restore')
    or p_adapter_code is null
    or p_source_display_name is null
    or p_requested_policy is null
    or p_payload_fingerprint is null
    or p_idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'invalid import job request';
  end if;
  if p_learner_profile_id is not null
    and not private.can_access_learner_profile(v_account_id, p_learner_profile_id, 'study')
  then
    raise exception using errcode = '42501', message = 'learner profile is unavailable';
  end if;

  select * into v_existing
  from public.import_jobs as job
  where job.account_id = v_account_id
    and job.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload_fingerprint <> p_payload_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency key payload mismatch';
    end if;
    return v_existing;
  end if;

  insert into public.import_jobs (
    account_id, learner_profile_id, kind, adapter_code, source_format,
    source_display_name, source_byte_size, source_sha256, requested_policy,
    payload_fingerprint, idempotency_key
  ) values (
    v_account_id, p_learner_profile_id, p_kind, pg_catalog.btrim(p_adapter_code),
    p_source_format, pg_catalog.btrim(p_source_display_name), p_source_byte_size,
    p_source_sha256, p_requested_policy, p_payload_fingerprint, p_idempotency_key
  )
  returning * into v_job;

  insert into private.portability_job_queue (job_kind, job_id, phase)
  values (p_kind, v_job.id, 'inspect');
  return v_job;
end;
$function$;

create or replace function public.current_create_export_job(
  p_learner_profile_id uuid,
  p_adapter_code text,
  p_export_format public.portability_format,
  p_export_scope jsonb,
  p_requested_options jsonb,
  p_payload_fingerprint text,
  p_idempotency_key uuid
)
returns public.export_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_existing public.export_jobs;
  v_job public.export_jobs;
begin
  if p_adapter_code is null
    or p_export_scope is null
    or p_requested_options is null
    or p_payload_fingerprint is null
    or p_idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'invalid export job request';
  end if;
  if p_learner_profile_id is not null
    and not private.can_access_learner_profile(v_account_id, p_learner_profile_id, 'study')
  then
    raise exception using errcode = '42501', message = 'learner profile is unavailable';
  end if;

  select * into v_existing
  from public.export_jobs as job
  where job.account_id = v_account_id
    and job.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload_fingerprint <> p_payload_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency key payload mismatch';
    end if;
    return v_existing;
  end if;

  insert into public.export_jobs (
    account_id, learner_profile_id, adapter_code, export_format, export_scope,
    requested_options, payload_fingerprint, idempotency_key
  ) values (
    v_account_id, p_learner_profile_id, pg_catalog.btrim(p_adapter_code),
    p_export_format, p_export_scope, p_requested_options, p_payload_fingerprint,
    p_idempotency_key
  )
  returning * into v_job;

  insert into private.portability_job_queue (job_kind, job_id, phase)
  values ('export', v_job.id, 'snapshot');
  return v_job;
end;
$function$;

create or replace function public.current_cancel_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_status public.portability_job_status;
begin
  if p_job_kind in ('import', 'restore') then
    update public.import_jobs
    set status = case when status in ('uploaded', 'awaiting_mapping', 'ready', 'queued', 'paused', 'retryable')
        then 'cancelled'::public.portability_job_status
        else 'cancelling'::public.portability_job_status end,
      cancelled_at = case when status in ('uploaded', 'awaiting_mapping', 'ready', 'queued', 'paused', 'retryable')
        then pg_catalog.now() else cancelled_at end,
      updated_at = pg_catalog.now()
    where id = p_job_id
      and account_id = v_account_id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired')
    returning status into v_status;
  else
    update public.export_jobs
    set status = case when status in ('queued', 'paused', 'retryable')
        then 'cancelled'::public.portability_job_status
        else 'cancelling'::public.portability_job_status end,
      cancelled_at = case when status in ('queued', 'paused', 'retryable')
        then pg_catalog.now() else cancelled_at end,
      updated_at = pg_catalog.now()
    where id = p_job_id
      and account_id = v_account_id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired')
    returning status into v_status;
  end if;
  if v_status is null then
    raise exception using errcode = 'P0002', message = 'job is unavailable';
  end if;
  if v_status = 'cancelled' then
    delete from private.portability_job_queue
    where job_kind = p_job_kind and job_id = p_job_id;
  end if;
  return pg_catalog.jsonb_build_object('id', p_job_id, 'status', v_status);
end;
$function$;

create or replace function public.current_retry_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_phase text;
begin
  if p_job_kind in ('import', 'restore') then
    update public.import_jobs
    set status = 'queued', safe_error_code = null, safe_error_summary = null,
      updated_at = pg_catalog.now()
    where id = p_job_id and account_id = v_account_id and status = 'retryable'
    returning current_phase into v_phase;
  else
    update public.export_jobs
    set status = 'queued', safe_error_code = null, safe_error_summary = null,
      updated_at = pg_catalog.now()
    where id = p_job_id and account_id = v_account_id and status = 'retryable'
    returning current_phase into v_phase;
  end if;
  if v_phase is null then
    raise exception using errcode = 'P0002', message = 'retryable job is unavailable';
  end if;
  insert into private.portability_job_queue (job_kind, job_id, phase)
  values (p_job_kind, p_job_id, v_phase)
  on conflict (job_kind, job_id) do update
  set available_at = pg_catalog.now(), lease_owner = null, lease_token = null,
      lease_expires_at = null, updated_at = pg_catalog.now();
  return pg_catalog.jsonb_build_object('id', p_job_id, 'status', 'queued');
end;
$function$;

create or replace function public.admin_register_portability_upload(
  p_import_job_id uuid,
  p_account_id uuid,
  p_storage_path text,
  p_detected_mime_type text,
  p_declared_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_upload_id uuid;
begin
  if not private.portability_job_exists(
    (select job.kind from public.import_jobs as job where job.id = p_import_job_id),
    p_import_job_id,
    p_account_id
  ) then
    raise exception using errcode = '42501', message = 'import job is unavailable';
  end if;
  insert into private.portability_upload_objects (
    import_job_id, account_id, storage_path, detected_mime_type,
    declared_mime_type, byte_size, sha256, expires_at
  ) values (
    p_import_job_id, p_account_id, p_storage_path, p_detected_mime_type,
    p_declared_mime_type, p_byte_size, p_sha256, p_expires_at
  )
  on conflict (import_job_id) do update
  set storage_path = excluded.storage_path,
      detected_mime_type = excluded.detected_mime_type,
      declared_mime_type = excluded.declared_mime_type,
      byte_size = excluded.byte_size,
      sha256 = excluded.sha256,
      expires_at = excluded.expires_at,
      deleted_at = null
  where private.portability_upload_objects.account_id = excluded.account_id
  returning id into v_upload_id;
  return v_upload_id;
end;
$function$;

create or replace function public.admin_claim_portability_jobs(
  p_worker_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  queue_id uuid,
  job_kind public.portability_job_kind,
  job_id uuid,
  phase text,
  attempt_number smallint,
  lease_token uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_worker_id is null or p_limit not between 1 and 25 or p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'invalid portability claim';
  end if;

  update private.portability_job_attempts as attempt
  set result = 'lease_expired', completed_at = pg_catalog.now()
  from private.portability_job_queue as queue
  where attempt.queue_id = queue.id
    and attempt.result = 'running'
    and queue.lease_expires_at <= pg_catalog.now();

  update private.portability_job_queue
  set lease_owner = null, lease_token = null, lease_expires_at = null,
      available_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where lease_expires_at <= pg_catalog.now();

  return query
  with candidates as (
    select queue.id
    from private.portability_job_queue as queue
    where queue.available_at <= pg_catalog.now()
      and queue.lease_token is null
      and queue.attempt_count < queue.maximum_attempts
    order by queue.priority, queue.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update private.portability_job_queue as queue
    set attempt_count = queue.attempt_count + 1,
        lease_owner = p_worker_id,
        lease_token = extensions.gen_random_uuid(),
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        updated_at = pg_catalog.now()
    from candidates
    where queue.id = candidates.id
    returning queue.*
  ),
  attempts as (
    insert into private.portability_job_attempts (
      queue_id, job_kind, job_id, attempt_number, worker_id, lease_token
    )
    select claimed.id, claimed.job_kind, claimed.job_id, claimed.attempt_count,
      p_worker_id, claimed.lease_token
    from claimed
    returning 1
  )
  select claimed.id, claimed.job_kind, claimed.job_id, claimed.phase,
    claimed.attempt_count, claimed.lease_token
  from claimed, lateral (select pg_catalog.count(*) from attempts) as inserted;
end;
$function$;

create or replace function public.admin_checkpoint_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_lease_token uuid,
  p_phase text,
  p_checkpoint_key text,
  p_checkpoint_ordinal integer,
  p_payload_fingerprint text,
  p_processed_count bigint,
  p_total_count bigint,
  p_warning_count integer,
  p_error_count integer,
  p_result_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists(
    select 1 from private.portability_job_queue as queue
    where queue.job_kind = p_job_kind
      and queue.job_id = p_job_id
      and queue.lease_token = p_lease_token
      and queue.lease_expires_at > pg_catalog.now()
  ) then
    raise exception using errcode = '40001', message = 'portability lease is unavailable';
  end if;

  insert into private.portability_job_checkpoints (
    job_kind, job_id, checkpoint_key, ordinal, payload_fingerprint, result_summary
  ) values (
    p_job_kind, p_job_id, p_checkpoint_key, p_checkpoint_ordinal,
    p_payload_fingerprint, p_result_summary
  )
  on conflict (job_kind, job_id, checkpoint_key) do update
  set result_summary = excluded.result_summary
  where private.portability_job_checkpoints.payload_fingerprint = excluded.payload_fingerprint;

  if p_job_kind in ('import', 'restore') then
    update public.import_jobs
    set status = 'running', current_phase = p_phase,
      processed_count = p_processed_count, total_count = p_total_count,
      warning_count = p_warning_count, error_count = p_error_count,
      started_at = coalesce(started_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where id = p_job_id and status not in ('cancelling', 'cancelled', 'expired');
  else
    update public.export_jobs
    set status = 'running', current_phase = p_phase,
      processed_count = p_processed_count, total_count = p_total_count,
      warning_count = p_warning_count, error_count = p_error_count,
      started_at = coalesce(started_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where id = p_job_id and status not in ('cancelling', 'cancelled', 'expired');
  end if;
  return pg_catalog.jsonb_build_object('status', 'running', 'processedCount', p_processed_count);
end;
$function$;

create or replace function public.admin_complete_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_lease_token uuid,
  p_result public.portability_job_status,
  p_warning_count integer,
  p_error_count integer,
  p_safe_error_code text default null,
  p_safe_error_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue private.portability_job_queue;
  v_account_id uuid;
  v_payload_fingerprint text;
  v_source_sha text;
begin
  if p_result not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'retryable')
    or p_warning_count < 0 or p_error_count < 0
  then
    raise exception using errcode = '22023', message = 'invalid portability completion';
  end if;
  select * into v_queue
  from private.portability_job_queue as queue
  where queue.job_kind = p_job_kind
    and queue.job_id = p_job_id
    and queue.lease_token = p_lease_token
    and queue.lease_expires_at > pg_catalog.now()
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'portability lease is unavailable';
  end if;

  if p_job_kind in ('import', 'restore') then
    update public.import_jobs
    set status = p_result, current_phase = 'finalize',
      warning_count = p_warning_count, error_count = p_error_count,
      safe_error_code = p_safe_error_code,
      safe_error_summary = p_safe_error_summary,
      completed_at = case when p_result <> 'retryable' then pg_catalog.now() else completed_at end,
      cancelled_at = case when p_result = 'cancelled' then pg_catalog.now() else cancelled_at end,
      updated_at = pg_catalog.now()
    where id = p_job_id
    returning account_id, payload_fingerprint, source_sha256
    into v_account_id, v_payload_fingerprint, v_source_sha;
  else
    update public.export_jobs
    set status = p_result, current_phase = 'finalize',
      warning_count = p_warning_count, error_count = p_error_count,
      safe_error_code = p_safe_error_code,
      safe_error_summary = p_safe_error_summary,
      completed_at = case when p_result <> 'retryable' then pg_catalog.now() else completed_at end,
      cancelled_at = case when p_result = 'cancelled' then pg_catalog.now() else cancelled_at end,
      updated_at = pg_catalog.now()
    where id = p_job_id
    returning account_id, payload_fingerprint
    into v_account_id, v_payload_fingerprint;
  end if;

  update private.portability_job_attempts
  set result = p_result::text, completed_at = pg_catalog.now(),
      safe_error_code = p_safe_error_code
  where queue_id = v_queue.id and lease_token = p_lease_token and result = 'running';

  if p_result = 'retryable' then
    update private.portability_job_queue
    set lease_owner = null, lease_token = null, lease_expires_at = null,
      available_at = pg_catalog.now() + pg_catalog.make_interval(
        secs => pg_catalog.least(300, 5 * (2 ^ pg_catalog.least(attempt_count, 6))::integer)
      ),
      updated_at = pg_catalog.now()
    where id = v_queue.id;
  else
    delete from private.portability_job_queue where id = v_queue.id;
    insert into private.portability_job_receipts (
      job_kind, job_id, account_id, payload_fingerprint, source_sha256,
      canonical_id_map, counts, warning_codes, result
    ) values (
      p_job_kind, p_job_id, v_account_id, v_payload_fingerprint, v_source_sha,
      coalesce((
        select pg_catalog.jsonb_object_agg(item.item_key, item.canonical_id)
        from private.portability_job_items as item
        where item.job_kind = p_job_kind
          and item.job_id = p_job_id
          and item.canonical_id is not null
      ), '{}'::jsonb),
      pg_catalog.jsonb_build_object('warnings', p_warning_count, 'errors', p_error_count),
      '{}'::text[], p_result::text
    )
    on conflict (job_kind, job_id) do nothing;
  end if;
  return pg_catalog.jsonb_build_object('id', p_job_id, 'status', p_result);
end;
$function$;

create or replace function public.admin_register_export_artifact(
  p_export_job_id uuid,
  p_account_id uuid,
  p_format public.portability_format,
  p_display_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_warning_count integer,
  p_loss_summary jsonb,
  p_storage_path text,
  p_expires_at timestamptz
)
returns public.export_artifacts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_artifact public.export_artifacts;
begin
  if not private.portability_job_exists('export', p_export_job_id, p_account_id) then
    raise exception using errcode = '42501', message = 'export job is unavailable';
  end if;
  insert into public.export_artifacts (
    export_job_id, account_id, format, display_name, mime_type, byte_size,
    sha256, warning_count, loss_summary, expires_at
  ) values (
    p_export_job_id, p_account_id, p_format, p_display_name, p_mime_type,
    p_byte_size, p_sha256, p_warning_count, p_loss_summary, p_expires_at
  )
  returning * into v_artifact;
  insert into private.portability_artifact_objects (artifact_id, account_id, storage_path)
  values (v_artifact.id, p_account_id, p_storage_path);
  return v_artifact;
end;
$function$;

create or replace function public.admin_expire_portability_objects(
  p_limit integer default 100
)
returns table (
  object_kind text,
  object_id uuid,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid cleanup limit';
  end if;
  return query
  with expired_artifacts as (
    select object_record.artifact_id as id, object_record.storage_bucket, object_record.storage_path
    from private.portability_artifact_objects as object_record
    join public.export_artifacts as artifact on artifact.id = object_record.artifact_id
    where object_record.deleted_at is null and artifact.expires_at <= pg_catalog.now()
    order by artifact.expires_at
    limit p_limit
    for update of object_record skip locked
  ),
  marked_artifacts as (
    update private.portability_artifact_objects as object_record
    set deleted_at = pg_catalog.now()
    from expired_artifacts
    where object_record.artifact_id = expired_artifacts.id
    returning object_record.artifact_id, object_record.storage_bucket, object_record.storage_path
  ),
  expire_public as (
    update public.export_artifacts as artifact
    set available = false, deleted_at = pg_catalog.now()
    from marked_artifacts
    where artifact.id = marked_artifacts.artifact_id
    returning artifact.id
  ),
  expired_uploads as (
    select upload.id, upload.storage_bucket, upload.storage_path
    from private.portability_upload_objects as upload
    where upload.deleted_at is null and upload.expires_at <= pg_catalog.now()
    order by upload.expires_at
    limit p_limit
    for update skip locked
  ),
  marked_uploads as (
    update private.portability_upload_objects as upload
    set deleted_at = pg_catalog.now()
    from expired_uploads
    where upload.id = expired_uploads.id
    returning upload.id, upload.storage_bucket, upload.storage_path
  )
  select 'artifact'::text, marked_artifacts.artifact_id,
    marked_artifacts.storage_bucket, marked_artifacts.storage_path
  from marked_artifacts, lateral (select pg_catalog.count(*) from expire_public) as completed
  union all
  select 'upload'::text, marked_uploads.id,
    marked_uploads.storage_bucket, marked_uploads.storage_path
  from marked_uploads;
end;
$function$;

create or replace function private.cancel_portability_for_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.account_status = 'deleted' and old.account_status is distinct from new.account_status then
    update public.import_jobs
    set status = 'cancelled', cancelled_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where account_id = new.id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired');
    update public.export_jobs
    set status = 'cancelled', cancelled_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where account_id = new.id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired');
    update public.export_artifacts
    set available = false, deleted_at = coalesce(deleted_at, pg_catalog.now())
    where account_id = new.id and available;
    update private.portability_upload_objects
    set expires_at = least(expires_at, pg_catalog.now())
    where account_id = new.id and deleted_at is null;
    update private.portability_artifact_objects
    set deleted_at = coalesce(deleted_at, pg_catalog.now())
    where account_id = new.id;
    delete from private.portability_job_queue as queue
    where exists(
      select 1 from public.import_jobs as job
      where queue.job_kind in ('import', 'restore')
        and queue.job_id = job.id and job.account_id = new.id
    ) or exists(
      select 1 from public.export_jobs as job
      where queue.job_kind = 'export'
        and queue.job_id = job.id and job.account_id = new.id
    );
  end if;
  return new;
end;
$function$;

create trigger profiles_cancel_portability_after_delete
after update of account_status on public.profiles
for each row execute function private.cancel_portability_for_deleted_account();

revoke all on function private.portability_job_exists(public.portability_job_kind, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.cancel_portability_for_deleted_account()
from public, anon, authenticated, service_role;
revoke all on function public.current_create_import_job(
  uuid, public.portability_job_kind, text, public.portability_format, text,
  bigint, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_create_export_job(
  uuid, text, public.portability_format, jsonb, jsonb, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_cancel_portability_job(public.portability_job_kind, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_retry_portability_job(public.portability_job_kind, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_register_portability_upload(
  uuid, uuid, text, text, text, bigint, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.admin_claim_portability_jobs(uuid, integer, integer)
from public, anon, authenticated, service_role;
revoke all on function public.admin_checkpoint_portability_job(
  public.portability_job_kind, uuid, uuid, text, text, integer, text,
  bigint, bigint, integer, integer, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_portability_job(
  public.portability_job_kind, uuid, uuid, public.portability_job_status,
  integer, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.admin_register_export_artifact(
  uuid, uuid, public.portability_format, text, text, bigint, text, integer,
  jsonb, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.admin_expire_portability_objects(integer)
from public, anon, authenticated, service_role;

grant execute on function public.current_create_import_job(
  uuid, public.portability_job_kind, text, public.portability_format, text,
  bigint, text, jsonb, text, uuid
) to authenticated;
grant execute on function public.current_create_export_job(
  uuid, text, public.portability_format, jsonb, jsonb, text, uuid
) to authenticated;
grant execute on function public.current_cancel_portability_job(public.portability_job_kind, uuid)
to authenticated;
grant execute on function public.current_retry_portability_job(public.portability_job_kind, uuid)
to authenticated;
grant execute on function public.admin_register_portability_upload(
  uuid, uuid, text, text, text, bigint, text, timestamptz
) to service_role;
grant execute on function public.admin_claim_portability_jobs(uuid, integer, integer)
to service_role;
grant execute on function public.admin_checkpoint_portability_job(
  public.portability_job_kind, uuid, uuid, text, text, integer, text,
  bigint, bigint, integer, integer, jsonb
) to service_role;
grant execute on function public.admin_complete_portability_job(
  public.portability_job_kind, uuid, uuid, public.portability_job_status,
  integer, integer, text, text
) to service_role;
grant execute on function public.admin_register_export_artifact(
  uuid, uuid, public.portability_format, text, text, bigint, text, integer,
  jsonb, text, timestamptz
) to service_role;
grant execute on function public.admin_expire_portability_objects(integer)
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lumen-portability',
  'lumen-portability',
  false,
  67108864,
  array[
    'application/json',
    'application/octet-stream',
    'application/vnd.anki',
    'application/vnd.lumen.archive+zip',
    'application/zip',
    'text/csv',
    'text/markdown',
    'text/plain',
    'text/tab-separated-values'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created for this bucket. Only trusted
-- server/worker service clients can read, write, sign, or remove these objects.

create or replace function public.admin_begin_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue private.portability_job_queue;
begin
  if p_worker_id is null or p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'invalid portability lease';
  end if;
  select * into v_queue
  from private.portability_job_queue as queue
  where queue.job_kind = p_job_kind
    and queue.job_id = p_job_id
    and (
      queue.lease_token is null
      or queue.lease_expires_at <= pg_catalog.now()
    )
    and queue.attempt_count < queue.maximum_attempts
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'portability job is already leased';
  end if;
  update private.portability_job_attempts
  set result = 'lease_expired', completed_at = pg_catalog.now()
  where queue_id = v_queue.id and result = 'running';
  update private.portability_job_queue
  set attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  where id = v_queue.id
  returning * into v_queue;
  insert into private.portability_job_attempts (
    queue_id, job_kind, job_id, attempt_number, worker_id, lease_token
  ) values (
    v_queue.id, v_queue.job_kind, v_queue.job_id, v_queue.attempt_count,
    p_worker_id, v_queue.lease_token
  );
  return v_queue.lease_token;
end;
$function$;

revoke all on function public.admin_begin_portability_job(
  public.portability_job_kind, uuid, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.admin_begin_portability_job(
  public.portability_job_kind, uuid, uuid, integer
) to service_role;

create or replace function public.admin_get_portability_artifact_object(
  p_artifact_id uuid,
  p_account_id uuid
)
returns table (
  storage_bucket text,
  storage_path text,
  display_name text,
  mime_type text,
  byte_size bigint,
  sha256 text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select object_record.storage_bucket, object_record.storage_path,
    artifact.display_name, artifact.mime_type, artifact.byte_size, artifact.sha256
  from public.export_artifacts as artifact
  join private.portability_artifact_objects as object_record
    on object_record.artifact_id = artifact.id
  where artifact.id = p_artifact_id
    and artifact.account_id = p_account_id
    and artifact.available
    and artifact.deleted_at is null
    and artifact.expires_at > pg_catalog.now()
    and object_record.deleted_at is null
  limit 1;
$function$;

create or replace function public.admin_delete_portability_artifact(
  p_artifact_id uuid,
  p_account_id uuid
)
returns table (
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  with target as (
    select object_record.artifact_id, object_record.storage_bucket, object_record.storage_path
    from private.portability_artifact_objects as object_record
    join public.export_artifacts as artifact on artifact.id = object_record.artifact_id
    where artifact.id = p_artifact_id
      and artifact.account_id = p_account_id
      and object_record.deleted_at is null
    for update of object_record
  ),
  marked_object as (
    update private.portability_artifact_objects as object_record
    set deleted_at = pg_catalog.now()
    from target
    where object_record.artifact_id = target.artifact_id
    returning object_record.storage_bucket, object_record.storage_path
  ),
  marked_artifact as (
    update public.export_artifacts as artifact
    set available = false, deleted_at = coalesce(deleted_at, pg_catalog.now())
    where artifact.id = p_artifact_id and artifact.account_id = p_account_id
    returning artifact.id
  )
  select marked_object.storage_bucket, marked_object.storage_path
  from marked_object, lateral (select pg_catalog.count(*) from marked_artifact) as completed;
end;
$function$;

revoke all on function public.admin_get_portability_artifact_object(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_portability_artifact(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_get_portability_artifact_object(uuid, uuid)
to service_role;
grant execute on function public.admin_delete_portability_artifact(uuid, uuid)
to service_role;

create or replace function public.admin_record_portability_job_item(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_lease_token uuid,
  p_item_key text,
  p_source_fingerprint text,
  p_canonical_id uuid,
  p_result text,
  p_safe_warning_codes text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.portability_job_items;
begin
  if p_item_key is null
    or pg_catalog.char_length(pg_catalog.btrim(p_item_key)) not between 1 and 200
    or p_source_fingerprint !~ '^[a-f0-9]{64}$'
    or p_result not in ('created', 'updated', 'skipped', 'failed')
    or coalesce(pg_catalog.cardinality(p_safe_warning_codes), 0) > 100
    or exists(
      select 1 from pg_catalog.unnest(coalesce(p_safe_warning_codes, '{}'::text[])) as warning(code)
      where warning.code !~ '^[A-Z0-9_]{1,80}$'
    )
  then
    raise exception using errcode = '22023', message = 'invalid portability item';
  end if;
  if not exists(
    select 1
    from private.portability_job_queue as queue
    where queue.job_kind = p_job_kind
      and queue.job_id = p_job_id
      and queue.lease_token = p_lease_token
      and queue.lease_expires_at > pg_catalog.now()
  ) then
    raise exception using errcode = '40001', message = 'portability lease is unavailable';
  end if;
  select * into v_existing
  from private.portability_job_items as item
  where item.job_kind = p_job_kind
    and item.job_id = p_job_id
    and item.item_key = p_item_key;
  if found then
    if v_existing.source_fingerprint is distinct from p_source_fingerprint then
      raise exception using errcode = '22023', message = 'portability item replay does not match';
    end if;
    return pg_catalog.jsonb_build_object(
      'canonicalId', v_existing.canonical_id,
      'duplicate', true,
      'result', v_existing.result
    );
  end if;
  insert into private.portability_job_items (
    job_kind, job_id, item_key, source_fingerprint, canonical_id,
    result, safe_warning_codes
  ) values (
    p_job_kind, p_job_id, p_item_key, p_source_fingerprint, p_canonical_id,
    p_result, coalesce(p_safe_warning_codes, '{}'::text[])
  );
  return pg_catalog.jsonb_build_object(
    'canonicalId', p_canonical_id,
    'duplicate', false,
    'result', p_result
  );
end;
$function$;

revoke all on function public.admin_record_portability_job_item(
  public.portability_job_kind, uuid, uuid, text, text, uuid, text, text[]
) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_portability_job_item(
  public.portability_job_kind, uuid, uuid, text, text, uuid, text, text[]
) to service_role;

create or replace function public.admin_restore_portability_progress_chunk(
  p_import_job_id uuid,
  p_account_id uuid,
  p_learner_profile_id uuid,
  p_lease_token uuid,
  p_card_id_map jsonb,
  p_schedules jsonb,
  p_reviews jsonb,
  p_progress_policy text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.import_jobs;
  v_timezone text;
  v_study_day_start smallint;
  v_empty boolean;
  v_schedule jsonb;
  v_review jsonb;
  v_values jsonb;
  v_external_id text;
  v_card_id uuid;
  v_deck_id uuid;
  v_content_version bigint;
  v_algorithm public.srs_algorithm;
  v_state public.srs_state;
  v_due timestamptz;
  v_reviewed_at timestamptz;
  v_factor integer;
  v_stability double precision;
  v_difficulty double precision;
  v_preset public.srs_presets;
  v_version bigint;
  v_schedules_restored integer := 0;
  v_reviews_restored integer := 0;
  v_skipped integer := 0;
begin
  if p_progress_policy not in ('omit', 'import_if_empty', 'merge_explicit')
    or p_card_id_map is null
    or pg_catalog.jsonb_typeof(p_card_id_map) <> 'object'
    or p_schedules is null
    or pg_catalog.jsonb_typeof(p_schedules) <> 'array'
    or pg_catalog.jsonb_array_length(p_schedules) > 1000
    or p_reviews is null
    or pg_catalog.jsonb_typeof(p_reviews) <> 'array'
    or pg_catalog.jsonb_array_length(p_reviews) > 1000
  then
    raise exception using errcode = '22023', message = 'invalid portability progress chunk';
  end if;
  select * into v_job
  from public.import_jobs as job
  where job.id = p_import_job_id
    and job.account_id = p_account_id
    and job.learner_profile_id = p_learner_profile_id
    and job.status = 'running';
  if not found or not exists(
    select 1
    from private.portability_job_queue as queue
    where queue.job_kind = v_job.kind
      and queue.job_id = v_job.id
      and queue.lease_token = p_lease_token
      and queue.lease_expires_at > pg_catalog.now()
  ) or not exists(
    select 1 from public.learner_profiles as learner
    where learner.id = p_learner_profile_id
      and learner.owner_account_id = p_account_id
      and learner.status <> 'deleted'
  ) then
    raise exception using errcode = '42501', message = 'portability progress target is unavailable';
  end if;
  if p_progress_policy = 'omit' then
    return pg_catalog.jsonb_build_object(
      'reviewsRestored', 0,
      'schedulesRestored', 0,
      'skipped', pg_catalog.jsonb_array_length(p_schedules) + pg_catalog.jsonb_array_length(p_reviews)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portability-progress:' || p_import_job_id::text, 0)
  );
  select profile.timezone, profile.study_day_start
  into v_timezone, v_study_day_start
  from public.profiles as profile
  where profile.id = p_account_id;
  select * into v_preset
  from public.srs_presets as preset
  where preset.learner_profile_id = p_learner_profile_id
    and preset.deleted_at is null
  order by preset.is_default desc, preset.created_at
  limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'learner preset is unavailable';
  end if;
  select not exists(
    select 1 from public.card_schedules as schedule
    where schedule.learner_profile_id = p_learner_profile_id
  ) and not exists(
    select 1 from public.review_logs as review
    where review.learner_profile_id = p_learner_profile_id
  ) into v_empty;
  if p_progress_policy = 'import_if_empty' and not v_empty then
    return pg_catalog.jsonb_build_object(
      'reviewsRestored', 0,
      'schedulesRestored', 0,
      'skipped', pg_catalog.jsonb_array_length(p_schedules) + pg_catalog.jsonb_array_length(p_reviews)
    );
  end if;

  for v_schedule in
    select value from pg_catalog.jsonb_array_elements(p_schedules)
  loop
    begin
      if pg_catalog.jsonb_typeof(v_schedule) <> 'object'
        or pg_catalog.jsonb_typeof(v_schedule -> 'values') <> 'object' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_external_id := v_schedule ->> 'cardExternalId';
      v_card_id := (p_card_id_map ->> v_external_id)::uuid;
      select note.deck_id, card.content_version
      into v_deck_id, v_content_version
      from public.cards as card
      join public.notes as note on note.id = card.note_id
      join public.decks as deck on deck.id = note.deck_id
      where card.id = v_card_id
        and card.active
        and card.deleted_at is null
        and note.deleted_at is null
        and deck.owner_account_id = p_account_id
        and deck.status <> 'deleted';
      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_values := v_schedule -> 'values';
      v_algorithm := case
        when v_schedule ->> 'algorithm' = 'fsrs'
          and (v_values ->> 'stability')::double precision >= 0
          and (v_values ->> 'difficulty')::double precision between 0 and 10
          then 'fsrs'::public.srs_algorithm
        else 'sm2'::public.srs_algorithm
      end;
      v_state := case
        when v_schedule ->> 'state' in ('new', 'learning', 'review', 'relearning')
          then (v_schedule ->> 'state')::public.srs_state
        when coalesce((v_values ->> 'queue')::integer, 0) = 1
          then 'learning'::public.srs_state
        when coalesce((v_values ->> 'queue')::integer, 0) = 2
          then 'review'::public.srs_state
        else 'new'::public.srs_state
      end;
      v_due := coalesce((v_schedule ->> 'dueAt')::timestamptz, pg_catalog.now());
      v_factor := pg_catalog.greatest(
        1300,
        pg_catalog.least(
          4000,
          coalesce(
            (v_values ->> 'legacyEaseFactor')::integer,
            (v_values ->> 'factor')::integer,
            2500
          )
        )
      );
      v_stability := case when v_algorithm = 'fsrs'
        then (v_values ->> 'stability')::double precision else null end;
      v_difficulty := case when v_algorithm = 'fsrs'
        then (v_values ->> 'difficulty')::double precision else null end;
      insert into public.card_schedules (
        learner_profile_id, card_id, algorithm, state, due, last_reviewed_at,
        stability, difficulty, elapsed_days, scheduled_days, learning_step,
        reps, lapses, legacy_ease_factor, scheduler_version, preset_version,
        content_version, version
      ) values (
        p_learner_profile_id, v_card_id, v_algorithm, v_state, v_due,
        (v_values ->> 'lastReviewedAt')::timestamptz,
        v_stability, v_difficulty,
        pg_catalog.greatest(0, coalesce((v_values ->> 'elapsedDays')::integer, 0)),
        pg_catalog.greatest(
          0,
          coalesce(
            (v_values ->> 'scheduledDays')::integer,
            (v_values ->> 'interval')::integer,
            0
          )
        ),
        pg_catalog.greatest(0, coalesce((v_values ->> 'learningStep')::integer, 0)),
        pg_catalog.greatest(
          0,
          coalesce((v_values ->> 'reps')::integer, (v_values ->> 'repetitions')::integer, 0)
        ),
        pg_catalog.greatest(0, coalesce((v_values ->> 'lapses')::integer, 0)),
        case when v_algorithm = 'sm2' then v_factor else null end,
        'lumen-import/phase-06/' || v_algorithm::text,
        pg_catalog.greatest(1, coalesce((v_values ->> 'presetVersion')::bigint, v_preset.version)),
        v_content_version,
        1
      )
      on conflict (learner_profile_id, card_id) do update
      set algorithm = excluded.algorithm,
          state = excluded.state,
          due = excluded.due,
          last_reviewed_at = excluded.last_reviewed_at,
          stability = excluded.stability,
          difficulty = excluded.difficulty,
          elapsed_days = excluded.elapsed_days,
          scheduled_days = excluded.scheduled_days,
          learning_step = excluded.learning_step,
          reps = excluded.reps,
          lapses = excluded.lapses,
          legacy_ease_factor = excluded.legacy_ease_factor,
          scheduler_version = excluded.scheduler_version,
          preset_version = excluded.preset_version,
          content_version = excluded.content_version,
          version = public.card_schedules.version + 1,
          updated_at = pg_catalog.now()
      where p_progress_policy = 'merge_explicit'
        and public.card_schedules.reps = 0;
      if found then
        v_schedules_restored := v_schedules_restored + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception
      when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
        v_skipped := v_skipped + 1;
    end;
  end loop;

  for v_review in
    select value from pg_catalog.jsonb_array_elements(p_reviews)
  loop
    begin
      if pg_catalog.jsonb_typeof(v_review) <> 'object'
        or pg_catalog.jsonb_typeof(v_review -> 'values') <> 'object'
        or v_review ->> 'rating' not in ('again', 'hard', 'good', 'easy') then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_external_id := v_review ->> 'externalId';
      if exists(
        select 1 from private.portability_job_items as item
        where item.job_kind = v_job.kind
          and item.job_id = p_import_job_id
          and item.item_key = pg_catalog.left('review:' || v_external_id, 200)
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_card_id := (p_card_id_map ->> (v_review ->> 'cardExternalId'))::uuid;
      select note.deck_id, card.content_version
      into v_deck_id, v_content_version
      from public.cards as card
      join public.notes as note on note.id = card.note_id
      join public.decks as deck on deck.id = note.deck_id
      where card.id = v_card_id
        and card.active
        and card.deleted_at is null
        and note.deleted_at is null
        and deck.owner_account_id = p_account_id
        and deck.status <> 'deleted';
      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_reviewed_at := (v_review ->> 'reviewedAt')::timestamptz;
      select pg_catalog.count(*)::bigint into v_version
      from public.review_logs as review
      where review.learner_profile_id = p_learner_profile_id
        and review.card_id = v_card_id;
      insert into public.review_logs (
        id, learner_profile_id, card_id, deck_id, study_session_id,
        actor_account_id, device_id, idempotency_key, command_hash, rating,
        reviewed_at, duration_ms, timezone, study_day_start, study_day, source,
        schedule_version_before, schedule_version_after, scheduler_version,
        preset_id, preset_version, content_version, schedule_before, schedule_after
      ) values (
        extensions.gen_random_uuid(), p_learner_profile_id, v_card_id, v_deck_id, null,
        p_account_id, null, extensions.gen_random_uuid(),
        private.content_hash(v_review),
        (v_review ->> 'rating')::public.review_rating,
        v_reviewed_at,
        pg_catalog.greatest(
          0,
          pg_catalog.least(86400000, coalesce((v_review ->> 'durationMs')::integer, 0))
        ),
        v_timezone, v_study_day_start,
        (v_reviewed_at at time zone v_timezone)::date,
        'import', v_version, v_version + 1,
        'lumen-import/phase-06',
        v_preset.id, v_preset.version, v_content_version,
        pg_catalog.jsonb_build_object(
          'imported', true,
          'sourceExternalId', v_external_id
        ),
        pg_catalog.jsonb_build_object(
          'imported', true,
          'sourceExternalId', v_external_id,
          'sourceValues', v_review -> 'values'
        )
      );
      insert into private.portability_job_items (
        job_kind, job_id, item_key, source_fingerprint, canonical_id, result
      ) values (
        v_job.kind, p_import_job_id, pg_catalog.left('review:' || v_external_id, 200),
        private.content_hash(v_review), v_card_id, 'created'
      );
      v_reviews_restored := v_reviews_restored + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range
        or not_null_violation or unique_violation then
        v_skipped := v_skipped + 1;
    end;
  end loop;
  return pg_catalog.jsonb_build_object(
    'reviewsRestored', v_reviews_restored,
    'schedulesRestored', v_schedules_restored,
    'skipped', v_skipped
  );
end;
$function$;

revoke all on function public.admin_restore_portability_progress_chunk(
  uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_restore_portability_progress_chunk(
  uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, text
) to service_role;
