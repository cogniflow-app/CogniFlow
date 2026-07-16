begin;

-- `profiles.id` is a durable, opaque application identity used by immutable
-- consent and audit ledgers.  Keep that tombstone identity after the Auth
-- principal is removed, while retaining a real foreign key for live accounts.
alter table public.profiles
add column auth_subject_id uuid;

update public.profiles
set auth_subject_id = id
where auth_subject_id is null;

alter table public.profiles
drop constraint profiles_id_fkey;

alter table public.profiles
add constraint profiles_auth_subject_id_fkey
foreign key (auth_subject_id)
references auth.users (id)
on delete set null;

create unique index profiles_auth_subject_id_unique_idx
on public.profiles (auth_subject_id)
where auth_subject_id is not null;

alter table public.profiles
add column deletion_tombstone_id uuid,
add column deleted_at timestamptz,
add constraint profiles_deleted_state_complete check (
  account_status <> 'deleted'
  or (
    auth_subject_id is null
    and deletion_tombstone_id is not null
    and deleted_at is not null
  )
);

create unique index profiles_deletion_tombstone_unique_idx
on public.profiles (deletion_tombstone_id)
where deletion_tombstone_id is not null;

-- A child record may be minimized to an unknown age band after deletion.  This
-- relaxes no active-account eligibility rule; child creation still accepts only
-- under_13 or teen through its guarded RPC.
alter table public.learner_profiles
drop constraint learner_profiles_child_age;

alter table public.learner_profiles
add constraint learner_profiles_child_age check (
  kind <> 'child' or age_band in ('under_13', 'teen', 'unknown')
);

alter table public.deletion_jobs
add column completion_idempotency_key uuid,
add column account_tombstone_id uuid;

create unique index deletion_jobs_completion_idempotency_unique_idx
on public.deletion_jobs (completion_idempotency_key)
where completion_idempotency_key is not null;

create or replace function private.set_profile_auth_subject()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.auth_subject_id is null then
    new.auth_subject_id := new.id;
  end if;

  if new.auth_subject_id <> new.id then
    raise exception using
      errcode = '22023',
      message = 'profile and auth subject identities must match';
  end if;

  return new;
end;
$function$;

create trigger profiles_set_auth_subject
before insert on public.profiles
for each row execute function private.set_profile_auth_subject();

create or replace function private.guard_deleted_auth_subject_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists(
    select 1
    from public.profiles as profile
    where profile.id = new.id
      and profile.account_status = 'deleted'
      and profile.auth_subject_id is null
  ) then
    raise exception using
      errcode = '23505',
      message = 'deleted auth subject cannot be reused';
  end if;

  return new;
end;
$function$;

create trigger auth_users_reject_deleted_subject_reuse
before insert on auth.users
for each row execute function private.guard_deleted_auth_subject_reuse();

create or replace function private.guard_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists(
    select 1
    from public.profiles as profile
    where profile.id = old.id
  )
    and pg_catalog.current_setting('lumen.account_deletion_subject', true)
      is distinct from old.id::text then
    raise exception using
      errcode = '55000',
      message = 'auth account deletion requires the due deletion worker';
  end if;

  return old;
end;
$function$;

create trigger auth_users_require_deletion_worker
before delete on auth.users
for each row execute function private.guard_auth_user_deletion();

create or replace function private.guard_live_account_privacy_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := new.account_id;
begin
  if not exists(
    select 1
    from public.profiles as profile
    where profile.id = v_account_id
      and profile.auth_subject_id is not null
      and profile.account_status in ('onboarding', 'active', 'pending_deletion')
  ) then
    raise exception using
      errcode = '42501',
      message = 'account is unavailable';
  end if;

  return new;
end;
$function$;

create trigger privacy_preferences_require_live_account
before update on public.privacy_preferences
for each row execute function private.guard_live_account_privacy_mutation();

create trigger privacy_requests_require_live_account
before insert on public.privacy_requests
for each row execute function private.guard_live_account_privacy_mutation();

create or replace function public.admin_process_account_deletion(
  p_deletion_job_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.deletion_jobs;
  v_profile public.profiles;
  v_now timestamptz := pg_catalog.now();
  v_tombstone_id uuid;
begin
  if p_deletion_job_id is null or p_idempotency_key is null then
    raise exception using
      errcode = '22023',
      message = 'deletion job and idempotency key are required';
  end if;

  select job.* into v_job
  from public.deletion_jobs as job
  where job.id = p_deletion_job_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'deletion job is unavailable';
  end if;

  if v_job.status = 'completed' then
    if v_job.completion_idempotency_key is distinct from p_idempotency_key
      or v_job.account_tombstone_id is null then
      raise exception using
        errcode = '55000',
        message = 'deletion job was completed by another operation';
    end if;

    return v_job.account_tombstone_id;
  end if;

  if v_job.status <> 'queued' or v_job.execute_after > v_now then
    raise exception using
      errcode = '55000',
      message = 'deletion grace period has not elapsed';
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = v_job.account_id
  for update;

  if not found
    or v_profile.account_status <> 'pending_deletion'
    or v_profile.auth_subject_id is distinct from v_job.account_id then
    raise exception using
      errcode = '55000',
      message = 'account is not pending deletion';
  end if;

  v_tombstone_id := coalesce(
    v_profile.deletion_tombstone_id,
    extensions.gen_random_uuid()
  );

  -- Private proof-ledger triggers use this transaction-local subject to allow
  -- only the deletion worker's active-to-revoked transition. The same gate is
  -- required below when the live Supabase Auth principal is removed.
  perform pg_catalog.set_config(
    'lumen.account_deletion_subject',
    v_job.account_id::text,
    true
  );

  update public.deletion_jobs
  set
    status = 'processing',
    completion_idempotency_key = p_idempotency_key,
    account_tombstone_id = v_tombstone_id
  where id = v_job.id;

  update public.privacy_requests
  set status = 'processing'
  where id = v_job.privacy_request_id;

  -- Consent history is never rewritten.  Every still-active grant connected to
  -- the deleted account or one of its owned learner profiles receives an
  -- append-only compensating revocation before the profile is tombstoned.
  insert into public.consent_records (
    learner_profile_id,
    guardian_account_id,
    consent_type,
    action,
    policy_version,
    scope,
    verification_method,
    prior_consent_record_id,
    evidence_reference,
    reason,
    idempotency_key,
    recorded_at
  )
  select
    grant_record.learner_profile_id,
    grant_record.guardian_account_id,
    grant_record.consent_type,
    'revoked',
    grant_record.policy_version,
    grant_record.scope,
    grant_record.verification_method,
    grant_record.id,
    null,
    'account deletion completed',
    extensions.gen_random_uuid(),
    v_now
  from public.consent_records as grant_record
  where grant_record.action = 'granted'
    and (
      grant_record.guardian_account_id = v_job.account_id
      or grant_record.learner_profile_id in (
        select learner.id
        from public.learner_profiles as learner
        where learner.owner_account_id = v_job.account_id
      )
    )
    and not exists(
      select 1
      from public.consent_records as revocation
      where revocation.prior_consent_record_id = grant_record.id
        and revocation.action = 'revoked'
    )
  on conflict (prior_consent_record_id) where action = 'revoked'
  do nothing;

  update public.guardian_relationships as relationship
  set
    status = 'revoked',
    revoked_at = coalesce(relationship.revoked_at, v_now),
    verification_metadata = '{"tombstoned":true}'::jsonb
  where relationship.guardian_account_id = v_job.account_id
    or relationship.learner_profile_id in (
      select learner.id
      from public.learner_profiles as learner
      where learner.owner_account_id = v_job.account_id
    );

  update public.learner_profile_access as access
  set revoked_at = coalesce(access.revoked_at, v_now)
  where access.account_id = v_job.account_id
    or access.learner_profile_id in (
      select learner.id
      from public.learner_profiles as learner
      where learner.owner_account_id = v_job.account_id
    );

  update public.account_capabilities as capability
  set revoked_at = coalesce(capability.revoked_at, v_now)
  where capability.account_id = v_job.account_id;

  delete from public.profile_sessions
  where account_id = v_job.account_id
    or learner_profile_id in (
      select learner.id
      from public.learner_profiles as learner
      where learner.owner_account_id = v_job.account_id
    );

  delete from private.learner_profile_credentials
  where learner_profile_id in (
    select learner.id
    from public.learner_profiles as learner
    where learner.owner_account_id = v_job.account_id
  );

  delete from public.devices
  where account_id = v_job.account_id;

  delete from private.reauthentication_grants
  where account_id = v_job.account_id;

  update private.school_authorization_proofs as proof_record
  set
    proof_hash = null,
    revoked_at = v_now,
    revocation_reason = 'account_deletion'
  where (
    proof_record.actor_account_id = v_job.account_id
    or proof_record.owner_account_id = v_job.account_id
  )
    and proof_record.consumed_at is null
    and proof_record.revoked_at is null;

  delete from private.rate_limit_buckets
  where subject_hash = extensions.digest(v_job.account_id::text, 'sha256');

  -- Request-adapter subjects use a server-keyed HMAC and therefore cannot be
  -- correlated back to this account inside Postgres. They contain no raw
  -- address/account value and remain only until the bucket's bounded expiry.

  update public.data_export_jobs
  set
    status = case
      when status in ('queued', 'processing') then 'cancelled'::public.request_status
      else status
    end,
    result_available = false,
    error_code = case
      when status in ('queued', 'processing') then 'account_deleted'
      else error_code
    end,
    completed_at = case
      when status in ('queued', 'processing') then coalesce(completed_at, v_now)
      else completed_at
    end,
    expires_at = case
      when result_available or expires_at > v_now then v_now
      else expires_at
    end
  where account_id = v_job.account_id;

  update public.privacy_requests
  set
    status = 'cancelled',
    details = '{}'::jsonb,
    completed_at = coalesce(completed_at, v_now)
  where account_id = v_job.account_id
    and id <> v_job.privacy_request_id
    and status in ('queued', 'processing');

  update public.privacy_requests
  set details = '{}'::jsonb
  where account_id = v_job.account_id;

  update public.privacy_preferences
  set
    first_party_analytics = false,
    allow_product_updates = false,
    allow_social_interactions = false,
    default_content_private = true,
    targeted_advertising = false,
    data_sale = false
  where account_id = v_job.account_id;

  update public.learner_profiles as learner
  set
    display_name = null,
    pseudonym = 'Deleted-' || pg_catalog.substr(
      pg_catalog.encode(extensions.digest(learner.id::text, 'sha256'), 'hex'),
      1,
      12
    ),
    age_band = 'unknown',
    avatar_seed = 'deleted-' || pg_catalog.substr(
      pg_catalog.encode(extensions.digest(learner.id::text, 'sha256'), 'hex'),
      1,
      24
    ),
    status = 'deleted',
    settings = '{}'::jsonb
  where learner.owner_account_id = v_job.account_id;

  -- The trigger below deliberately permits only this transaction-scoped Auth
  -- subject.  Removing auth.users also removes the provider identities and
  -- active Auth sessions managed by Supabase.
  delete from auth.users
  where id = v_job.account_id;

  update public.profiles
  set
    handle = null,
    display_name = null,
    locale = 'und',
    timezone = 'UTC',
    study_day_start = 0,
    age_band = 'unknown',
    account_status = 'deleted',
    learning_goals = '{}'::text[],
    theme = 'system',
    reduced_motion = false,
    serious_mode = true,
    onboarding_completed_at = null,
    deletion_tombstone_id = v_tombstone_id,
    deleted_at = v_now
  where id = v_job.account_id
    and auth_subject_id is null;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'auth identity could not be removed';
  end if;

  update public.deletion_jobs
  set
    status = 'completed',
    completed_at = v_now
  where id = v_job.id;

  update public.privacy_requests
  set
    status = 'completed',
    completed_at = v_now
  where id = v_job.privacy_request_id;

  perform private.write_audit_event(
    'system',
    v_job.account_id,
    null,
    null,
    'privacy.account_deletion_completed',
    'deletion_job',
    v_job.id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('account_tombstone_id', v_tombstone_id)
  );

  return v_tombstone_id;
end;
$function$;

revoke all on function private.set_profile_auth_subject() from public, anon, authenticated, service_role;
revoke all on function private.guard_deleted_auth_subject_reuse() from public, anon, authenticated, service_role;
revoke all on function private.guard_auth_user_deletion() from public, anon, authenticated, service_role;
revoke all on function private.guard_live_account_privacy_mutation() from public, anon, authenticated, service_role;

revoke all on function public.admin_process_account_deletion(uuid, uuid) from public;
revoke all on function public.admin_process_account_deletion(uuid, uuid) from anon;
revoke all on function public.admin_process_account_deletion(uuid, uuid) from authenticated;
grant execute on function public.admin_process_account_deletion(uuid, uuid) to service_role;

comment on column public.profiles.id is
  'Durable opaque application identity. Retained as a tombstone so immutable consent and audit ledgers remain referentially intact after Auth deletion.';
comment on column public.profiles.auth_subject_id is
  'Live Supabase Auth principal. Set to null by the deletion worker while profiles.id remains as a pseudonymous tombstone.';
comment on column public.profiles.deletion_tombstone_id is
  'Rotated opaque deletion receipt identifier; populated only after the Auth principal and personal profile fields are removed.';
comment on function public.admin_process_account_deletion(uuid, uuid) is
  'Service-only idempotent worker boundary. Processes one due deletion job, removes the Auth principal and secrets, minimizes mutable identity rows, and preserves append-only consent/audit evidence against opaque tombstones.';

commit;
