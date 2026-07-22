begin;

select plan(7);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000','b0000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','srs-queue-performance@example.test','',pg_catalog.now(),
  '{}','{}',pg_catalog.now(),pg_catalog.now(),false
);
update public.profiles set account_status='active',onboarding_completed_at=pg_catalog.now(),
  age_band='adult',display_name='Queue Performance',handle='srs_queue_performance'
where id='b0000000-0000-4000-8000-000000000001';
insert into auth.sessions (id,user_id,created_at,updated_at,not_after) values (
  'b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',
  pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour'
);
insert into public.devices (id,account_id,auth_session_id,display_name,platform,idempotency_key) values (
  'b0000000-0000-4000-8000-000000000010','b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002','Performance browser','pgTAP',
  'b0000000-0000-4000-8000-000000000011'
);
insert into public.decks (id,owner_account_id,title,slug,default_note_type_id,content_hash) values (
  'b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001',
  'Large due queue','large-due-queue','02000000-0000-4000-8000-000000000001',repeat('1',64)
);
insert into public.srs_presets (id,learner_profile_id,name,is_default) values (
  'b0000000-0000-4000-8000-000000000004',
  (select id from public.learner_profiles where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'),
  'Default',true
);
insert into public.deck_srs_settings (learner_profile_id,deck_id,preset_id) values (
  (select id from public.learner_profiles where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'),
  'b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000004'
);

insert into public.notes (
  id,deck_id,note_type_id,created_by,updated_by,content_hash,sort_text
)
select
  ('b1000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text,12,'0'))::uuid,
  'b0000000-0000-4000-8000-000000000003','02000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  pg_catalog.encode(extensions.digest(series.value::text,'sha256'),'hex'),series.value::text
from pg_catalog.generate_series(1,10000) as series(value);

insert into public.cards (
  id,note_id,template_id,ordinal,card_kind,generation_key,content_version,active
)
select
  ('b2000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text,12,'0'))::uuid,
  ('b1000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text,12,'0'))::uuid,
  (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
  0,'basic','forward',1,true
from pg_catalog.generate_series(1,10000) as series(value);

insert into public.card_schedules (
  learner_profile_id,card_id,algorithm,state,due,stability,difficulty,elapsed_days,
  scheduled_days,learning_step,reps,lapses,legacy_ease_factor,scheduler_version,
  preset_version,content_version,version
)
select
  (select id from public.learner_profiles where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'),
  ('b2000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text,12,'0'))::uuid,
  'fsrs','review',pg_catalog.now()-pg_catalog.make_interval(mins => series.value),
  30,5,1,30,0,1,0,null,'lumen-srs/1 (v5.4.1 using FSRS-6.0)',1,1,1
from pg_catalog.generate_series(1,10000) as series(value);

insert into public.study_sessions (
  id,learner_profile_id,actor_account_id,mode,source,rescheduling,status,timezone,
  study_day_start,study_day,queue_seed,total_items,completed_items
) values (
  'b3000000-0000-4000-8000-000000000001',
  (select id from public.learner_profiles where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'),
  'b0000000-0000-4000-8000-000000000001','today','today',true,'paused','America/Chicago',
  240,current_date,'performance-session',1,0
);
insert into public.study_session_items (study_session_id,position,card_id,schedule_version_at_enqueue,state_at_enqueue)
values ('b3000000-0000-4000-8000-000000000001',0,'b2000000-0000-4000-8000-000000000001',1,'review');

select is(
  (select count(*)::integer from public.card_schedules where learner_profile_id=(
    select id from public.learner_profiles
    where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
  )),
  10000,
  'large queue fixture contains 10,000 due schedules'
);
select ok(
  exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='card_schedules_due_queue_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='card_schedules_state_due_idx'),
  'large due-queue predicates have dedicated learner/state/due indexes'
);

analyze public.decks, public.notes, public.cards, public.card_schedules;

create temporary table srs_queue_measurement (name text primary key, plan json not null) on commit drop;
grant select,insert on srs_queue_measurement to authenticated;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b0000000-0000-4000-8000-000000000002"}';
select results_eq(
  $$
    select
      (select count(*)::integer from public.notes),
      (select count(*)::integer from public.cards),
      (select count(*)::integer from public.card_schedules)
  $$,
  $$ values (10000,10000,10000) $$,
  'the performance fixture measures an authorized registered-device read path'
);
do $measurement$
declare
  v_plan json;
begin
  execute $query$
    explain (analyze,buffers,format json)
    select schedule.card_id
    from public.card_schedules as schedule
    join public.cards as card on card.id=schedule.card_id
    join public.notes as note on note.id=card.note_id
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    )
      and not schedule.suspended
      and (schedule.buried_until is null or schedule.buried_until<=pg_catalog.now())
      and schedule.due<=pg_catalog.now()
      and card.active and card.deleted_at is null and note.deleted_at is null
    order by schedule.due,schedule.card_id
    limit 200
  $query$ into v_plan;
  insert into srs_queue_measurement values ('large_queue',v_plan);

  execute $dashboard$
    explain (analyze,buffers,format json)
    select schedule.state,pg_catalog.count(*),
      pg_catalog.count(*) filter (where schedule.due<=pg_catalog.now()) as due
    from public.card_schedules as schedule
    join public.cards as card on card.id=schedule.card_id
    join public.notes as note on note.id=card.note_id
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) and card.active and card.deleted_at is null and note.deleted_at is null
    group by schedule.state
  $dashboard$ into v_plan;
  insert into srs_queue_measurement values ('today_dashboard',v_plan);

  execute $resume$
    explain (analyze,buffers,format json)
    select session.id,session.total_items,session.completed_items
    from public.study_sessions as session
    where session.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) and session.status in ('active','paused')
    order by session.last_activity_at desc limit 1
  $resume$ into v_plan;
  insert into srs_queue_measurement values ('session_resume',v_plan);

  execute $statistics$
    explain (analyze,buffers,format json)
    select schedule.state,pg_catalog.count(*),pg_catalog.avg(schedule.stability),
      pg_catalog.avg(schedule.difficulty),pg_catalog.sum(schedule.lapses),
      pg_catalog.count(*) filter (where schedule.leech)
    from public.card_schedules as schedule
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) group by schedule.state
  $statistics$ into v_plan;
  insert into srs_queue_measurement values ('statistics',v_plan);
end;
$measurement$;
select performs_ok(
  $$
    select schedule.card_id
    from public.card_schedules as schedule
    join public.cards as card on card.id=schedule.card_id
    join public.notes as note on note.id=card.note_id
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    )
      and not schedule.suspended
      and (schedule.buried_until is null or schedule.buried_until<=pg_catalog.now())
      and schedule.due<=pg_catalog.now()
      and card.active and card.deleted_at is null and note.deleted_at is null
    order by schedule.due,schedule.card_id
    limit 200
  $$,
  500::numeric,
  'RLS-protected 10,000-card due queue returns its first page within 500 ms'
);
select performs_ok(
  $$
    select schedule.state,pg_catalog.count(*),
      pg_catalog.count(*) filter (where schedule.due<=pg_catalog.now()) as due
    from public.card_schedules as schedule
    join public.cards as card on card.id=schedule.card_id
    join public.notes as note on note.id=card.note_id
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) and card.active and card.deleted_at is null and note.deleted_at is null
    group by schedule.state
  $$,
  1500::numeric,
  'RLS-protected 10,000-card Today summary aggregation completes within 1500 ms'
);
select performs_ok(
  $$
    select session.id from public.study_sessions as session
    where session.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) and session.status in ('active','paused')
    order by session.last_activity_at desc limit 1
  $$,
  500::numeric,
  'paused-session resume lookup completes within 500 ms'
);
select performs_ok(
  $$
    select schedule.state,pg_catalog.count(*),pg_catalog.avg(schedule.stability),
      pg_catalog.avg(schedule.difficulty),pg_catalog.sum(schedule.lapses)
    from public.card_schedules as schedule
    where schedule.learner_profile_id=(
      select id from public.learner_profiles
      where owner_account_id='b0000000-0000-4000-8000-000000000001' and kind='self'
    ) group by schedule.state
  $$,
  500::numeric,
  '10,000-card statistics aggregation completes within 500 ms'
);
reset role;
select diag(
  'SRS_QUEUE_10000_EXECUTION_MS=' ||
  (select plan->0->>'Execution Time' from srs_queue_measurement where name='large_queue')
);
select diag(
  'SRS_TODAY_10000_EXECUTION_MS=' ||
  (select plan->0->>'Execution Time' from srs_queue_measurement where name='today_dashboard')
);
select diag(
  'SRS_SESSION_RESUME_EXECUTION_MS=' ||
  (select plan->0->>'Execution Time' from srs_queue_measurement where name='session_resume')
);
select diag(
  'SRS_STATS_10000_EXECUTION_MS=' ||
  (select plan->0->>'Execution Time' from srs_queue_measurement where name='statistics')
);

select * from finish();
rollback;
