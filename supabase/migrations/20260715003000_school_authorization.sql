begin;

-- School-managed learner creation is deliberately separate from the default
-- account `teach` capability. A trusted server adapter must first exchange its
-- provider evidence for a short-lived, single-use authorization proof. Only
-- digests and opaque UUIDs are retained here; raw provider evidence and bearer
-- credentials must stay outside Postgres.
create table private.school_authorization_proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  owner_account_id uuid not null references public.profiles (id) on delete restrict,
  proof_hash bytea,
  evidence_reference_hash bytea not null,
  expires_at timestamptz not null,
  issued_at timestamptz not null default pg_catalog.now(),
  issue_idempotency_key uuid not null,
  consumed_at timestamptz,
  consumed_learner_profile_id uuid references public.learner_profiles (id) on delete restrict,
  consumption_idempotency_key uuid,
  revoked_at timestamptz,
  revocation_reason text,
  constraint school_authorization_proofs_proof_hash_length check (
    proof_hash is null or pg_catalog.octet_length(proof_hash) = 32
  ),
  constraint school_authorization_proofs_evidence_hash_length check (
    pg_catalog.octet_length(evidence_reference_hash) = 32
  ),
  constraint school_authorization_proofs_distinct_hashes check (
    proof_hash <> evidence_reference_hash
  ),
  constraint school_authorization_proofs_short_lived check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '15 minutes'
  ),
  constraint school_authorization_proofs_state_complete check (
    (
      consumed_at is null
      and consumed_learner_profile_id is null
      and consumption_idempotency_key is null
      and revoked_at is null
      and revocation_reason is null
      and proof_hash is not null
    )
    or (
      consumed_at is not null
      and consumed_learner_profile_id is not null
      and consumption_idempotency_key is not null
      and consumed_at >= issued_at
      and consumed_at <= expires_at
      and revoked_at is null
      and revocation_reason is null
      and proof_hash is null
    )
    or (
      consumed_at is null
      and consumed_learner_profile_id is null
      and consumption_idempotency_key is null
      and revoked_at is not null
      and revoked_at >= issued_at
      and revocation_reason in ('account_deletion', 'provider_revoked', 'superseded')
      and proof_hash is null
    )
  ),
  unique (proof_hash),
  unique (evidence_reference_hash),
  unique (actor_account_id, issue_idempotency_key)
);

create index school_authorization_proofs_actor_owner_expiry_idx
on private.school_authorization_proofs (actor_account_id, owner_account_id, expires_at)
where proof_hash is not null;

create unique index school_authorization_proofs_consumption_idempotency_idx
on private.school_authorization_proofs (actor_account_id, consumption_idempotency_key)
where consumption_idempotency_key is not null;

comment on table private.school_authorization_proofs is
  'Private ledger of hashed, service-issued, short-lived, one-time school authorization proofs.';

create or replace function private.guard_school_authorization_proof()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'school authorization proofs cannot be deleted';
  end if;

  if new.id is distinct from old.id
    or new.actor_account_id is distinct from old.actor_account_id
    or new.owner_account_id is distinct from old.owner_account_id
    or new.evidence_reference_hash is distinct from old.evidence_reference_hash
    or new.expires_at is distinct from old.expires_at
    or new.issued_at is distinct from old.issued_at
    or new.issue_idempotency_key is distinct from old.issue_idempotency_key then
    raise exception using errcode = '55000', message = 'school authorization proof identity is immutable';
  end if;

  if old.consumed_at is not null or old.revoked_at is not null then
    raise exception using errcode = '55000', message = 'school authorization proof is already finalized';
  end if;

  if new.proof_hash is not null then
    raise exception using errcode = '55000', message = 'school authorization proof finalization is incomplete';
  end if;

  if new.consumed_at is not null
    and new.consumed_learner_profile_id is not null
    and new.consumption_idempotency_key is not null
    and new.revoked_at is null
    and new.revocation_reason is null then
    return new;
  end if;

  if new.consumed_at is null
    and new.consumed_learner_profile_id is null
    and new.consumption_idempotency_key is null
    and new.revoked_at is not null
    and new.revocation_reason in ('account_deletion', 'provider_revoked', 'superseded') then
    if new.revocation_reason = 'account_deletion'
      and pg_catalog.current_setting('lumen.account_deletion_subject', true)
        is distinct from new.actor_account_id::text
      and pg_catalog.current_setting('lumen.account_deletion_subject', true)
        is distinct from new.owner_account_id::text then
      raise exception using errcode = '55000', message = 'account deletion proof revocation requires the deletion worker';
    end if;
    return new;
  end if;

  raise exception using errcode = '55000', message = 'school authorization proof finalization is incomplete';
end;
$function$;

create trigger school_authorization_proofs_guard
before update or delete on private.school_authorization_proofs
for each row execute function private.guard_school_authorization_proof();

create or replace function public.admin_issue_school_authorization(
  p_actor_account_id uuid,
  p_owner_account_id uuid,
  p_proof_hash bytea,
  p_evidence_reference_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization private.school_authorization_proofs;
  v_now timestamptz := pg_catalog.now();
begin
  if p_idempotency_key is null
    or pg_catalog.octet_length(p_proof_hash) <> 32
    or pg_catalog.octet_length(p_evidence_reference_hash) <> 32
    or p_proof_hash = p_evidence_reference_hash
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'invalid school authorization proof';
  end if;

  if not private.has_account_capability(p_actor_account_id, 'teach')
    or not exists(
      select 1
      from public.profiles as actor
      where actor.id = p_actor_account_id
        and actor.account_status = 'active'
    )
    or not exists(
      select 1
      from public.profiles as owner_account
      where owner_account.id = p_owner_account_id
        and owner_account.account_status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'school authorization cannot be issued';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'school-authorization-issue:' || p_actor_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select proof_record.* into v_authorization
  from private.school_authorization_proofs as proof_record
  where proof_record.actor_account_id = p_actor_account_id
    and proof_record.issue_idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_authorization.owner_account_id <> p_owner_account_id
      or (
        v_authorization.proof_hash is not null
        and v_authorization.proof_hash <> p_proof_hash
      )
      or v_authorization.evidence_reference_hash <> p_evidence_reference_hash
      or v_authorization.expires_at <> p_expires_at then
      raise exception using errcode = '22023', message = 'school authorization replay does not match';
    end if;
    return v_authorization.id;
  end if;

  insert into private.school_authorization_proofs (
    actor_account_id,
    owner_account_id,
    proof_hash,
    evidence_reference_hash,
    expires_at,
    issue_idempotency_key
  ) values (
    p_actor_account_id,
    p_owner_account_id,
    p_proof_hash,
    p_evidence_reference_hash,
    p_expires_at,
    p_idempotency_key
  )
  returning * into v_authorization;

  perform private.write_audit_event(
    'account',
    p_actor_account_id,
    null,
    null,
    'learner.school_authorization_issued',
    'school_authorization_proof',
    v_authorization.id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('owner_account_id', p_owner_account_id)
  );

  return v_authorization.id;
end;
$function$;

revoke all on function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;

drop function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  uuid
);

create or replace function public.admin_create_school_managed_learner(
  p_actor_account_id uuid,
  p_owner_account_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_age_band public.age_band,
  p_avatar_seed text,
  p_settings jsonb,
  p_authorization_proof_hash bytea,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization private.school_authorization_proofs;
  v_learner_profile_id uuid;
begin
  if p_idempotency_key is null
    or pg_catalog.octet_length(p_authorization_proof_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid school-managed profile request';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or pg_catalog.char_length(pg_catalog.btrim(p_pseudonym)) not between 2 and 40
    or pg_catalog.char_length(p_avatar_seed) not between 1 and 64
    or p_avatar_seed !~ '^[A-Za-z0-9_-]+$'
    or pg_catalog.jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid school-managed profile fields';
  end if;

  if not private.has_account_capability(p_actor_account_id, 'teach')
    or not exists(
      select 1
      from public.profiles as actor
      where actor.id = p_actor_account_id
        and actor.account_status = 'active'
    )
    or not exists(
      select 1
      from public.profiles as owner_account
      where owner_account.id = p_owner_account_id
        and owner_account.account_status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'school-managed profile is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'school-authorization-consume:' || p_actor_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select proof_record.* into v_authorization
  from private.school_authorization_proofs as proof_record
  where proof_record.actor_account_id = p_actor_account_id
    and proof_record.owner_account_id = p_owner_account_id
    and proof_record.consumption_idempotency_key = p_idempotency_key
  for update;

  if found and v_authorization.consumed_learner_profile_id is not null then
    return v_authorization.consumed_learner_profile_id;
  end if;

  select proof_record.* into v_authorization
  from private.school_authorization_proofs as proof_record
  where proof_record.actor_account_id = p_actor_account_id
    and proof_record.owner_account_id = p_owner_account_id
    and proof_record.proof_hash = p_authorization_proof_hash
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'school authorization proof is unavailable';
  end if;

  if v_authorization.expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501', message = 'school authorization proof is unavailable';
  end if;

  v_learner_profile_id := extensions.gen_random_uuid();
  insert into public.learner_profiles (
    id,
    kind,
    owner_account_id,
    display_name,
    pseudonym,
    age_band,
    avatar_seed,
    status,
    settings
  ) values (
    v_learner_profile_id,
    'school_managed',
    p_owner_account_id,
    pg_catalog.btrim(p_display_name),
    pg_catalog.btrim(p_pseudonym),
    p_age_band,
    p_avatar_seed,
    'active',
    coalesce(p_settings, '{}'::jsonb)
  );

  insert into public.learner_profile_access (
    learner_profile_id,
    account_id,
    role,
    permissions,
    granted_by,
    idempotency_key
  ) values (
    v_learner_profile_id,
    p_owner_account_id,
    'school_admin',
    array[
      'view',
      'study',
      'manage',
      'manage_consent',
      'export_data',
      'request_deletion',
      'observe'
    ]::public.learner_permission[],
    p_actor_account_id,
    p_idempotency_key
  );

  update private.school_authorization_proofs
  set
    proof_hash = null,
    consumed_at = pg_catalog.now(),
    consumed_learner_profile_id = v_learner_profile_id,
    consumption_idempotency_key = p_idempotency_key
  where id = v_authorization.id;

  perform private.write_audit_event(
    'account',
    p_actor_account_id,
    v_learner_profile_id,
    null,
    'learner.school_profile_created',
    'learner_profile',
    v_learner_profile_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'owner_account_id', p_owner_account_id,
      'authorization_proof_id', v_authorization.id
    )
  );

  return v_learner_profile_id;
end;
$function$;

revoke all on table private.school_authorization_proofs
from public, anon, authenticated, service_role;
revoke all on function private.guard_school_authorization_proof()
from public, anon, authenticated, service_role;
revoke all on function public.admin_issue_school_authorization(
  uuid,
  uuid,
  bytea,
  bytea,
  timestamptz,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  bytea,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.admin_issue_school_authorization(
  uuid,
  uuid,
  bytea,
  bytea,
  timestamptz,
  uuid
) to service_role;
grant execute on function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  bytea,
  uuid
) to service_role;

comment on function public.admin_issue_school_authorization(
  uuid,
  uuid,
  bytea,
  bytea,
  timestamptz,
  uuid
) is
  'Records a hashed, service-owned school authorization proof after upstream evidence verification.';
comment on function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  bytea,
  uuid
) is
  'Creates one school-managed learner by consuming a matching, unexpired, single-use school authorization proof.';

commit;
