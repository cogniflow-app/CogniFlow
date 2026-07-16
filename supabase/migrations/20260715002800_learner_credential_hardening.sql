-- New family codes carry 80 bits of randomness and use a slow salted digest.
-- Legacy 32-byte SHA-256 values remain readable only to avoid invalidating an
-- applied deployment before a guardian can rotate them.

alter table private.learner_profile_credentials
drop constraint learner_profile_credentials_family_hash_length;
alter table private.learner_profile_credentials
add constraint learner_profile_credentials_family_hash_length check (
  pg_catalog.octet_length(family_code_hash) in (32, 60)
);

create or replace function public.admin_set_learner_profile_credentials(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_pin text,
  p_family_code text,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_family_code text := pg_catalog.regexp_replace(
    pg_catalog.upper(pg_catalog.btrim(p_family_code)), '[[:space:]-]+', '', 'g'
  );
begin
  if not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage')
    or not exists(
      select 1 from public.learner_profiles
      where id = p_learner_profile_id and kind in ('child', 'school_managed') and status <> 'deleted'
    ) then
    raise exception using errcode = '42501', message = 'learner credentials cannot be changed';
  end if;
  if p_pin !~ '^[0-9]{6,12}$'
    or p_pin ~ '^([0-9])\1+$'
    or p_pin in ('123456', '654321', '012345', '543210')
    or v_family_code !~ '^[A-HJ-NP-Z2-9]{16}$' then
    raise exception using errcode = '22023', message = 'invalid learner credentials';
  end if;

  insert into private.learner_profile_credentials (
    learner_profile_id, pin_hash, family_code_hash
  ) values (
    p_learner_profile_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
    pg_catalog.convert_to(
      extensions.crypt(v_family_code, extensions.gen_salt('bf', 12)), 'UTF8'
    )
  )
  on conflict (learner_profile_id)
  do update set
    pin_hash = excluded.pin_hash,
    family_code_hash = excluded.family_code_hash,
    version = private.learner_profile_credentials.version + 1;

  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, 'credentials rotated')
  where learner_profile_id = p_learner_profile_id and revoked_at is null;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.credentials_rotated', 'learner_profile', p_learner_profile_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function private.verify_learner_profile_credentials(
  p_learner_profile_id uuid,
  p_family_code text,
  p_pin text,
  p_subject_hash bytea,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject_allowed boolean;
  v_profile_allowed boolean;
  v_pin_hash text;
  v_family_code_hash bytea;
  v_family_hash_text text;
  v_normalized_family_code text;
  v_profile_subject bytea;
  v_family_matches boolean := false;
begin
  select rate.allowed into v_subject_allowed
  from private.consume_rate_limit(
    'profile_pin_subject:' || p_learner_profile_id::text, p_subject_hash, 5, 900, p_now
  ) as rate;
  v_profile_subject := extensions.digest(p_learner_profile_id::text, 'sha256');
  select rate.allowed into v_profile_allowed
  from private.consume_rate_limit(
    'profile_pin_profile', v_profile_subject, 20, 900, p_now
  ) as rate;
  if not v_subject_allowed or not v_profile_allowed then return false; end if;

  select credential.pin_hash, credential.family_code_hash
  into v_pin_hash, v_family_code_hash
  from private.learner_profile_credentials as credential
  join public.learner_profiles as learner on learner.id = credential.learner_profile_id
  where credential.learner_profile_id = p_learner_profile_id and learner.status = 'active';
  if v_pin_hash is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 12));
    return false;
  end if;

  v_normalized_family_code := pg_catalog.regexp_replace(
    pg_catalog.upper(pg_catalog.btrim(p_family_code)), '[[:space:]-]+', '', 'g'
  );
  if pg_catalog.octet_length(v_family_code_hash) = 60 then
    v_family_hash_text := pg_catalog.convert_from(v_family_code_hash, 'UTF8');
    v_family_matches := extensions.crypt(v_normalized_family_code, v_family_hash_text) = v_family_hash_text;
  elsif pg_catalog.octet_length(v_family_code_hash) = 32 then
    v_family_matches := extensions.digest(v_normalized_family_code, 'sha256') = v_family_code_hash;
  end if;
  return v_family_matches and extensions.crypt(p_pin, v_pin_hash) = v_pin_hash;
exception when others then
  return false;
end;
$function$;

create or replace function public.admin_configure_learner_profile_access(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_pin text,
  p_family_code text,
  p_lock_after_minutes integer,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant_id uuid;
  v_learner public.learner_profiles;
  v_settings jsonb;
begin
  if exists(
    select 1 from public.audit_events
    where actor_account_id = p_actor_account_id
      and event_type = 'learner.profile_access_configured'
      and correlation_id = p_idempotency_key
  ) then
    return false;
  end if;
  if p_lock_after_minutes not between 5 and 30 then
    raise exception using errcode = '22023', message = 'invalid profile lock duration';
  end if;
  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = p_actor_account_id
    and grant_record.purpose = 'security_change'
    and grant_record.proof_hash = p_reauthentication_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;
  select * into v_learner from public.learner_profiles
  where id = p_learner_profile_id and kind <> 'self' for update;
  if not found or not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage') then
    raise exception using errcode = '42501', message = 'learner profile access cannot be configured';
  end if;
  update private.reauthentication_grants set consumed_at = pg_catalog.now() where id = v_grant_id;
  perform public.admin_set_learner_profile_credentials(
    p_actor_account_id, p_learner_profile_id, p_pin, p_family_code, p_idempotency_key
  );
  v_settings := pg_catalog.jsonb_set(
    coalesce(v_learner.settings, '{}'::jsonb),
    '{lock_after_minutes}', pg_catalog.to_jsonb(p_lock_after_minutes), true
  );
  perform public.admin_update_learner_profile(
    p_actor_account_id, p_learner_profile_id,
    coalesce(v_learner.display_name, v_learner.pseudonym), v_learner.pseudonym,
    v_learner.avatar_seed, v_settings, p_idempotency_key
  );
  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.profile_access_configured', 'learner_profile', p_learner_profile_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('lock_after_minutes', p_lock_after_minutes)
  );
  return true;
end;
$function$;

revoke all on function public.admin_configure_learner_profile_access(uuid, uuid, text, text, integer, bytea, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_configure_learner_profile_access(uuid, uuid, text, text, integer, bytea, uuid) to service_role;
