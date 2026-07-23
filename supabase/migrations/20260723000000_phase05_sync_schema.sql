-- Phase 05: minimal authoritative synchronization state. Browser outboxes remain
-- local; the server stores only device/profile checkpoints, payload-bound receipts,
-- and privacy-minimized change references.

create table public.sync_device_state (
  account_id uuid not null references public.profiles (id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  protocol_version smallint not null default 1,
  last_cursor bigint not null default 0,
  last_seen_at timestamptz not null default pg_catalog.now(),
  last_successful_sync_at timestamptz,
  synchronization_paused boolean not null default false,
  metered_connection_preference text not null default 'avoid_media',
  media_download_preference text not null default 'images_only',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, learner_profile_id, device_id),
  constraint sync_device_protocol check (protocol_version = 1),
  constraint sync_device_cursor check (last_cursor >= 0),
  constraint sync_device_metered check (
    metered_connection_preference in ('allow', 'avoid_media', 'pause')
  ),
  constraint sync_device_media check (
    media_download_preference in ('all', 'images_only', 'none')
  )
);

create index sync_device_state_device_idx
  on public.sync_device_state (device_id, account_id, learner_profile_id);
create index sync_device_state_learner_seen_idx
  on public.sync_device_state (learner_profile_id, last_seen_at desc);

alter table public.sync_device_state enable row level security;
create policy sync_device_state_select_authorized
on public.sync_device_state
for select
to authenticated
using (
  account_id = (select auth.uid())
  and private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);

revoke all on table public.sync_device_state from public, anon, authenticated;
grant select on table public.sync_device_state to authenticated;

create table private.sync_operation_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  operation_id uuid not null,
  idempotency_key uuid not null,
  operation_kind text not null,
  payload_fingerprint text not null,
  result_status text not null default 'pending',
  result jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (account_id, operation_id),
  unique (account_id, idempotency_key),
  constraint sync_receipt_kind_length check (
    pg_catalog.char_length(operation_kind) between 1 and 80
  ),
  constraint sync_receipt_fingerprint check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint sync_receipt_status check (
    result_status in (
      'pending', 'acknowledged', 'duplicate', 'applied_after_replay', 'conflict',
      'retryable', 'rejected', 'unauthorized', 'unsupported_protocol', 'dead_letter'
    )
  ),
  constraint sync_receipt_result_shape check (
    (result_status = 'pending' and result is null and completed_at is null)
    or
    (result_status <> 'pending' and pg_catalog.jsonb_typeof(result) = 'object' and completed_at is not null)
  )
);

create index sync_operation_receipts_device_time_idx
  on private.sync_operation_receipts (device_id, learner_profile_id, created_at desc);
create index sync_operation_receipts_profile_status_idx
  on private.sync_operation_receipts (account_id, learner_profile_id, result_status, created_at);

create table private.sync_change_feed (
  sequence bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete cascade,
  device_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  entity_version bigint,
  tombstone boolean not null default false,
  changed_at timestamptz not null default pg_catalog.now(),
  constraint sync_change_entity_type_length check (
    pg_catalog.char_length(entity_type) between 1 and 80
  ),
  constraint sync_change_entity_id_length check (
    pg_catalog.char_length(entity_id) between 1 and 180
  ),
  constraint sync_change_version check (entity_version is null or entity_version >= 0)
);

create index sync_change_feed_profile_sequence_idx
  on private.sync_change_feed (account_id, learner_profile_id, sequence);

revoke all on table private.sync_operation_receipts, private.sync_change_feed
  from public, anon, authenticated, service_role;
revoke all on sequence private.sync_change_feed_sequence_seq
  from public, anon, authenticated, service_role;

create or replace function private.sync_result_valid(p_result jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_typeof(p_result) = 'object'
    and p_result ? 'operationId'
    and p_result ? 'status'
    and p_result->>'status' in (
      'acknowledged', 'duplicate', 'applied_after_replay', 'conflict',
      'retryable', 'rejected', 'unauthorized', 'unsupported_protocol', 'dead_letter'
    )
    and pg_catalog.char_length(p_result::text) <= 65536;
$function$;

create or replace function public.admin_begin_sync_operation(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_operation_id uuid,
  p_idempotency_key uuid,
  p_operation_kind text,
  p_payload_fingerprint text,
  p_protocol_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.sync_operation_receipts;
begin
  if p_protocol_version <> 1
    or p_operation_id is null
    or p_idempotency_key is null
    or p_operation_kind is null
    or pg_catalog.char_length(p_operation_kind) not between 1 and 80
    or p_payload_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid synchronization command';
  end if;

  perform private.assert_srs_runtime_context(
    p_actor_account_id,
    p_auth_session_id,
    p_device_id,
    p_learner_profile_id,
    p_profile_session_id
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sync-operation:' || p_actor_account_id::text || ':' || p_operation_id::text,
      0
    )
  );

  select *
  into v_existing
  from private.sync_operation_receipts as receipt
  where receipt.account_id = p_actor_account_id
    and (receipt.operation_id = p_operation_id or receipt.idempotency_key = p_idempotency_key)
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1;

  if found then
    if v_existing.operation_id <> p_operation_id
      or v_existing.idempotency_key <> p_idempotency_key
      or v_existing.learner_profile_id <> p_learner_profile_id
      or v_existing.device_id <> p_device_id
      or v_existing.operation_kind <> p_operation_kind
      or v_existing.payload_fingerprint <> p_payload_fingerprint then
      raise exception using errcode = '22023', message = 'synchronization id was reused with different input';
    end if;
    if v_existing.result_status = 'retryable' then
      update private.sync_operation_receipts
      set result_status = 'pending', result = null, completed_at = null
      where receipt_id = v_existing.receipt_id;
      return pg_catalog.jsonb_build_object(
        'receiptId', v_existing.receipt_id,
        'state', 'new',
        'result', null
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'receiptId', v_existing.receipt_id,
      'state', case when v_existing.result_status = 'pending' then 'pending' else 'complete' end,
      'result', v_existing.result
    );
  end if;

  insert into private.sync_operation_receipts (
    account_id, learner_profile_id, device_id, operation_id, idempotency_key,
    operation_kind, payload_fingerprint
  )
  values (
    p_actor_account_id, p_learner_profile_id, p_device_id, p_operation_id,
    p_idempotency_key, p_operation_kind, p_payload_fingerprint
  )
  returning * into v_existing;

  return pg_catalog.jsonb_build_object(
    'receiptId', v_existing.receipt_id,
    'state', 'new',
    'result', null
  );
end;
$function$;

create or replace function public.admin_complete_sync_operation(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_operation_id uuid,
  p_payload_fingerprint text,
  p_result jsonb,
  p_entity_type text,
  p_entity_id text,
  p_entity_version bigint,
  p_tombstone boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receipt private.sync_operation_receipts;
  v_sequence bigint;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id,
    p_auth_session_id,
    p_device_id,
    p_learner_profile_id,
    p_profile_session_id
  );
  if p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    or not private.sync_result_valid(p_result)
    or p_entity_type is null
    or pg_catalog.char_length(p_entity_type) not between 1 and 80
    or p_entity_id is null
    or pg_catalog.char_length(p_entity_id) not between 1 and 180
    or p_entity_version is not null and p_entity_version < 0 then
    raise exception using errcode = '22023', message = 'invalid synchronization result';
  end if;

  select *
  into v_receipt
  from private.sync_operation_receipts as receipt
  where receipt.account_id = p_actor_account_id
    and receipt.operation_id = p_operation_id
  for update;

  if not found
    or v_receipt.learner_profile_id <> p_learner_profile_id
    or v_receipt.device_id <> p_device_id
    or v_receipt.payload_fingerprint <> p_payload_fingerprint then
    raise exception using errcode = '22023', message = 'synchronization receipt does not match';
  end if;
  if v_receipt.result_status <> 'pending' then
    return v_receipt.result;
  end if;

  update private.sync_operation_receipts
  set result_status = p_result->>'status',
      result = p_result,
      completed_at = pg_catalog.now()
  where receipt_id = v_receipt.receipt_id;

  if p_result->>'status' in ('acknowledged', 'applied_after_replay') then
    insert into private.sync_change_feed (
      account_id, learner_profile_id, device_id, entity_type, entity_id, entity_version, tombstone
    )
    values (
      p_actor_account_id, p_learner_profile_id, p_device_id, p_entity_type, p_entity_id,
      p_entity_version, p_tombstone
    )
    returning sequence into v_sequence;
  end if;

  insert into public.sync_device_state (
    account_id, learner_profile_id, device_id, protocol_version, last_cursor,
    last_seen_at, last_successful_sync_at
  )
  values (
    p_actor_account_id, p_learner_profile_id, p_device_id, 1,
    coalesce(v_sequence, 0::bigint), pg_catalog.now(), pg_catalog.now()
  )
  on conflict (account_id, learner_profile_id, device_id)
  do update set
    last_cursor = greatest(public.sync_device_state.last_cursor, excluded.last_cursor),
    last_seen_at = excluded.last_seen_at,
    last_successful_sync_at = excluded.last_successful_sync_at,
    updated_at = pg_catalog.now();

  return p_result;
end;
$function$;

create or replace function public.admin_pull_sync_changes(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_after_sequence bigint,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_changes jsonb;
  v_next bigint;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id,
    p_auth_session_id,
    p_device_id,
    p_learner_profile_id,
    p_profile_session_id
  );
  if p_after_sequence < 0 or p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid synchronization cursor';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sequence', change.sequence::text,
        'deviceId', change.device_id,
        'entityType', change.entity_type,
        'entityId', change.entity_id,
        'entityVersion', change.entity_version,
        'tombstone', change.tombstone,
        'changedAt', change.changed_at
      )
      order by change.sequence
    ),
    '[]'::jsonb
  ),
  coalesce(pg_catalog.max(change.sequence), p_after_sequence)
  into v_changes, v_next
  from (
    select feed.*
    from private.sync_change_feed as feed
    where feed.account_id = p_actor_account_id
      and feed.learner_profile_id = p_learner_profile_id
      and feed.sequence > p_after_sequence
    order by feed.sequence
    limit p_limit
  ) as change;

  return pg_catalog.jsonb_build_object('changes', v_changes, 'nextSequence', v_next::text);
end;
$function$;

create or replace function public.admin_update_sync_device_preferences(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_synchronization_paused boolean,
  p_metered_connection_preference text,
  p_media_download_preference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id,
    p_auth_session_id,
    p_device_id,
    p_learner_profile_id,
    p_profile_session_id
  );
  if p_synchronization_paused is null
    or p_metered_connection_preference not in ('allow', 'avoid_media', 'pause')
    or p_media_download_preference not in ('all', 'images_only', 'none') then
    raise exception using errcode = '22023', message = 'invalid synchronization preferences';
  end if;

  insert into public.sync_device_state (
    account_id, learner_profile_id, device_id, protocol_version,
    synchronization_paused, metered_connection_preference,
    media_download_preference, last_seen_at
  )
  values (
    p_actor_account_id, p_learner_profile_id, p_device_id, 1,
    p_synchronization_paused, p_metered_connection_preference,
    p_media_download_preference, pg_catalog.now()
  )
  on conflict (account_id, learner_profile_id, device_id)
  do update set
    synchronization_paused = excluded.synchronization_paused,
    metered_connection_preference = excluded.metered_connection_preference,
    media_download_preference = excluded.media_download_preference,
    last_seen_at = excluded.last_seen_at,
    updated_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object(
    'paused', p_synchronization_paused,
    'meteredConnectionPreference', p_metered_connection_preference,
    'mediaDownloadPreference', p_media_download_preference
  );
end;
$function$;

revoke all on function public.admin_begin_sync_operation(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer
) from public, anon, authenticated;
revoke all on function private.sync_result_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_sync_operation(
  uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, bigint, boolean
) from public, anon, authenticated;
revoke all on function public.admin_pull_sync_changes(
  uuid, uuid, uuid, uuid, uuid, bigint, integer
) from public, anon, authenticated;
revoke all on function public.admin_update_sync_device_preferences(
  uuid, uuid, uuid, uuid, uuid, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.admin_begin_sync_operation(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer
) to service_role;
grant execute on function public.admin_complete_sync_operation(
  uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, bigint, boolean
) to service_role;
grant execute on function public.admin_pull_sync_changes(
  uuid, uuid, uuid, uuid, uuid, bigint, integer
) to service_role;
grant execute on function public.admin_update_sync_device_preferences(
  uuid, uuid, uuid, uuid, uuid, boolean, text, text
) to service_role;

comment on table public.sync_device_state is
  'Phase 05 per-device/profile synchronization checkpoints and preferences; no browser outbox payloads.';
comment on table private.sync_operation_receipts is
  'Payload-bound idempotency receipts for the versioned synchronization boundary.';
comment on table private.sync_change_feed is
  'Privacy-minimized entity references for cursor pull; canonical data remains in its owning tables.';
