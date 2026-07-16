begin;

-- School authorization proves that a trusted adapter approved the actor/owner
-- pair; it must not turn arbitrary learner JSON into trusted persisted state.
-- Keep the existing proof-consumption transaction, but close the learner
-- payload to the minor age bands and privacy-safe settings supported by the
-- managed-learner UI.
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
  v_settings jsonb;
begin
  if p_idempotency_key is null
    or p_authorization_proof_hash is null
    or pg_catalog.octet_length(p_authorization_proof_hash) is distinct from 32 then
    raise exception using errcode = '22023', message = 'invalid school-managed profile request';
  end if;

  if p_age_band is null
    or not (p_age_band = any(array['under_13', 'teen']::public.age_band[]))
    or p_display_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or p_pseudonym is null
    or pg_catalog.char_length(pg_catalog.btrim(p_pseudonym)) not between 2 and 40
    or p_avatar_seed is null
    or pg_catalog.char_length(p_avatar_seed) not between 1 and 64
    or p_avatar_seed !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'invalid school-managed profile fields';
  end if;

  if p_settings is null
    or pg_catalog.jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid school-managed profile settings';
  end if;

  if not (p_settings ?& array[
      'analytics',
      'public_content',
      'reading_style',
      'reduced_motion',
      'serious_mode',
      'social_interactions',
      'theme'
    ]::text[])
    or exists(
      select 1
      from pg_catalog.jsonb_object_keys(p_settings) as setting_key
      where setting_key <> all(array[
        'analytics',
        'public_content',
        'reading_style',
        'reduced_motion',
        'serious_mode',
        'social_interactions',
        'theme'
      ]::text[])
    ) then
    raise exception using errcode = '22023', message = 'invalid school-managed profile settings';
  end if;

  if p_settings -> 'analytics' is distinct from '"essential_only"'::jsonb
    or p_settings -> 'public_content' is distinct from 'false'::jsonb
    or p_settings -> 'social_interactions' is distinct from 'false'::jsonb
    or coalesce(p_settings ->> 'theme', '') not in ('system', 'light', 'dark')
    or coalesce(p_settings ->> 'reading_style', '') not in (
      'standard',
      'increased_spacing'
    )
    or pg_catalog.jsonb_typeof(p_settings -> 'reduced_motion') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_settings -> 'serious_mode') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'invalid school-managed profile settings';
  end if;

  -- Build the stored document from validated scalar fields. Even if a future
  -- caller changes JSON serialization details, no unreviewed key can be copied
  -- into learner state.
  v_settings := pg_catalog.jsonb_build_object(
    'analytics', 'essential_only',
    'public_content', false,
    'reading_style', p_settings ->> 'reading_style',
    'reduced_motion', (p_settings ->> 'reduced_motion')::boolean,
    'serious_mode', (p_settings ->> 'serious_mode')::boolean,
    'social_interactions', false,
    'theme', p_settings ->> 'theme'
  );

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
    v_settings
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
  'Creates a minor school-managed learner from a matching one-time authorization and a closed privacy-safe settings payload.';

commit;
