begin;

select no_plan();

select has_table('public', 'srs_presets', 'SRS presets exist');
select has_table('public', 'deck_srs_settings', 'deck SRS settings exist');
select has_table('public', 'card_schedules', 'learner/card schedules exist');
select has_table('public', 'review_logs', 'immutable review logs exist');
select has_table('public', 'study_sessions', 'study sessions exist');
select has_table('public', 'study_session_items', 'study session items exist');
select has_table('public', 'study_filters', 'custom study filters exist');
select has_table('public', 'daily_study_counters', 'daily counters exist');
select has_table('public', 'schedule_snapshots', 'schedule snapshots exist');
select has_table('public', 'review_undo_events', 'compensating undo events exist');
select has_table('public', 'schedule_operation_events', 'audited schedule operations exist');
select has_table('public', 'srs_optimization_jobs', 'feature-flagged optimization metadata exists');
select has_table('public', 'srs_preset_versions', 'preset history exists');
select has_table('public', 'content_change_schedule_decisions', 'private content-change choices exist');
select has_table('public', 'study_session_events', 'study session controls are audited');
select has_table('public', 'study_content_reports', 'private study-content reports exist');

select ok(
  not exists(
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'srs_presets','deck_srs_settings','card_schedules','review_logs','study_sessions',
        'study_session_items','study_filters','daily_study_counters','schedule_snapshots',
        'review_undo_events','schedule_operation_events','srs_optimization_jobs',
        'srs_preset_versions','content_change_schedule_decisions','study_session_events',
        'study_content_reports'
      ) and not relation.relrowsecurity
  ),
  'RLS is enabled on every Phase 03 table'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.card_schedules', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.review_logs', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'public.card_schedules', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'public.review_logs', 'select'),
  'public and service-role callers cannot bypass the private schedule RPC boundary'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.study_content_reports', 'select')
  and pg_catalog.has_table_privilege('authenticated', 'public.study_content_reports', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.study_content_reports', 'insert')
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_report_study_content(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.study_content_report_reason,text)',
    'execute'
  ),
  'content reports are learner-private and writable only through the trusted service path'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.card_schedules', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.card_schedules', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.review_logs', 'insert')
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_commit_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_commit_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text)',
    'execute'
  ),
  'authenticated reads use RLS while canonical writes stay service-only'
);
select ok(
  (select procedure.prosecdef from pg_catalog.pg_proc as procedure
   where procedure.oid = 'public.admin_commit_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text)'::regprocedure)
  and (select procedure.proconfig @> array['search_path=""']::text[] from pg_catalog.pg_proc as procedure
   where procedure.oid = 'public.admin_commit_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text)'::regprocedure) is true,
  'canonical review commit is security-definer with an empty search path'
);
select ok(
  exists(select 1 from pg_catalog.pg_trigger where tgrelid = 'public.review_logs'::regclass and tgname = 'review_logs_append_only')
  and exists(select 1 from pg_catalog.pg_trigger where tgrelid = 'public.review_undo_events'::regclass and tgname = 'review_undo_events_append_only'),
  'review evidence and compensations are append-only'
);

create temporary table srs_fixture (name text primary key, value text not null) on commit drop;
grant select, insert, update, delete on srs_fixture to authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'srs-owner@example.test','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now(),false),
  ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'srs-attacker@example.test','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now(),false);
update public.profiles set account_status = 'active', onboarding_completed_at = pg_catalog.now(), age_band = 'adult',
  display_name = case when id = '91000000-0000-4000-8000-000000000001' then 'SRS Owner' else 'SRS Attacker' end,
  handle = case when id = '91000000-0000-4000-8000-000000000001' then 'srs_owner' else 'srs_attacker' end
where id in ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002');
insert into auth.sessions (id,user_id,created_at,updated_at,not_after) values
  ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour'),
  ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour');
insert into public.devices (id,account_id,auth_session_id,display_name,platform,idempotency_key) values
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','SRS browser','pgTAP','94000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','Attacker browser','pgTAP','94000000-0000-4000-8000-000000000002');

insert into srs_fixture values
  ('owner_learner',(select id::text from public.learner_profiles where owner_account_id='91000000-0000-4000-8000-000000000001' and kind='self')),
  ('attacker_learner',(select id::text from public.learner_profiles where owner_account_id='91000000-0000-4000-8000-000000000002' and kind='self')),
  ('reviewed_at',pg_catalog.clock_timestamp()::text);

insert into public.decks (
  id,owner_account_id,title,slug,default_note_type_id,content_hash
) values (
  '95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  'SRS test deck','srs-test-deck','02000000-0000-4000-8000-000000000001',repeat('a',64)
);
insert into public.notes (
  id,deck_id,note_type_id,created_by,updated_by,content_hash,sort_text
) values (
  '96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',
  '02000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',repeat('b',64),'Question'
);
insert into public.cards (
  id,note_id,template_id,ordinal,card_kind,generation_key,content_version,active
) values
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',
   (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
   0,'basic','forward',1,true),
  ('97000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000001',
   (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
   1,'basic','sibling',1,true);

set local role service_role;
select ok(
  (public.admin_get_srs_review_context(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001',null
  )->>'deckId')::uuid = '95000000-0000-4000-8000-000000000001',
  'trusted review context authorizes the actor, learner, device, and card and lazily creates defaults'
);
reset role;
insert into srs_fixture values
  ('preset',(select id::text from public.srs_presets where learner_profile_id=(select value::uuid from srs_fixture where name='owner_learner') and is_default));

set local role service_role;
select is(
  (public.admin_commit_srs_review(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001',null,'good',(select value::timestamptz from srs_fixture where name='reviewed_at'),
    1200,'America/Chicago',240::smallint,0::bigint,'98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',repeat('c',64),'today',(select value::uuid from srs_fixture where name='preset'),1::bigint,
    pg_catalog.jsonb_build_object(
      'algorithm','fsrs','state','new','due',(select value::timestamptz from srs_fixture where name='reviewed_at'),
      'lastReviewedAt',null,'stability',0,'difficulty',0,'elapsedDays',0,'scheduledDays',0,
      'learningStep',0,'reps',0,'lapses',0,'legacyEaseFactor',null,
      'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'
    ),
    pg_catalog.jsonb_build_object(
      'algorithm','fsrs','state','learning','due',(select value::timestamptz from srs_fixture where name='reviewed_at')+interval '10 minutes',
      'lastReviewedAt',(select value::timestamptz from srs_fixture where name='reviewed_at'),
      'stability',2.3065,'difficulty',2.11810397,'elapsedDays',0,'scheduledDays',0,
      'learningStep',1,'reps',1,'lapses',0,'legacyEaseFactor',null,
      'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'
    ),'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'scheduleVersion')::bigint,
  1::bigint,
  'canonical review atomically creates version one'
);

select is(
  (public.admin_commit_srs_review(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001',null,'good',(select value::timestamptz from srs_fixture where name='reviewed_at'),
    1200,'America/Chicago',240::smallint,0::bigint,'98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',repeat('c',64),'today',(select value::uuid from srs_fixture where name='preset'),1::bigint,
    pg_catalog.jsonb_build_object('algorithm','fsrs','state','new','due',(select value::timestamptz from srs_fixture where name='reviewed_at'),'lastReviewedAt',null,'stability',0,'difficulty',0,'elapsedDays',0,'scheduledDays',0,'learningStep',0,'reps',0,'lapses',0,'legacyEaseFactor',null,'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'),
    pg_catalog.jsonb_build_object('algorithm','fsrs','state','learning','due',(select value::timestamptz from srs_fixture where name='reviewed_at')+interval '10 minutes','lastReviewedAt',(select value::timestamptz from srs_fixture where name='reviewed_at'),'stability',2.3065,'difficulty',2.11810397,'elapsedDays',0,'scheduledDays',0,'learningStep',1,'reps',1,'lapses',0,'legacyEaseFactor',null,'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'),
    'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'duplicate'),
  'true',
  'a duplicate review ID returns the stored result without reapplying'
);

select throws_ok(
  $$select public.admin_commit_srs_review(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
    (select value::uuid from srs_fixture where name='owner_learner'),null,'97000000-0000-4000-8000-000000000001',null,'good',
    (select value::timestamptz from srs_fixture where name='reviewed_at'),1200,'America/Chicago',240::smallint,0::bigint,
    '98000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001',repeat('d',64),'today',
    (select value::uuid from srs_fixture where name='preset'),1::bigint,'{}','{}','lumen-srs/1 (v5.4.1 using FSRS-6.0)')$$,
  '22023','review idempotency key was reused with different input',
  'a reused review ID with a different command is rejected'
);
reset role;

select is((select count(*)::integer from public.review_logs),1,'idempotent review leaves one immutable log');
select is((select count(*)::integer from public.schedule_snapshots),1,'canonical review appends one replay snapshot');
select is((select reps from public.card_schedules where card_id='97000000-0000-4000-8000-000000000001'),1,'canonical review increments schedule once');
select ok((select buried_until is not null from public.card_schedules where card_id='97000000-0000-4000-8000-000000000002'),'a due sibling is buried until the next study day');
select is((select good_count from public.daily_study_counters),1,'daily counters update exactly once');

select throws_ok(
  $$update public.review_logs set duration_ms = 0 where id='98000000-0000-4000-8000-000000000001'$$,
  '55000','SRS evidence is append-only','review logs cannot be rewritten even by the database owner'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"92000000-0000-4000-8000-000000000002"}';
select is((select count(*)::integer from public.card_schedules),0,'another learner cannot read schedule state');
select is((select count(*)::integer from public.review_logs),0,'another learner cannot read review history');
select throws_ok(
  $$insert into public.card_schedules (
      learner_profile_id,card_id,algorithm,state,due,stability,difficulty,scheduler_version,preset_version,content_version
    ) values (
      (select value::uuid from srs_fixture where name='attacker_learner'),'97000000-0000-4000-8000-000000000001',
      'fsrs','new',pg_catalog.now(),0,0,'bypass',1,1
    )$$,
  '42501',null,'clients cannot create a schedule directly'
);
reset role;
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"92000000-0000-4000-8000-000000000001"}';

set local role service_role;
select is(
  (public.admin_undo_srs_review(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'98000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001',
    '9b000000-0000-4000-8000-000000000001','mistake'
  )->>'scheduleVersion')::bigint,
  2::bigint,
  'undo writes a compensating event and advances the schedule version'
);
reset role;
select is((select reps from public.card_schedules where card_id='97000000-0000-4000-8000-000000000001'),0,'undo restores the prior scheduler state');
select is((select count(*)::integer from public.review_logs),1,'undo never deletes review history');
select is((select count(*)::integer from public.review_undo_events),1,'undo appends compensating evidence');
select is((select good_count from public.daily_study_counters),0,'undo compensates the daily counter');

update public.notes set version = 2 where id='96000000-0000-4000-8000-000000000001';
update public.cards set content_version = 2 where id='97000000-0000-4000-8000-000000000001';
insert into public.content_change_impacts (
  id,deck_id,note_id,from_note_version,to_note_version,classification,affected_generation_keys,created_by
) values (
  '9c000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',1,2,'answer',array['forward'],
  '91000000-0000-4000-8000-000000000001'
);
select ok(
  exists(select 1 from public.cards where id='97000000-0000-4000-8000-000000000001' and active and deleted_at is null),
  'semantic edit keeps the stable generated card active'
);
select ok(
  private.can_study_deck(
    '91000000-0000-4000-8000-000000000001',
    (select value::uuid from srs_fixture where name='owner_learner'),
    '95000000-0000-4000-8000-000000000001'
  ),
  'learner retains study access after the semantic edit'
);

set local role service_role;
select is(
  public.admin_apply_content_change_schedule_decision(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001','preserve',
    '9d000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000001',
    2::bigint,'{}'::jsonb,'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'choice',
  'preserve',
  'a semantic edit requires and records a learner-private schedule choice'
);
reset role;
select is((select content_version from public.card_schedules where card_id='97000000-0000-4000-8000-000000000001'),2::bigint,'preserve advances the schedule content version');
select is((select count(*)::integer from public.content_change_schedule_decisions),1,'content-change choice is appended once');

set local role service_role;
select is(
  (public.admin_replace_srs_schedule(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001','forget',
    '9f000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
    3::bigint,(select value::uuid from srs_fixture where name='preset'),1::bigint,
    pg_catalog.jsonb_build_object(
      'algorithm','fsrs','state','new','due',pg_catalog.now(),'lastReviewedAt',null,
      'stability',0,'difficulty',0,'elapsedDays',0,'scheduledDays',0,'learningStep',0,
      'reps',0,'lapses',0,'legacyEaseFactor',null,
      'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'
    ),'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'scheduleVersion')::bigint,
  4::bigint,
  'forget replaces the schedule without rewriting review history'
);

select is(
  (public.admin_create_study_session(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'a1000000-0000-4000-8000-000000000001',null,null,'cram','cram',false,
    'America/Chicago',240::smallint,pg_catalog.now(),'preview-seed-0001',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'cardId','97000000-0000-4000-8000-000000000001','position',0,'scheduleVersion',4,'state','new'
    ))
  )->>'totalItems')::integer,
  1,
  'preview-only custom study creates a deterministic temporary session'
);
select is(
  public.admin_control_study_session(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    'preview_next','97000000-0000-4000-8000-000000000001'
  )->>'action',
  'preview_next',
  'preview progression is explicit and audited'
);
reset role;
select is((select version from public.card_schedules where card_id='97000000-0000-4000-8000-000000000001'),4::bigint,'preview progression never changes canonical scheduling');
select is((select count(*)::integer from public.review_logs),1,'preview progression never creates review evidence');

set local role service_role;
select is(
  (public.admin_bury_srs_siblings(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',pg_catalog.now()+interval '1 day',
    'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'affectedCount')::integer,
  1,
  'explicit sibling bury handles existing or lazy New sibling schedules atomically'
);
select is(
  public.admin_report_study_content(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001','incorrect','Answer needs checking'
  )->>'duplicate',
  'false',
  'study content reports are written through the authorized append-only path'
);
select is(
  (public.admin_bulk_srs_schedule_control(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],'suspend',true,0,
    '00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000',
    pg_catalog.now(),'{}'::jsonb
  )->>'affectedCount')::integer,
  2,
  'bulk schedule control previews the exact affected count without mutation'
);
select is(
  (public.admin_bulk_srs_schedule_control(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],'suspend',false,2,
    'a7000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001',
    pg_catalog.now(),'{}'::jsonb
  )->>'affectedCount')::integer,
  2,
  'bulk schedule control applies the confirmed count in one locked transaction'
);
select throws_ok(
  $$select public.admin_bulk_srs_schedule_control(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],'unsuspend',false,1,
    'a9000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',
    pg_catalog.now(),'{}'::jsonb
  )$$,
  '40001','SRS_BULK_PREVIEW_STALE','bulk confirmation rejects a stale preview count'
);
reset role;
select is((select count(*)::integer from public.study_content_reports),1,'content report evidence exists once');
select is((select count(*)::integer from public.card_schedules where suspended),2,'confirmed bulk suspension changes exactly the previewed schedules');

set local role service_role;
select is(
  (public.admin_save_srs_preset(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'ab000000-0000-4000-8000-000000000001',0,'Focused review',
    pg_catalog.jsonb_build_object(
      'algorithm','fsrs','requested_retention',0.91,'maximum_interval_days',36500,
      'learning_steps_minutes',pg_catalog.jsonb_build_array(1,10),
      'relearning_steps_minutes',pg_catalog.jsonb_build_array(10),'short_term_enabled',true,
      'fuzz_enabled',false,'new_cards_per_day',10,'reviews_per_day',100,
      'new_card_order','created','review_order','retrievability','new_review_mix','interleave',
      'bury_siblings',true,'leech_threshold',8,'leech_action','tag','fsrs_weights',null
    )
  )->>'name'),
  'Focused review',
  'a personal preset can be created through versioned validation'
);
select is(
  (public.admin_apply_srs_preset_to_decks(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'ab000000-0000-4000-8000-000000000001',array['95000000-0000-4000-8000-000000000001']::uuid[]
  )->>'appliedDecks')::integer,
  1,
  'a personal preset applies to selected decks'
);
select is(
  (public.admin_delete_srs_preset(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'ab000000-0000-4000-8000-000000000001',1
  )->>'reassignedDecks')::integer,
  1,
  'deleting a personal preset safely reassigns its decks to the learner default'
);
reset role;
select ok((select count(*) >= 3 from public.srs_preset_versions),'preset creation and deletion retain append-only version history');

set local role service_role;
select is(
  (public.admin_save_study_filter(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'b0000000-0000-4000-8000-000000000001',0,'Hard cards',
    '{"mode":"leeches","rescheduling":false}'::jsonb
  )->>'version')::bigint,
  1::bigint,
  'saved custom-study filters are validated and versioned through the trusted boundary'
);
select is(
  (public.admin_delete_study_filter(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'b0000000-0000-4000-8000-000000000001',1
  )->>'version')::bigint,
  2::bigint,
  'saved custom-study filters are soft-deleted without losing session-safe identity'
);
select is(
  (public.admin_save_srs_preset(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'b1000000-0000-4000-8000-000000000001',0,'SM-2 migration target',
    pg_catalog.jsonb_build_object(
      'algorithm','sm2','requested_retention',0.9,'maximum_interval_days',36500,
      'learning_steps_minutes',pg_catalog.jsonb_build_array(1,10),
      'relearning_steps_minutes',pg_catalog.jsonb_build_array(10),'short_term_enabled',true,
      'fuzz_enabled',true,'new_cards_per_day',20,'reviews_per_day',200,
      'new_card_order','created','review_order','due','new_review_mix','interleave',
      'bury_siblings',true,'leech_threshold',8,'leech_action','tag','fsrs_weights',null
    )
  )->>'algorithm'),
  'sm2',
  'a genuine SM-2 preset can be created as an explicit migration target'
);
select throws_ok(
  $$select public.admin_apply_srs_preset_to_decks(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'b1000000-0000-4000-8000-000000000001',array['95000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '55000','preset algorithm migration requires schedule replay',
  'a preset cannot silently change algorithms while schedules still use the prior algorithm'
);
select is(
  (public.admin_preview_srs_algorithm_migration(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],
    'b1000000-0000-4000-8000-000000000001'
  )->>'affectedCount')::integer,
  2,
  'algorithm migration previews the exact affected schedule count'
);
select is(
  pg_catalog.jsonb_array_length(public.admin_get_srs_algorithm_migration_context(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],
    'b1000000-0000-4000-8000-000000000001'
  )->'rows'),
  2,
  'trusted migration context supplies immutable non-undone history for server replay'
);
select is(
  (public.admin_commit_srs_algorithm_migration(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,array['95000000-0000-4000-8000-000000000001']::uuid[],
    'b1000000-0000-4000-8000-000000000001',2,
    'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',
    (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'cardId',entry->>'cardId','expectedVersion',(entry->>'expectedVersion')::bigint,
      'scheduleAfter',pg_catalog.jsonb_build_object(
        'algorithm','sm2','state','new','due',entry->>'createdAt',
        'lastReviewedAt',null,'stability',null,'difficulty',null,
        'elapsedDays',0,'scheduledDays',0,'learningStep',0,
        'reps',pg_catalog.jsonb_array_length(entry->'history'),'lapses',0,
        'legacyEaseFactor',2500,'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'
      )
    ) order by entry->>'cardId')
    from pg_catalog.jsonb_array_elements(public.admin_get_srs_algorithm_migration_context(
      '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
      null,array['95000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'
    )->'rows') as entry)
  )->>'affectedCount')::integer,
  2,
  'confirmed algorithm migration atomically commits trusted replayed schedules'
);
reset role;
select ok(
  (select pg_catalog.bool_and(algorithm='sm2' and legacy_ease_factor=2500 and stability is null)
   from public.card_schedules),
  'SM-2 migration stores genuine legacy ease only on SM-2 schedules'
);
select is(
  (select preset_id from public.deck_srs_settings where deck_id='95000000-0000-4000-8000-000000000001'),
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'algorithm migration applies the target preset in the same transaction'
);
select is(
  (select affected_count from public.schedule_operation_events where id='b2000000-0000-4000-8000-000000000001'),
  2,
  'algorithm migration retains aggregate before/after audit evidence'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_commit_srs_algorithm_migration(uuid,uuid,uuid,uuid,uuid,uuid[],uuid,integer,uuid,uuid,jsonb)',
    'execute'
  ) and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_commit_srs_algorithm_migration(uuid,uuid,uuid,uuid,uuid,uuid[],uuid,integer,uuid,uuid,jsonb)',
    'execute'
  ),
  'algorithm migration remains an exact-grant trusted server boundary'
);
insert into public.cards (
  id,note_id,template_id,ordinal,card_kind,generation_key,content_version,active
) values (
  '97000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000001',
  (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
  2,'basic','lazy-control',2,true
);
set local role service_role;
select is(
  public.admin_set_srs_schedule_control(
    '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',(select value::uuid from srs_fixture where name='owner_learner'),
    null,'97000000-0000-4000-8000-000000000003','due_order',
    'b4000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
    pg_catalog.now(),'{"order":7}'::jsonb,null,'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
  )->>'initialized',
  'true',
  'an audited control lazily initializes a never-reviewed Phase 02 card schedule'
);
reset role;
select is(
  (select due_order from public.card_schedules where card_id='97000000-0000-4000-8000-000000000003'),
  7,
  'lazy New-card due order is stored for deterministic queue ordering'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '91000000-0000-4000-8000-000000000001','account_deletion',
      pg_catalog.decode(pg_catalog.repeat('71',32),'hex'),pg_catalog.now()+interval '5 minutes',
      'ac000000-0000-4000-8000-000000000001'
    );
    select public.admin_request_account_deletion(
      '91000000-0000-4000-8000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('71',32),'hex'),1,
      'ad000000-0000-4000-8000-000000000001'
    );
  $$,
  'a reauthenticated deletion request accepts an account with SRS evidence'
);
reset role;
insert into srs_fixture (name,value)
select 'deletion_job',job.id::text from public.deletion_jobs as job
where job.account_id='91000000-0000-4000-8000-000000000001' and job.status='queued';
update public.deletion_jobs set requested_at=pg_catalog.now()-interval '2 days',
  execute_after=pg_catalog.now()-interval '1 day'
where id=(select value::uuid from srs_fixture where name='deletion_job');
set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select value::uuid from srs_fixture where name='deletion_job'),
    'ae000000-0000-4000-8000-000000000001'
  ) is not null,
  'account deletion completes while retaining pseudonymous immutable review evidence'
);
reset role;
select is((select count(*)::integer from public.review_logs),1,'account deletion retains immutable review history');
select is((select count(*)::integer from public.card_schedules),3,'account deletion retains replayable pseudonymous schedules');
select ok((select bool_and(device_id is null) from public.review_logs),'deleted devices are detached from retained review evidence');
select is((select details from public.study_content_reports limit 1),null,'account deletion removes private report text');
select ok((select bool_and(snapshot->>'name'='Deleted preset') from public.srs_preset_versions),'account deletion minimizes names in preset history');
select ok((select bool_and(timezone='UTC' and queue_seed like 'deleted-%') from public.study_sessions),'account deletion minimizes temporary session context');
select ok((select bool_and(not active and deleted_at is not null) from public.cards where note_id='96000000-0000-4000-8000-000000000001'),'retained schedules no longer make deleted content reviewable');

select * from finish();
rollback;
