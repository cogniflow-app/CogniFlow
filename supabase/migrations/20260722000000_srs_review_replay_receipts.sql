begin;

-- The canonical HTTP route must be able to return the first response after the
-- session item and schedule have advanced. Keep that response in a private,
-- append-only receipt keyed by both client identities.
create table private.srs_review_receipts (
  review_log_id uuid primary key references public.review_logs (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  idempotency_key uuid not null,
  request_hash text not null,
  canonical_result jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint srs_review_receipts_request_hash_format
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint srs_review_receipts_result_object
    check (pg_catalog.jsonb_typeof(canonical_result) = 'object'),
  unique (learner_profile_id, idempotency_key)
);

create trigger srs_review_receipts_append_only
before update or delete on private.srs_review_receipts
for each row execute function private.reject_append_only_srs_mutation();

revoke all on table private.srs_review_receipts from public, anon, authenticated, service_role;

create or replace function public.admin_get_srs_review_replay(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_review_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_receipt private.srs_review_receipts;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_review_id is null or p_idempotency_key is null
    or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid review replay command';
  end if;

  select * into v_receipt
  from private.srs_review_receipts as receipt
  where receipt.review_log_id = p_review_id
     or (
       receipt.learner_profile_id = p_learner_profile_id
       and receipt.idempotency_key = p_idempotency_key
     )
  order by case when receipt.review_log_id = p_review_id then 0 else 1 end
  limit 1;

  if not found then
    return null;
  end if;
  if v_receipt.learner_profile_id <> p_learner_profile_id
    or v_receipt.request_hash <> p_request_hash then
    raise exception using errcode = '22023',
      message = 'review idempotency key was reused with different input';
  end if;
  return v_receipt.canonical_result;
end;
$function$;

create or replace function public.admin_commit_srs_review_v2(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_study_session_id uuid,
  p_rating public.review_rating,
  p_reviewed_at timestamptz,
  p_duration_ms integer,
  p_timezone text,
  p_study_day_start smallint,
  p_current_schedule_version bigint,
  p_review_id uuid,
  p_idempotency_key uuid,
  p_command_hash text,
  p_request_hash text,
  p_source public.review_source,
  p_preset_id uuid,
  p_preset_version bigint,
  p_schedule_before jsonb,
  p_schedule_after jsonb,
  p_scheduler_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receipt private.srs_review_receipts;
  v_result jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_review_id is null or p_idempotency_key is null
    or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid review receipt command';
  end if;

  select * into v_receipt
  from private.srs_review_receipts as receipt
  where receipt.review_log_id = p_review_id
     or (
       receipt.learner_profile_id = p_learner_profile_id
       and receipt.idempotency_key = p_idempotency_key
     )
  order by case when receipt.review_log_id = p_review_id then 0 else 1 end
  limit 1;
  if found then
    if v_receipt.learner_profile_id <> p_learner_profile_id
      or v_receipt.request_hash <> p_request_hash then
      raise exception using errcode = '22023',
        message = 'review idempotency key was reused with different input';
    end if;
    return v_receipt.canonical_result;
  end if;

  v_result := public.admin_commit_srs_review(
    p_actor_account_id => p_actor_account_id,
    p_auth_session_id => p_auth_session_id,
    p_device_id => p_device_id,
    p_learner_profile_id => p_learner_profile_id,
    p_profile_session_id => p_profile_session_id,
    p_card_id => p_card_id,
    p_study_session_id => p_study_session_id,
    p_rating => p_rating,
    p_reviewed_at => p_reviewed_at,
    p_duration_ms => p_duration_ms,
    p_timezone => p_timezone,
    p_study_day_start => p_study_day_start,
    p_current_schedule_version => p_current_schedule_version,
    p_review_id => p_review_id,
    p_idempotency_key => p_idempotency_key,
    p_command_hash => p_command_hash,
    p_source => p_source,
    p_preset_id => p_preset_id,
    p_preset_version => p_preset_version,
    p_schedule_before => p_schedule_before,
    p_schedule_after => p_schedule_after,
    p_scheduler_version => p_scheduler_version
  );

  insert into private.srs_review_receipts (
    review_log_id, learner_profile_id, idempotency_key, request_hash, canonical_result
  ) values (
    p_review_id, p_learner_profile_id, p_idempotency_key, p_request_hash, v_result
  ) on conflict do nothing;

  select * into v_receipt
  from private.srs_review_receipts as receipt
  where receipt.review_log_id = p_review_id
     or (
       receipt.learner_profile_id = p_learner_profile_id
       and receipt.idempotency_key = p_idempotency_key
     )
  order by case when receipt.review_log_id = p_review_id then 0 else 1 end
  limit 1;
  if not found or v_receipt.learner_profile_id <> p_learner_profile_id
    or v_receipt.request_hash <> p_request_hash then
    raise exception using errcode = '22023', message = 'review receipt conflict';
  end if;
  return v_receipt.canonical_result;
end;
$function$;

revoke all on function public.admin_get_srs_review_replay(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function public.admin_commit_srs_review_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,
  bigint,uuid,uuid,text,text,public.review_source,uuid,bigint,jsonb,jsonb,text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_get_srs_review_replay(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text
) to service_role;
grant execute on function public.admin_commit_srs_review_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,
  bigint,uuid,uuid,text,text,public.review_source,uuid,bigint,jsonb,jsonb,text
) to service_role;

comment on table private.srs_review_receipts
is 'Append-only exact canonical HTTP responses for offline-ready review retries; never exposed through PostgREST.';
comment on function public.admin_get_srs_review_replay(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)
is 'Returns an exact prior canonical review response only after runtime authorization and complete request-hash matching.';
comment on function public.admin_commit_srs_review_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,
  bigint,uuid,uuid,text,text,public.review_source,uuid,bigint,jsonb,jsonb,text
)
is 'Commits through the canonical review RPC and atomically stores the exact response for authorized retries.';

commit;
