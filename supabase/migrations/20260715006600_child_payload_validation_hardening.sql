-- Treat every service-bound child payload as untrusted. SQL three-valued
-- comparisons must not allow missing or JSON-null values to bypass validation.

create or replace function public.admin_issue_verified_child_creation_authorization(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_age_band public.age_band,
  p_avatar_seed text,
  p_consent_type public.consent_type,
  p_policy_version text,
  p_consent_scope jsonb,
  p_verification_method public.consent_verification_method,
  p_evidence_reference text,
  p_settings jsonb,
  p_proof_hash bytea,
  p_expires_at timestamptz,
  p_creation_idempotency_key uuid,
  p_issue_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_actor_account_id is null
    or p_auth_session_id is null
    or p_age_band is null
    or not (p_age_band = any(array['under_13', 'teen']::public.age_band[]))
    or p_consent_type is distinct from 'child_profile'::public.consent_type
    or p_verification_method is null
    or not (
      p_verification_method = any(
        array['local_test', 'verified_external']::public.consent_verification_method[]
      )
    )
    or p_display_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or p_pseudonym is null
    or pg_catalog.char_length(pg_catalog.btrim(p_pseudonym)) not between 2 and 40
    or p_avatar_seed is null
    or pg_catalog.char_length(p_avatar_seed) not between 1 and 64
    or p_avatar_seed !~ '^[A-Za-z0-9_-]+$'
    or p_policy_version is null
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 3 and 100
    or p_evidence_reference is null
    or pg_catalog.char_length(pg_catalog.btrim(p_evidence_reference)) not between 8 and 256
    or p_creation_idempotency_key is null
    or p_issue_idempotency_key is null
    or p_proof_hash is null
    or pg_catalog.octet_length(p_proof_hash) is distinct from 32
    or p_expires_at is null
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '10 minutes' then
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
  end if;

  if p_consent_scope is distinct from pg_catalog.jsonb_build_object(
    'age_band', p_age_band::text,
    'analytics', 'minimized',
    'child_profile', true,
    'public_content', false
  ) then
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
  end if;

  if p_settings is null
    or pg_catalog.jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
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
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
  end if;

  if p_settings -> 'analytics' is distinct from '"essential_only"'::jsonb
    or p_settings -> 'public_content' is distinct from 'false'::jsonb
    or p_settings -> 'social_interactions' is distinct from 'false'::jsonb
    or p_settings -> 'theme' not in ('"system"'::jsonb, '"light"'::jsonb, '"dark"'::jsonb)
    or p_settings -> 'reading_style' not in (
      '"standard"'::jsonb,
      '"increased_spacing"'::jsonb
    )
    or pg_catalog.jsonb_typeof(p_settings -> 'reduced_motion') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_settings -> 'serious_mode') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
  end if;

  return public.admin_issue_child_creation_authorization(
    p_actor_account_id,
    p_auth_session_id,
    p_display_name,
    p_pseudonym,
    p_age_band,
    p_avatar_seed,
    p_consent_type,
    p_policy_version,
    p_consent_scope,
    p_verification_method,
    p_evidence_reference,
    p_settings,
    p_proof_hash,
    p_expires_at,
    p_creation_idempotency_key,
    p_issue_idempotency_key
  );
end;
$function$;

revoke all on function public.admin_issue_verified_child_creation_authorization(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.admin_issue_verified_child_creation_authorization(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) to service_role;

comment on function public.admin_issue_verified_child_creation_authorization(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) is 'Validates a complete privacy-safe child payload before issuing one short-lived guardian-session proof.';
