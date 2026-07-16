begin;

create type public.age_band as enum ('under_13', 'teen', 'adult', 'unknown');
create type public.account_status as enum (
  'onboarding',
  'active',
  'pending_deletion',
  'suspended',
  'deleted'
);
create type public.theme_preference as enum ('system', 'light', 'dark');
create type public.account_capability as enum ('learn', 'create', 'host', 'teach');
create type public.learner_profile_kind as enum ('self', 'child', 'school_managed');
create type public.learner_profile_status as enum (
  'pending_consent',
  'active',
  'locked',
  'suspended',
  'deleted'
);
create type public.learner_access_role as enum (
  'self',
  'guardian',
  'teacher_observer',
  'school_admin'
);
create type public.learner_permission as enum (
  'view',
  'study',
  'manage',
  'manage_consent',
  'export_data',
  'request_deletion',
  'observe'
);
create type public.guardian_relationship_status as enum ('pending', 'active', 'revoked');
create type public.consent_type as enum (
  'guardian_account',
  'child_profile',
  'analytics',
  'public_content',
  'ai_processing'
);
create type public.consent_action as enum ('granted', 'revoked');
create type public.consent_verification_method as enum (
  'not_verified',
  'local_test',
  'verified_external',
  'school_authorization'
);
create type public.privacy_request_type as enum ('access', 'export', 'deletion', 'correction');
create type public.request_status as enum (
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
);
create type public.guest_session_status as enum ('issued', 'active', 'revoked', 'expired');
create type public.audit_actor_type as enum ('account', 'learner_profile', 'guest', 'system');
create type public.reauthentication_purpose as enum ('account_deletion', 'security_change');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  handle extensions.citext,
  display_name text,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  study_day_start smallint not null default 240,
  age_band public.age_band not null default 'unknown',
  account_status public.account_status not null default 'onboarding',
  learning_goals text[] not null default '{}'::text[],
  theme public.theme_preference not null default 'system',
  reduced_motion boolean not null default false,
  serious_mode boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_handle_format check (
    handle is null
    or (
      pg_catalog.char_length(handle::text) between 3 and 30
      and handle::text ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9_]*[a-zA-Z0-9])?$'
      and pg_catalog.lower(handle::text) <> all(array[
        'admin', 'api', 'app', 'auth', 'copyright', 'help', 'join',
        'moderator', 'privacy', 'root', 'safety', 'support', 'system', 'terms'
      ]::text[])
    )
  ),
  constraint profiles_display_name_length check (
    display_name is null or pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 80
  ),
  constraint profiles_locale_length check (pg_catalog.char_length(locale) between 2 and 35),
  constraint profiles_timezone_length check (pg_catalog.char_length(timezone) between 1 and 80),
  constraint profiles_study_day_start_range check (study_day_start between 0 and 1439),
  constraint profiles_no_independent_child_account check (age_band <> 'under_13'),
  constraint profiles_learning_goals_count check (pg_catalog.cardinality(learning_goals) <= 20),
  constraint profiles_completed_onboarding_fields check (
    onboarding_completed_at is null
    or (
      handle is not null
      and display_name is not null
      and age_band in ('teen', 'adult')
      and account_status in ('active', 'pending_deletion', 'suspended')
    )
  )
);

create unique index profiles_handle_unique_idx on public.profiles (handle)
where handle is not null;
create index profiles_account_status_idx on public.profiles (account_status);

create table public.privacy_preferences (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  first_party_analytics boolean not null default true,
  allow_product_updates boolean not null default false,
  allow_social_interactions boolean not null default false,
  default_content_private boolean not null default true,
  targeted_advertising boolean not null default false,
  data_sale boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint privacy_preferences_no_targeted_ads check (not targeted_advertising),
  constraint privacy_preferences_no_data_sale check (not data_sale)
);

create table public.account_capabilities (
  account_id uuid not null references public.profiles (id) on delete cascade,
  capability public.account_capability not null,
  granted_at timestamptz not null default pg_catalog.now(),
  granted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  primary key (account_id, capability),
  constraint account_capabilities_revocation_order check (
    revoked_at is null or revoked_at >= granted_at
  )
);

create index account_capabilities_active_idx
on public.account_capabilities (account_id, capability)
where revoked_at is null;

create table public.learner_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.learner_profile_kind not null,
  owner_account_id uuid not null references public.profiles (id) on delete restrict,
  display_name text,
  pseudonym text not null,
  age_band public.age_band not null default 'unknown',
  avatar_seed text not null,
  status public.learner_profile_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint learner_profiles_display_name_length check (
    display_name is null or pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 80
  ),
  constraint learner_profiles_pseudonym_length check (
    pg_catalog.char_length(pg_catalog.btrim(pseudonym)) between 2 and 40
  ),
  constraint learner_profiles_avatar_seed_length check (
    pg_catalog.char_length(avatar_seed) between 1 and 64
    and avatar_seed ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint learner_profiles_settings_object check (pg_catalog.jsonb_typeof(settings) = 'object'),
  constraint learner_profiles_self_age check (kind <> 'self' or age_band <> 'under_13'),
  constraint learner_profiles_child_age check (
    kind <> 'child' or age_band in ('under_13', 'teen')
  )
);

create unique index learner_profiles_one_self_per_account_idx
on public.learner_profiles (owner_account_id)
where kind = 'self';
create index learner_profiles_owner_status_idx
on public.learner_profiles (owner_account_id, status);
create index learner_profiles_kind_status_idx on public.learner_profiles (kind, status);

create table public.learner_profile_access (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  account_id uuid not null references public.profiles (id) on delete restrict,
  role public.learner_access_role not null,
  permissions public.learner_permission[] not null,
  granted_by uuid references public.profiles (id) on delete set null,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  constraint learner_profile_access_permissions_present check (
    pg_catalog.cardinality(permissions) between 1 and 7
  ),
  constraint learner_profile_access_revocation_order check (
    revoked_at is null or revoked_at >= created_at
  ),
  unique (account_id, idempotency_key)
);

create unique index learner_profile_access_active_role_idx
on public.learner_profile_access (learner_profile_id, account_id, role)
where revoked_at is null;
create index learner_profile_access_account_active_idx
on public.learner_profile_access (account_id, learner_profile_id)
where revoked_at is null;
create index learner_profile_access_profile_active_idx
on public.learner_profile_access (learner_profile_id, account_id)
where revoked_at is null;

create table public.guardian_relationships (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  guardian_account_id uuid not null references public.profiles (id) on delete restrict,
  status public.guardian_relationship_status not null default 'pending',
  verification_metadata jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  constraint guardian_relationships_metadata_object check (
    pg_catalog.jsonb_typeof(verification_metadata) = 'object'
  ),
  constraint guardian_relationships_active_timestamp check (
    status <> 'active' or activated_at is not null
  ),
  constraint guardian_relationships_revoked_timestamp check (
    status <> 'revoked' or revoked_at is not null
  ),
  unique (guardian_account_id, idempotency_key)
);

create unique index guardian_relationships_active_pair_idx
on public.guardian_relationships (learner_profile_id, guardian_account_id)
where status = 'active';
create index guardian_relationships_guardian_status_idx
on public.guardian_relationships (guardian_account_id, status, learner_profile_id);
create index guardian_relationships_profile_status_idx
on public.guardian_relationships (learner_profile_id, status, guardian_account_id);

create table public.consent_records (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  guardian_account_id uuid not null references public.profiles (id) on delete restrict,
  consent_type public.consent_type not null,
  action public.consent_action not null,
  policy_version text not null,
  scope jsonb not null default '{}'::jsonb,
  verification_method public.consent_verification_method not null,
  prior_consent_record_id uuid references public.consent_records (id) on delete restrict,
  evidence_reference text,
  reason text,
  idempotency_key uuid not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  constraint consent_records_policy_version_length check (
    pg_catalog.char_length(pg_catalog.btrim(policy_version)) between 1 and 80
  ),
  constraint consent_records_scope_object check (pg_catalog.jsonb_typeof(scope) = 'object'),
  constraint consent_records_evidence_reference_length check (
    evidence_reference is null or pg_catalog.char_length(evidence_reference) <= 256
  ),
  constraint consent_records_reason_length check (
    reason is null or pg_catalog.char_length(reason) <= 500
  ),
  constraint consent_records_action_reference check (
    (action = 'granted' and prior_consent_record_id is null)
    or (action = 'revoked' and prior_consent_record_id is not null)
  ),
  unique (guardian_account_id, idempotency_key)
);

create unique index consent_records_single_revocation_idx
on public.consent_records (prior_consent_record_id)
where action = 'revoked';
create index consent_records_profile_type_time_idx
on public.consent_records (learner_profile_id, consent_type, recorded_at desc);
create index consent_records_guardian_time_idx
on public.consent_records (guardian_account_id, recorded_at desc);

create table public.devices (
  id uuid primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  platform text not null,
  first_seen_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  last_reauthenticated_at timestamptz,
  revoked_at timestamptz,
  idempotency_key uuid not null,
  constraint devices_display_name_length check (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 80
  ),
  constraint devices_platform_length check (pg_catalog.char_length(platform) between 1 and 40),
  constraint devices_seen_order check (last_seen_at >= first_seen_at),
  unique (account_id, idempotency_key)
);

create index devices_account_active_idx on public.devices (account_id, last_seen_at desc)
where revoked_at is null;

create table public.profile_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  token_hash bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  idempotency_key uuid not null,
  constraint profile_sessions_token_hash_length check (pg_catalog.octet_length(token_hash) = 32),
  constraint profile_sessions_expiration_order check (expires_at > created_at),
  constraint profile_sessions_revoke_reason_length check (
    revoke_reason is null or pg_catalog.char_length(revoke_reason) <= 200
  ),
  unique (token_hash),
  unique (account_id, idempotency_key)
);

create index profile_sessions_account_active_idx
on public.profile_sessions (account_id, expires_at)
where revoked_at is null;
create index profile_sessions_profile_active_idx
on public.profile_sessions (learner_profile_id, expires_at)
where revoked_at is null;
create index profile_sessions_device_active_idx
on public.profile_sessions (device_id, expires_at)
where revoked_at is null and device_id is not null;

create table public.privacy_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete restrict,
  request_type public.privacy_request_type not null,
  status public.request_status not null default 'queued',
  details jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null,
  requested_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint privacy_requests_details_object check (pg_catalog.jsonb_typeof(details) = 'object'),
  unique (account_id, idempotency_key)
);

create index privacy_requests_account_status_idx
on public.privacy_requests (account_id, status, requested_at desc);

create table public.data_export_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  privacy_request_id uuid not null unique references public.privacy_requests (id) on delete restrict,
  account_id uuid not null references public.profiles (id) on delete restrict,
  status public.request_status not null default 'queued',
  result_available boolean not null default false,
  error_code text,
  requested_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  constraint data_export_jobs_error_code_length check (
    error_code is null or pg_catalog.char_length(error_code) <= 80
  )
);

create index data_export_jobs_account_status_idx
on public.data_export_jobs (account_id, status, requested_at desc);

create table public.deletion_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  privacy_request_id uuid not null unique references public.privacy_requests (id) on delete restrict,
  account_id uuid not null references public.profiles (id) on delete restrict,
  status public.request_status not null default 'queued',
  requested_at timestamptz not null default pg_catalog.now(),
  execute_after timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint deletion_jobs_execution_order check (execute_after > requested_at),
  constraint deletion_jobs_cancelled_timestamp check (
    status <> 'cancelled' or cancelled_at is not null
  )
);

create unique index deletion_jobs_one_active_per_account_idx
on public.deletion_jobs (account_id)
where status in ('queued', 'processing');
create index deletion_jobs_due_idx on public.deletion_jobs (status, execute_after);

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_type public.audit_actor_type not null,
  actor_account_id uuid references public.profiles (id) on delete set null,
  actor_learner_profile_id uuid references public.learner_profiles (id) on delete set null,
  actor_guest_session_id uuid,
  event_type text not null,
  target_type text not null,
  target_id uuid,
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default pg_catalog.now(),
  constraint audit_events_event_type_length check (
    pg_catalog.char_length(event_type) between 3 and 100
  ),
  constraint audit_events_target_type_length check (
    pg_catalog.char_length(target_type) between 2 and 80
  ),
  constraint audit_events_metadata_object check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  constraint audit_events_metadata_size check (pg_catalog.pg_column_size(metadata) <= 16384)
);

create index audit_events_actor_account_time_idx
on public.audit_events (actor_account_id, received_at desc)
where actor_account_id is not null;
create index audit_events_target_time_idx
on public.audit_events (target_type, target_id, received_at desc);
create index audit_events_correlation_idx on public.audit_events (correlation_id);
create unique index audit_events_idempotency_idx
on public.audit_events (event_type, correlation_id);

create table public.guest_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  game_reference text not null,
  nickname text not null,
  reconnect_token_hash bytea not null,
  status public.guest_session_status not null default 'issued',
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  redeemed_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  idempotency_key uuid not null,
  constraint guest_sessions_game_reference_length check (
    pg_catalog.char_length(game_reference) between 3 and 128
  ),
  constraint guest_sessions_nickname_length check (
    pg_catalog.char_length(pg_catalog.btrim(nickname)) between 2 and 32
  ),
  constraint guest_sessions_token_hash_length check (
    pg_catalog.octet_length(reconnect_token_hash) = 32
  ),
  constraint guest_sessions_expiration_order check (expires_at > created_at),
  unique (reconnect_token_hash),
  unique (idempotency_key)
);

comment on column public.audit_events.actor_guest_session_id is
  'Historical opaque actor identifier; intentionally not a foreign key so guest identity rows can be purged without rewriting append-only audit history.';

create index guest_sessions_expiry_idx on public.guest_sessions (expires_at)
where revoked_at is null;
create index guest_sessions_game_active_idx
on public.guest_sessions (game_reference, expires_at)
where revoked_at is null;

create table private.rate_limit_buckets (
  scope text not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  window_seconds integer not null,
  request_count integer not null,
  expires_at timestamptz not null,
  primary key (scope, subject_hash, window_started_at),
  constraint rate_limit_buckets_scope_length check (
    pg_catalog.char_length(scope) between 2 and 100
  ),
  constraint rate_limit_buckets_subject_hash_length check (
    pg_catalog.octet_length(subject_hash) between 16 and 64
  ),
  constraint rate_limit_buckets_window_range check (window_seconds between 1 and 86400),
  constraint rate_limit_buckets_request_count_positive check (request_count > 0),
  constraint rate_limit_buckets_expiration_order check (expires_at > window_started_at)
);

create index rate_limit_buckets_expiry_idx on private.rate_limit_buckets (expires_at);

create table private.reauthentication_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  purpose public.reauthentication_purpose not null,
  proof_hash bytea not null unique,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint reauthentication_grants_proof_hash_length check (
    pg_catalog.octet_length(proof_hash) = 32
  ),
  constraint reauthentication_grants_expiration_order check (expires_at > created_at),
  unique (account_id, idempotency_key)
);

create index reauthentication_grants_account_active_idx
on private.reauthentication_grants (account_id, purpose, expires_at)
where consumed_at is null;

create table private.learner_profile_credentials (
  learner_profile_id uuid primary key references public.learner_profiles (id) on delete cascade,
  pin_hash text not null,
  family_code_hash bytea not null unique,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_credentials_pin_hash_format check (
    pin_hash like '$2a$%' or pin_hash like '$2b$%'
  ),
  constraint learner_profile_credentials_family_hash_length check (
    pg_catalog.octet_length(family_code_hash) = 32
  )
);

alter table public.profiles enable row level security;
alter table public.privacy_preferences enable row level security;
alter table public.account_capabilities enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.learner_profile_access enable row level security;
alter table public.guardian_relationships enable row level security;
alter table public.consent_records enable row level security;
alter table public.devices enable row level security;
alter table public.profile_sessions enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.data_export_jobs enable row level security;
alter table public.deletion_jobs enable row level security;
alter table public.audit_events enable row level security;
alter table public.guest_sessions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

comment on table public.consent_records is
  'Append-only consent grant/revocation events. Revocation is a new row referencing the grant.';
comment on column public.profile_sessions.token_hash is
  'SHA-256 digest of a high-entropy opaque session token; the raw token is never stored.';
comment on column public.guest_sessions.reconnect_token_hash is
  'SHA-256 digest of a high-entropy reconnect token; guest records contain no email.';
comment on table private.learner_profile_credentials is
  'Non-exposed bcrypt PIN and high-entropy family-code digests for child profile unlock.';
comment on table private.rate_limit_buckets is
  'Non-exposed fixed-window counters keyed by a server-HMACed subject; never stores raw IPs.';

commit;
