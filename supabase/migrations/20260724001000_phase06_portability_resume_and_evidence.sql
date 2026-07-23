-- Phase 06 follow-up: resumable source lookup and learner-evidence restoration.
-- All entry points remain service-only and are called only after an owner-authenticated
-- route has established the target account and active job lease.

create or replace function public.admin_get_portability_upload_object(
  p_import_job_id uuid,
  p_account_id uuid
)
returns table (
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  detected_mime_type text,
  byte_size bigint,
  sha256 text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select object_record.storage_bucket, object_record.storage_path,
    object_record.declared_mime_type, object_record.detected_mime_type,
    object_record.byte_size, object_record.sha256
  from private.portability_upload_objects as object_record
  join public.import_jobs as job on job.id = object_record.import_job_id
  where job.id = p_import_job_id
    and job.account_id = p_account_id
    and object_record.account_id = p_account_id
    and object_record.deleted_at is null
    and object_record.expires_at > pg_catalog.now()
    and job.status not in ('cancelled', 'completed', 'completed_with_warnings', 'expired')
  limit 1;
$function$;

create or replace function public.admin_get_portability_card_id_map(
  p_import_job_id uuid,
  p_account_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.jsonb_object_agg(
      pg_catalog.substr(item.item_key, 6),
      item.canonical_id::text
    ) filter (where item.canonical_id is not null),
    '{}'::jsonb
  )
  from private.portability_job_items as item
  join public.import_jobs as job
    on job.id = item.job_id and job.kind = item.job_kind
  where job.id = p_import_job_id
    and job.account_id = p_account_id
    and item.item_key like 'card:%';
$function$;

create or replace function public.admin_restore_portability_evidence_chunk(
  p_import_job_id uuid,
  p_account_id uuid,
  p_learner_profile_id uuid,
  p_lease_token uuid,
  p_card_id_map jsonb,
  p_practice jsonb,
  p_mastery jsonb,
  p_chunk_ordinal integer,
  p_progress_policy text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.import_jobs;
  v_practice jsonb;
  v_mastery jsonb;
  v_values jsonb;
  v_external_id text;
  v_card_id uuid;
  v_content_version bigint;
  v_session_id uuid;
  v_attempt_id uuid;
  v_item_key text;
  v_position integer := 0;
  v_practice_restored integer := 0;
  v_mastery_restored integer := 0;
  v_skipped integer := 0;
  v_attempt_count integer := 0;
  v_mastery_empty boolean;
  v_occurred_at timestamptz;
  v_correctness double precision;
  v_confidence double precision;
  v_mode public.practice_mode;
  v_verdict public.practice_verdict;
  v_stage public.mastery_stage;
begin
  if p_progress_policy not in ('omit', 'import_if_empty', 'merge_explicit')
    or p_chunk_ordinal not between 0 and 1000000
    or pg_catalog.jsonb_typeof(p_card_id_map) <> 'object'
    or pg_catalog.jsonb_typeof(p_practice) <> 'array'
    or pg_catalog.jsonb_array_length(p_practice) > 500
    or pg_catalog.jsonb_typeof(p_mastery) <> 'array'
    or pg_catalog.jsonb_array_length(p_mastery) > 500
  then
    raise exception using errcode = '22023', message = 'invalid portability evidence chunk';
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
    select 1
    from public.learner_profiles as learner
    where learner.id = p_learner_profile_id
      and learner.owner_account_id = p_account_id
      and learner.status <> 'deleted'
  ) then
    raise exception using errcode = '42501', message = 'portability evidence target is unavailable';
  end if;
  if p_progress_policy = 'omit' then
    return pg_catalog.jsonb_build_object(
      'masteryRestored', 0,
      'practiceRestored', 0,
      'skipped',
        pg_catalog.jsonb_array_length(p_practice) +
        pg_catalog.jsonb_array_length(p_mastery)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portability-evidence:' || p_import_job_id::text || ':' || p_chunk_ordinal::text,
      0
    )
  );
  select not exists(
    select 1 from public.concept_mastery as mastery
    where mastery.learner_profile_id = p_learner_profile_id
  ) into v_mastery_empty;

  if pg_catalog.jsonb_array_length(p_practice) > 0 then
    v_item_key := 'practice-session:' || p_chunk_ordinal::text;
    select item.canonical_id into v_session_id
    from private.portability_job_items as item
    where item.job_kind = v_job.kind
      and item.job_id = p_import_job_id
      and item.item_key = v_item_key;
    if v_session_id is null then
      v_session_id := extensions.gen_random_uuid();
      insert into public.practice_sessions (
        id, learner_profile_id, actor_account_id, mode, status,
        config, scope, queue_seed, command_hash, total_items,
        completed_items, started_at, last_activity_at, completed_at
      ) values (
        v_session_id, p_learner_profile_id, p_account_id, 'flashcards', 'completed',
        '{"imported":true,"schemaVersion":1}'::jsonb,
        pg_catalog.jsonb_build_object(
          'importJobId', p_import_job_id,
          'chunkOrdinal', p_chunk_ordinal
        ),
        'imported-' || p_import_job_id::text || '-' || p_chunk_ordinal::text,
        private.content_hash(
          pg_catalog.jsonb_build_object(
            'jobId', p_import_job_id,
            'chunkOrdinal', p_chunk_ordinal,
            'kind', 'practice'
          )
        ),
        0, 0, pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
      );
      insert into private.portability_job_items (
        job_kind, job_id, item_key, source_fingerprint, canonical_id, result
      ) values (
        v_job.kind, p_import_job_id, v_item_key,
        private.content_hash(
          pg_catalog.jsonb_build_object('chunkOrdinal', p_chunk_ordinal, 'kind', 'practice')
        ),
        v_session_id, 'created'
      );
    end if;
  end if;

  for v_practice in
    select value from pg_catalog.jsonb_array_elements(p_practice)
  loop
    begin
      if pg_catalog.jsonb_typeof(v_practice) <> 'object'
        or pg_catalog.jsonb_typeof(v_practice -> 'values') <> 'object'
      then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_external_id := v_practice ->> 'externalId';
      v_item_key := pg_catalog.left('practice:' || v_external_id, 200);
      if v_external_id is null or exists(
        select 1 from private.portability_job_items as item
        where item.job_kind = v_job.kind
          and item.job_id = p_import_job_id
          and item.item_key = v_item_key
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_card_id := (p_card_id_map ->> (v_practice ->> 'cardExternalId'))::uuid;
      select card.content_version into v_content_version
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
      v_values := v_practice -> 'values';
      v_occurred_at := (v_practice ->> 'occurredAt')::timestamptz;
      v_correctness := pg_catalog.greatest(
        0,
        pg_catalog.least(1, coalesce((v_values ->> 'correctness')::double precision, 0))
      );
      v_confidence := pg_catalog.greatest(
        0,
        pg_catalog.least(1, coalesce((v_values ->> 'confidence')::double precision, 0))
      );
      v_mode := case
        when v_values ->> 'mode' in (
          'flashcards','learn','write','test','match','spell',
          'pronunciation','diagram'
        ) then (v_values ->> 'mode')::public.practice_mode
        else 'flashcards'::public.practice_mode
      end;
      v_verdict := case
        when v_values ->> 'verdict' in ('correct','partial','incorrect','needs_review')
          then (v_values ->> 'verdict')::public.practice_verdict
        when v_correctness >= 0.999 then 'correct'::public.practice_verdict
        when v_correctness > 0 then 'partial'::public.practice_verdict
        else 'incorrect'::public.practice_verdict
      end;
      v_attempt_id := extensions.gen_random_uuid();
      insert into public.practice_session_items (
        practice_session_id, position, card_id, question_level,
        question_kind, seed_fragment, status, attempt_count, shown_at, completed_at
      ) values (
        v_session_id, v_position, v_card_id, 'free_recall',
        'imported_evidence', 'imported-' || v_position::text,
        'answered', 1, v_occurred_at, v_occurred_at
      );
      insert into public.practice_attempts (
        id, practice_session_id, item_position, learner_profile_id,
        actor_account_id, device_id, card_id, mode, response_kind,
        correctness, verdict, confidence, matched_rule, explanation,
        retention, response_text, response_hash, hints_used, answer_revealed,
        retry_count, duration_ms, self_confidence, content_version,
        qualification_status, suggested_rating, idempotency_key,
        command_hash, occurred_at
      ) values (
        v_attempt_id, v_session_id, v_position, p_learner_profile_id,
        p_account_id, null, v_card_id, v_mode, 'imported_evidence',
        v_correctness, v_verdict, v_confidence, 'imported_archive',
        'Imported practice evidence; no learner response text was restored.',
        'discarded', null, null,
        pg_catalog.greatest(
          0,
          pg_catalog.least(100, coalesce((v_values ->> 'hintsUsed')::integer, 0))
        ),
        false, 0,
        pg_catalog.greatest(
          0,
          pg_catalog.least(86400000, coalesce((v_values ->> 'durationMs')::integer, 0))
        ),
        null, v_content_version, 'not_eligible', null,
        extensions.gen_random_uuid(), private.content_hash(v_practice), v_occurred_at
      );
      insert into private.portability_job_items (
        job_kind, job_id, item_key, source_fingerprint, canonical_id, result
      ) values (
        v_job.kind, p_import_job_id, v_item_key,
        private.content_hash(v_practice), v_attempt_id, 'created'
      );
      v_position := v_position + 1;
      v_practice_restored := v_practice_restored + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range
        or not_null_violation or unique_violation or check_violation then
        v_skipped := v_skipped + 1;
    end;
  end loop;

  if v_session_id is not null then
    select pg_catalog.count(*)::integer into v_attempt_count
    from public.practice_attempts as attempt
    where attempt.practice_session_id = v_session_id;
    update public.practice_sessions
    set total_items = v_attempt_count,
        completed_items = v_attempt_count,
        last_activity_at = pg_catalog.now(),
        completed_at = coalesce(completed_at, pg_catalog.now())
    where id = v_session_id;
  end if;

  for v_mastery in
    select value from pg_catalog.jsonb_array_elements(p_mastery)
  loop
    begin
      if pg_catalog.jsonb_typeof(v_mastery) <> 'object'
        or pg_catalog.jsonb_typeof(v_mastery -> 'values') <> 'object'
      then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_external_id := v_mastery ->> 'externalId';
      v_item_key := pg_catalog.left('mastery:' || v_external_id, 200);
      if v_external_id is null or exists(
        select 1 from private.portability_job_items as item
        where item.job_kind = v_job.kind
          and item.job_id = p_import_job_id
          and item.item_key = v_item_key
      ) or (p_progress_policy = 'import_if_empty' and not v_mastery_empty) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_card_id := (p_card_id_map ->> (v_mastery ->> 'cardExternalId'))::uuid;
      select card.content_version into v_content_version
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
      v_values := v_mastery -> 'values';
      v_stage := case
        when v_values ->> 'stage' in (
          'unseen','introduced','recognition','guided_recall',
          'free_recall','mastered','needs_refresh'
        ) then (v_values ->> 'stage')::public.mastery_stage
        else 'unseen'::public.mastery_stage
      end;
      insert into public.concept_mastery (
        learner_profile_id, card_id, recognition, recall, overall, stage,
        evidence_count, spaced_recall_successes, last_evidence_at,
        content_version, version
      ) values (
        p_learner_profile_id, v_card_id,
        pg_catalog.greatest(
          0,
          pg_catalog.least(1, coalesce((v_values ->> 'recognition')::double precision, 0))
        ),
        pg_catalog.greatest(
          0,
          pg_catalog.least(1, coalesce((v_values ->> 'recall')::double precision, 0))
        ),
        pg_catalog.greatest(
          0,
          pg_catalog.least(1, coalesce((v_values ->> 'overall')::double precision, 0))
        ),
        v_stage,
        pg_catalog.greatest(0, coalesce((v_values ->> 'evidenceCount')::integer, 0)),
        pg_catalog.greatest(
          0,
          pg_catalog.least(
            2,
            coalesce((v_values ->> 'spacedRecallSuccesses')::integer, 0)
          )
        ),
        (v_mastery ->> 'occurredAt')::timestamptz,
        v_content_version, 1
      )
      on conflict (learner_profile_id, card_id) do update
      set recognition = excluded.recognition,
          recall = excluded.recall,
          overall = excluded.overall,
          stage = excluded.stage,
          evidence_count = excluded.evidence_count,
          spaced_recall_successes = excluded.spaced_recall_successes,
          last_evidence_at = excluded.last_evidence_at,
          content_version = excluded.content_version,
          version = public.concept_mastery.version + 1,
          updated_at = pg_catalog.now()
      where p_progress_policy = 'merge_explicit'
        and public.concept_mastery.evidence_count = 0;
      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      insert into private.portability_job_items (
        job_kind, job_id, item_key, source_fingerprint, canonical_id, result
      ) values (
        v_job.kind, p_import_job_id, v_item_key,
        private.content_hash(v_mastery), v_card_id, 'created'
      );
      v_mastery_restored := v_mastery_restored + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range
        or not_null_violation or unique_violation or check_violation then
        v_skipped := v_skipped + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'masteryRestored', v_mastery_restored,
    'practiceRestored', v_practice_restored,
    'skipped', v_skipped
  );
end;
$function$;

revoke all on function public.admin_get_portability_upload_object(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_get_portability_card_id_map(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_portability_evidence_chunk(
  uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, integer, text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_get_portability_upload_object(uuid, uuid)
to service_role;
grant execute on function public.admin_get_portability_card_id_map(uuid, uuid)
to service_role;
grant execute on function public.admin_restore_portability_evidence_chunk(
  uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, integer, text
) to service_role;
