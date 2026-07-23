begin;

select no_plan();

select has_table('public','practice_sessions','practice sessions exist');
select has_table('public','practice_session_items','practice session items exist');
select has_table('public','practice_attempts','practice attempts exist');
select has_table('public','concept_mastery','learner-private mastery exists');
select has_table('public','accepted_answer_rules','accepted-answer rules exist');
select has_table('public','answer_overrides','audited answer overrides exist');
select has_table('public','practice_srs_qualifications','explicit practice-to-SRS links exist');
select has_table('public','learning_goals','learning goals exist');
select has_table('public','exam_plans','exam plans exist');
select has_table('public','practice_test_definitions','practice-test definitions exist');
select has_table('public','practice_test_attempts','practice-test attempts exist');
select has_table('public','practice_test_responses','practice-test responses exist');
select has_table('public','personal_bests','personal bests exist');
select has_table('public','practice_mode_preferences','versioned mode preferences exist');
select has_table('public','product_guide_progress','versioned guide progress exists');

select ok(
  not exists(
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in (
        'practice_sessions','practice_session_items','practice_attempts','concept_mastery',
        'accepted_answer_rules','answer_overrides','practice_srs_qualifications','learning_goals',
        'exam_plans','practice_test_definitions','practice_test_attempts','practice_test_responses',
        'personal_bests','practice_mode_preferences','product_guide_progress'
      ) and not relation.relrowsecurity
  ),
  'RLS is enabled on every Phase 04 table'
);
select ok(
  not pg_catalog.has_table_privilege('anon','public.practice_attempts','select')
  and not pg_catalog.has_table_privilege('anon','public.concept_mastery','select')
  and not pg_catalog.has_table_privilege('anon','public.product_guide_progress','select')
  and not pg_catalog.has_table_privilege('service_role','public.practice_attempts','select')
  and not pg_catalog.has_table_privilege('service_role','public.concept_mastery','select'),
  'anonymous and direct service-role table reads are denied'
);
select ok(
  pg_catalog.has_table_privilege('authenticated','public.practice_attempts','select')
  and pg_catalog.has_table_privilege('authenticated','public.concept_mastery','select')
  and not pg_catalog.has_table_privilege('authenticated','public.practice_attempts','insert')
  and not pg_catalog.has_table_privilege('authenticated','public.concept_mastery','update'),
  'authenticated callers receive RLS reads but no direct practice writes'
);
select ok(
  not exists(
    select 1 from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.proname in (
        'admin_create_practice_session','admin_control_practice_session',
        'admin_record_practice_attempt','admin_record_answer_override',
        'admin_link_practice_srs_qualification','admin_upsert_accepted_answer_rules',
        'admin_upsert_practice_mode_preference','admin_upsert_product_guide_progress',
        'admin_upsert_learning_goal','admin_upsert_exam_plan',
        'admin_upsert_practice_test_definition','admin_create_practice_test_attempt',
        'admin_record_practice_test_response','admin_record_personal_best'
      ) and (
        not procedure.prosecdef
        or procedure.proconfig @> array['search_path=""']::text[] is not true
        or pg_catalog.has_function_privilege('authenticated',procedure.oid,'execute')
        or not pg_catalog.has_function_privilege('service_role',procedure.oid,'execute')
      )
  ),
  'every Phase 04 mutation RPC is service-only, security-definer, and has an empty search path'
);
select ok(
  exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.answer_overrides'::regclass and tgname='answer_overrides_append_only')
  and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.practice_srs_qualifications'::regclass and tgname='practice_srs_qualifications_append_only')
  and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.practice_test_responses'::regclass and tgname='practice_test_responses_append_only'),
  'override, qualification, and test-response evidence is append-only'
);
select ok(
  exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='practice_sessions_resume_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='practice_attempts_learner_card_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='concept_mastery_weak_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='product_guide_progress_version_idx'),
  'resume, mastery, attempts, and guide query paths have supporting indexes'
);

create temporary table phase04_fixture (name text primary key,value text not null) on commit drop;
grant select,insert,update,delete on phase04_fixture to authenticated,service_role;

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'phase04-owner@example.test','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now(),false),
  ('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'phase04-attacker@example.test','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now(),false);
update public.profiles set account_status='active',onboarding_completed_at=pg_catalog.now(),age_band='adult',
  display_name=case when id='d1000000-0000-4000-8000-000000000001' then 'Phase Owner' else 'Phase Attacker' end,
  handle=case when id='d1000000-0000-4000-8000-000000000001' then 'phase04_owner' else 'phase04_attacker' end
where id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002');
insert into auth.sessions (id,user_id,created_at,updated_at,not_after) values
  ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour'),
  ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002',pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour');
insert into public.devices (id,account_id,auth_session_id,display_name,platform,idempotency_key) values
  ('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Phase browser','pgTAP','d4000000-0000-4000-8000-000000000001'),
  ('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','Attacker browser','pgTAP','d4000000-0000-4000-8000-000000000002');
insert into phase04_fixture values
  ('owner_learner',(select id::text from public.learner_profiles where owner_account_id='d1000000-0000-4000-8000-000000000001' and kind='self')),
  ('attacker_learner',(select id::text from public.learner_profiles where owner_account_id='d1000000-0000-4000-8000-000000000002' and kind='self')),
  ('occurred_at',pg_catalog.clock_timestamp()::text);

insert into public.decks (id,owner_account_id,title,slug,default_note_type_id,content_hash) values (
  'd5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
  'Phase 04 biology','phase-04-biology','02000000-0000-4000-8000-000000000001',repeat('1',64)
);
insert into public.notes (id,deck_id,note_type_id,created_by,updated_by,content_hash,sort_text) values (
  'd6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
  '02000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',repeat('2',64),'What produces ATP?'
);
insert into public.cards (id,note_id,template_id,ordinal,card_kind,generation_key,content_version,active) values (
  'd7000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001',
  (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
  0,'basic','forward',1,true
);

set local role service_role;
select is(
  public.admin_upsert_accepted_answer_rules(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'d8000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001',
    1,'{"aliases":["powerhouse"]}'::jsonb,0
  )->>'version','1','deck editors can store versioned deterministic answer rules'
);
select is(
  public.admin_create_practice_session(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'d9000000-0000-4000-8000-000000000001','learn',1,
    '{"targetCount":1,"rescheduling":false}'::jsonb,'{"deckIds":["d5000000-0000-4000-8000-000000000001"]}'::jsonb,
    'phase04-seed',repeat('3',64),(select value::timestamptz from phase04_fixture where name='occurred_at'),
    '[{"cardId":"d7000000-0000-4000-8000-000000000001","position":0,"questionLevel":"free_recall","questionKind":"typed","seedFragment":"item-0"}]'::jsonb
  )->>'duplicate','false','a trusted service creates a resumable seeded practice session'
);
select is(
  public.admin_create_practice_session(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'d9000000-0000-4000-8000-000000000001','learn',1,
    '{"targetCount":1,"rescheduling":false}'::jsonb,'{"deckIds":["d5000000-0000-4000-8000-000000000001"]}'::jsonb,
    'phase04-seed',repeat('3',64),(select value::timestamptz from phase04_fixture where name='occurred_at'),
    '[{"cardId":"d7000000-0000-4000-8000-000000000001","position":0,"questionLevel":"free_recall","questionKind":"typed","seedFragment":"item-0"}]'::jsonb
  )->>'duplicate','true','an exact practice-session retry is idempotent'
);
select throws_ok(
  $$select public.admin_create_practice_session(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'d9000000-0000-4000-8000-000000000001','learn',1,'{}','{}','phase04-seed',repeat('4',64),
    (select value::timestamptz from phase04_fixture where name='occurred_at'),
    '[{"cardId":"d7000000-0000-4000-8000-000000000001","position":0,"questionLevel":"free_recall","questionKind":"typed","seedFragment":"item-0"}]')$$,
  '22023','practice session id was reused','changed practice-session input is rejected'
);

select is(
  public.admin_record_practice_attempt(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'da000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001',0,
    'db000000-0000-4000-8000-000000000001',repeat('5',64),'typed',1,'correct',1,'exact',
    'The response matches.','minimized_text','mitochondria',repeat('6',64),0,false,0,1200,1,1,'good',
    (select value::timestamptz from phase04_fixture where name='occurred_at'),0,
    jsonb_build_object('recognition',0.05,'recall',0.24,'overall',0.1735,'stage','introduced',
      'evidenceCount',1,'spacedRecallSuccesses',1,'lastEvidenceAt',(select value from phase04_fixture where name='occurred_at'),
      'contentVersion',1),true
  )->>'qualificationStatus','eligible','unaided free recall is transparently marked eligible without touching SRS'
);
reset role;

select is((select count(*)::integer from public.practice_attempts),1,'ordinary practice appends one distinct attempt');
select is((select evidence_count from public.concept_mastery),1,'ordinary practice updates recalculable mastery');
select is((select count(*)::integer from public.review_logs),0,'ordinary practice creates no canonical review log');
select is((select count(*)::integer from public.card_schedules),0,'ordinary practice creates no canonical schedule');
select is((select status::text from public.practice_sessions where id='d9000000-0000-4000-8000-000000000001'),'completed','the final item completes the practice session');

set local role service_role;
select is(
  public.admin_record_practice_attempt(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'da000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001',0,
    'db000000-0000-4000-8000-000000000001',repeat('5',64),'typed',1,'correct',1,'exact',
    'The response matches.','minimized_text','mitochondria',repeat('6',64),0,false,0,1200,1,1,'good',
    (select value::timestamptz from phase04_fixture where name='occurred_at'),0,
    jsonb_build_object('recognition',0.05,'recall',0.24,'overall',0.1735,'stage','introduced',
      'evidenceCount',1,'spacedRecallSuccesses',1,'lastEvidenceAt',(select value from phase04_fixture where name='occurred_at'),
      'contentVersion',1),true
  )->>'duplicate','true','an exact practice-attempt retry returns the original result'
);
select is(
  public.admin_record_answer_override(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'dc000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',
    'incorrect','learner_incorrect'
  )->>'duplicate','false','a learner override is appended as separate audit evidence'
);
select is(
  public.admin_upsert_practice_mode_preference(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'learn',1,'{"strictness":"moderate"}'::jsonb,0
  )->>'version','1','mode preferences are learner-private and versioned'
);
select is(
  public.admin_upsert_product_guide_progress(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'dd000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    'getting-started',1,'in_progress',2,1,'{}'::jsonb,pg_catalog.now()
  )->>'currentStep','2','guide progress persists the minimum resumable step state'
);
select is(
  public.admin_upsert_product_guide_progress(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'de000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    'getting-started',1,'dismissed',2,1,'{}'::jsonb,pg_catalog.now()
  )->>'status','dismissed','guide dismissal persists for the exact guide version'
);
select is(
  public.admin_upsert_product_guide_progress(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'df000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    'getting-started',1,'in_progress',0,1,'{}'::jsonb,pg_catalog.now()
  )->>'status','in_progress','an explicit restart reopens the same versioned guide'
);

select is(
  public.admin_upsert_learning_goal(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e0000000-0000-4000-8000-000000000001','Reach 80% mastery','mastery',
    '{"threshold":0.8}'::jsonb,'{"current":0.17}'::jsonb,'active',0,pg_catalog.now()
  )->>'version','1','a real mastery goal is stored through the trusted boundary'
);
select is(
  public.admin_upsert_exam_plan(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e1000000-0000-4000-8000-000000000001','Biology exam',pg_catalog.now()+interval '7 days',
    'America/Chicago','{"deckIds":["d5000000-0000-4000-8000-000000000001"]}'::jsonb,
    '{"minutesPerDay":20}'::jsonb,'{"days":7,"feasible":true}'::jsonb,1,'active',0,pg_catalog.now()
  )->>'version','1','an exam plan stores explicit assumptions and calculated work'
);
select is(
  public.admin_upsert_practice_test_definition(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e2000000-0000-4000-8000-000000000001','Biology check',1,
    '{"questionCount":1,"questionTypes":["written"]}'::jsonb,0,pg_catalog.now()
  )->>'version','1','practice-test definitions are versioned JSON'
);
select is(
  public.admin_create_practice_test_attempt(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',
    null,'test-seed-1',1,1,pg_catalog.now()
  )->>'duplicate','false','a practice-test attempt is independently resumable'
);
select is(
  public.admin_record_practice_test_response(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',0,'written','partial',0.5,1,null,pg_catalog.now()
  )->>'status','completed','the final immutable response completes and scores the practice test'
);
select is(
  public.admin_record_personal_best(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'learn',repeat('7',64),'accuracy',1,true,'d9000000-0000-4000-8000-000000000001',null,pg_catalog.now()
  )->>'improved','true','a completed real session can establish a personal best'
);
reset role;

select throws_ok(
  $$update public.answer_overrides set reason_code='answer_key_issue' where id='dc000000-0000-4000-8000-000000000001'$$,
  '55000','practice evidence is append-only','answer overrides cannot be rewritten'
);
select throws_ok(
  $$update public.practice_test_responses set awarded_points=1 where id='e4000000-0000-4000-8000-000000000001'$$,
  '55000','practice evidence is append-only','test responses cannot be rewritten'
);

insert into public.concept_mastery (
  learner_profile_id,card_id,recognition,recall,overall,stage,evidence_count,
  spaced_recall_successes,content_version
) values (
  (select value::uuid from phase04_fixture where name='attacker_learner'),
  'd7000000-0000-4000-8000-000000000001',0.4,0.2,0.27,'recognition',2,0,1
);

set local role authenticated;
set local "request.jwt.claims"='{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d2000000-0000-4000-8000-000000000001"}';
select is((select count(*)::integer from public.practice_attempts),1,'the learner can read only their practice attempts');
select is((select count(*)::integer from public.concept_mastery),1,'a deck owner cannot read another learner profile mastery row');
select is((select count(*)::integer from public.product_guide_progress),1,'the account can read only its guide progress');
select throws_ok(
  $$insert into public.concept_mastery (learner_profile_id,card_id,content_version) values (
    (select value::uuid from phase04_fixture where name='owner_learner'),'d7000000-0000-4000-8000-000000000001',1
  )$$,
  '42501',null,'the browser cannot mutate mastery directly'
);
reset role;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"d2000000-0000-4000-8000-000000000002"}';
select is((select count(*)::integer from public.practice_attempts),0,'another account cannot read practice attempts');
select is((select count(*)::integer from public.product_guide_progress),0,'another account cannot read guide progress');
reset role;

insert into public.srs_presets (id,learner_profile_id,name,is_default) values (
  'e5000000-0000-4000-8000-000000000001',
  (select value::uuid from phase04_fixture where name='owner_learner'),'Qualification preset',true
);
insert into public.review_logs (
  id,learner_profile_id,card_id,deck_id,actor_account_id,device_id,idempotency_key,command_hash,
  rating,reviewed_at,duration_ms,timezone,study_day_start,study_day,source,
  schedule_version_before,schedule_version_after,scheduler_version,preset_id,preset_version,
  content_version,schedule_before,schedule_after
) values (
  'e6000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  'd7000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001',repeat('8',64),'good',pg_catalog.now(),1200,'America/Chicago',240,
  current_date,'today',0,1,'phase04-test','e5000000-0000-4000-8000-000000000001',1,1,'{}','{}'
);
set local role service_role;
select is(
  public.admin_link_practice_srs_qualification(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'e8000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001','good',pg_catalog.clock_timestamp()
  )->>'duplicate','false','explicit acceptance links an eligible practice attempt to an existing canonical review'
);
reset role;
select is((select qualification_status::text from public.practice_attempts where id='da000000-0000-4000-8000-000000000001'),'qualified','qualification status becomes explicit only after the verified link');
select is((select count(*)::integer from public.practice_srs_qualifications),1,'one immutable practice-to-review link is retained');

set local role service_role;
select public.admin_create_practice_session(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  null,'eb000000-0000-4000-8000-000000000001','test',1,
  '{"targetCount":1,"rescheduling":false,"testAttemptId":"ed000000-0000-4000-8000-000000000001"}'::jsonb,
  '{"deckIds":["d5000000-0000-4000-8000-000000000001"]}'::jsonb,
  'test-session-seed',repeat('9',64),pg_catalog.clock_timestamp(),
  '[{"cardId":"d7000000-0000-4000-8000-000000000001","position":0,"questionLevel":"free_recall","questionKind":"typed","seedFragment":"test-item"}]'::jsonb
);
select public.admin_upsert_practice_test_definition(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  null,'ec000000-0000-4000-8000-000000000001','Atomic test',1,'{"questionCount":1}'::jsonb,
  0,pg_catalog.clock_timestamp()
);
select public.admin_create_practice_test_attempt(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  null,'ed000000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000001','atomic-test-seed',1,1,pg_catalog.clock_timestamp()
);
select is(
  public.admin_record_practice_attempt(
    'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
    null,'ee000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001',0,
    'ef000000-0000-4000-8000-000000000001',repeat('a',64),'typed',1,'correct',1,'exact',
    'The response matches.','minimized_text','complete answer',repeat('b',64),0,false,0,900,1,1,null,
    pg_catalog.clock_timestamp(),1,
    jsonb_build_object('recognition',0.08,'recall',0.30,'overall',0.223,'stage','guided_recall',
      'evidenceCount',2,'spacedRecallSuccesses',1,'lastEvidenceAt',pg_catalog.clock_timestamp(),'contentVersion',1),true
  )->>'qualificationStatus','not_eligible','an unaided Test response remains practice-only by mode'
);
reset role;
select is((select status::text from public.practice_test_attempts where id='ed000000-0000-4000-8000-000000000001'),'completed','the practice attempt atomically completes its stored test attempt');
select is((select count(*)::integer from public.practice_test_responses where practice_test_attempt_id='ed000000-0000-4000-8000-000000000001'),1,'one immutable scored response is linked to the practice attempt');

set local role service_role;
select public.admin_create_practice_session(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  null,'f0000000-0000-4000-8000-000000000001','match',1,'{"targetCount":1}'::jsonb,
  '{"deckIds":["d5000000-0000-4000-8000-000000000001"]}'::jsonb,
  'match-session-seed',repeat('c',64),pg_catalog.clock_timestamp(),
  '[{"cardId":"d7000000-0000-4000-8000-000000000001","position":0,"questionLevel":"recognition","questionKind":"match","seedFragment":"match-item"}]'::jsonb
);
select public.admin_record_practice_attempt(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',(select value::uuid from phase04_fixture where name='owner_learner'),
  null,'f1000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001',0,
  'f2000000-0000-4000-8000-000000000001',repeat('d',64),'match',1,'correct',1,'exact',
  'The pair matches.','discarded',null,null,0,false,0,700,null,1,null,pg_catalog.clock_timestamp(),2,
  jsonb_build_object('recognition',0.18,'recall',0.32,'overall',0.271,'stage','guided_recall',
    'evidenceCount',3,'spacedRecallSuccesses',1,'lastEvidenceAt',pg_catalog.clock_timestamp(),'contentVersion',1),true
);
reset role;
select is((select count(*)::integer from public.personal_bests where mode='match' and metric='completion_ms'),1,'a completed seeded Match round records one scope-specific personal best atomically');

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      'd1000000-0000-4000-8000-000000000001','account_deletion',
      pg_catalog.decode(pg_catalog.repeat('81',32),'hex'),pg_catalog.now()+interval '5 minutes',
      'e9000000-0000-4000-8000-000000000001'
    );
    select public.admin_request_account_deletion(
      'd1000000-0000-4000-8000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('81',32),'hex'),1,
      'ea000000-0000-4000-8000-000000000001'
    );
  $$,
  'a reauthenticated deletion request accepts Phase 04 learner data'
);
reset role;
insert into phase04_fixture (name,value)
select 'deletion_job',job.id::text from public.deletion_jobs as job
where job.account_id='d1000000-0000-4000-8000-000000000001' and job.status='queued';
update public.deletion_jobs set requested_at=pg_catalog.now()-interval '2 days',
  execute_after=pg_catalog.now()-interval '1 day'
where id=(select value::uuid from phase04_fixture where name='deletion_job');
set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select value::uuid from phase04_fixture where name='deletion_job'),
    'eb000000-0000-4000-8000-000000000001'
  ) is not null,
  'the established account-deletion worker completes with Phase 04 data'
);
reset role;
select ok(
  (select retention='discarded' and response_text is null and response_hash is null
   from public.practice_attempts where id='da000000-0000-4000-8000-000000000001'),
  'account deletion removes retained practice answers'
);
select ok(
  (select config='{}'::jsonb and scope='{}'::jsonb and queue_seed like 'deleted-%'
   from public.practice_sessions where id='d9000000-0000-4000-8000-000000000001'),
  'account deletion minimizes practice-session configuration'
);
select ok(
  (select rules='{}'::jsonb and deleted_at is not null
   from public.accepted_answer_rules where id='d8000000-0000-4000-8000-000000000001'),
  'account deletion minimizes creator-authored answer rules'
);
select ok(
  (select metadata='{}'::jsonb from public.product_guide_progress where guide_key='getting-started'),
  'account deletion minimizes guide metadata without inventing clickstream history'
);

select * from finish();
rollback;
