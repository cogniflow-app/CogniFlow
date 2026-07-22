-- Lazy schedule initialization for audited controls on never-reviewed Phase 02 cards.

create or replace function public.admin_set_srs_schedule_control(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_operation public.schedule_operation_kind,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_effective_at timestamptz,
  p_value jsonb,
  p_study_session_id uuid,
  p_scheduler_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schedule public.card_schedules;
  v_existing public.schedule_operation_events;
  v_preset public.srs_presets;
  v_deck_id uuid;
  v_content_version bigint;
  v_before jsonb;
  v_after jsonb;
  v_created boolean := false;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_operation not in ('suspend','unsuspend','star','unstar','bury','manual_due','due_order','mark_leech')
    or p_operation_event_id is null or p_idempotency_key is null or p_effective_at is null
    or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or pg_catalog.char_length(p_scheduler_version) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid schedule control command';
  end if;
  if p_study_session_id is not null and not exists(
    select 1 from public.study_sessions as session
    join public.study_session_items as item on item.study_session_id = session.id
    where session.id = p_study_session_id
      and session.actor_account_id = p_actor_account_id
      and session.learner_profile_id = p_learner_profile_id
      and session.status in ('active','paused')
      and item.card_id = p_card_id and item.status in ('pending','shown')
  ) then
    raise exception using errcode = '42501', message = 'study session item is unavailable';
  end if;
  if p_operation = 'bury' and (
    not p_value ? 'until' or (p_value->>'until')::timestamptz <= p_effective_at
  ) or p_operation = 'manual_due' and not p_value ? 'due' then
    raise exception using errcode = '22023', message = 'invalid schedule control value';
  end if;
  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id and event.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'eventId', v_existing.id, 'duplicate', true, 'schedule', v_existing.after_state
    );
  end if;
  select note.deck_id, card.content_version into v_deck_id, v_content_version
  from public.cards as card
  join public.notes as note on note.id = card.note_id
  join public.decks as deck on deck.id = note.deck_id
  where card.id = p_card_id and card.active and card.deleted_at is null
    and note.deleted_at is null and deck.status = 'active';
  if not found or not private.srs_can_study_deck(
    p_actor_account_id, p_learner_profile_id, v_deck_id
  ) then
    raise exception using errcode = '42501', message = 'card is not available for schedule control';
  end if;
  v_preset := private.ensure_default_srs_preset(p_learner_profile_id);
  select preset.* into v_preset
  from public.deck_srs_settings as setting
  join public.srs_presets as preset on preset.id = setting.preset_id
  where setting.learner_profile_id = p_learner_profile_id
    and setting.deck_id = v_deck_id and preset.deleted_at is null;
  if not found then
    v_preset := private.ensure_default_srs_preset(p_learner_profile_id);
    insert into public.deck_srs_settings (learner_profile_id, deck_id, preset_id)
    values (p_learner_profile_id, v_deck_id, v_preset.id)
    on conflict (learner_profile_id, deck_id) do nothing;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || p_card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id for update;
  if not found then
    insert into public.card_schedules (
      learner_profile_id, card_id, algorithm, state, due, stability, difficulty,
      legacy_ease_factor, scheduler_version, preset_version, content_version, version
    ) values (
      p_learner_profile_id, p_card_id, v_preset.algorithm, 'new', p_effective_at,
      case when v_preset.algorithm = 'fsrs' then 0 else null end,
      case when v_preset.algorithm = 'fsrs' then 0 else null end,
      case when v_preset.algorithm = 'sm2' then 2500 else null end,
      p_scheduler_version, v_preset.version, v_content_version, 1
    ) returning * into v_schedule;
    v_created := true;
    v_before := null;
  else
    v_before := pg_catalog.to_jsonb(v_schedule);
  end if;
  if p_operation = 'due_order' and (
    v_schedule.state <> 'new' or not (p_value ? 'order')
    or (p_value->>'order')::integer not between 0 and 1000000000
  ) then
    raise exception using errcode = '22023', message = 'due order applies only to New cards';
  end if;
  update public.card_schedules set
    suspended = case when p_operation = 'suspend' then true when p_operation = 'unsuspend' then false else suspended end,
    suspended_at = case when p_operation = 'suspend' then p_effective_at when p_operation = 'unsuspend' then null else suspended_at end,
    starred = case when p_operation = 'star' then true when p_operation = 'unstar' then false else starred end,
    buried_until = case when p_operation = 'bury' then (p_value->>'until')::timestamptz else buried_until end,
    due = case when p_operation = 'manual_due' then (p_value->>'due')::timestamptz else due end,
    due_order = case when p_operation = 'due_order' then (p_value->>'order')::integer else due_order end,
    leech = case when p_operation = 'mark_leech' then true else leech end,
    version = case when v_created then version else version + 1 end,
    updated_at = pg_catalog.now()
  where learner_profile_id = p_learner_profile_id and card_id = p_card_id
  returning pg_catalog.to_jsonb(card_schedules.*) into v_after;
  if p_study_session_id is not null and p_operation in ('suspend','bury') then
    update public.study_session_items set
      status = 'skipped',
      shown_at = coalesce(shown_at, p_effective_at),
      completed_at = p_effective_at
    where study_session_id = p_study_session_id and card_id = p_card_id
      and status in ('pending','shown');
    update public.study_sessions set
      completed_items = completed_items + 1,
      last_activity_at = p_effective_at,
      status = case
        when completed_items + 1 >= total_items then 'completed'::public.study_session_status
        else 'active'::public.study_session_status
      end,
      completed_at = case when completed_items + 1 >= total_items then p_effective_at else null end,
      version = version + 1
    where id = p_study_session_id;
  end if;
  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, p_card_id, p_actor_account_id, p_device_id,
    p_operation, p_idempotency_key, 1, v_before, v_after
  );
  return pg_catalog.jsonb_build_object(
    'eventId', p_operation_event_id,
    'duplicate', false,
    'initialized', v_created,
    'schedule', v_after
  );
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'invalid schedule control value';
end;
$function$;

revoke all on function public.admin_set_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,timestamptz,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,timestamptz,jsonb,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,timestamptz,jsonb,uuid,text
) to service_role;
