begin;

select no_plan();

create temporary table content_deletion_fixture_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on content_deletion_fixture_ids
to anon, authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '91000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'delete-content@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
  pg_catalog.now(), pg_catalog.now(), false
);

update public.profiles
set display_name = 'Delete Content Owner',
    handle = 'delete_content_owner',
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id = '91000000-0000-0000-0000-000000000001';

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
);

insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values (
  '93000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'Deletion test browser', 'pgTAP',
  '94000000-0000-0000-0000-000000000001'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"92000000-0000-0000-0000-000000000001"}';

insert into content_deletion_fixture_ids (name, id)
select 'folder', folder.id
from public.current_create_folder(
  'Private medical study', null,
  '95000000-0000-0000-0000-000000000001'
) as folder;

insert into content_deletion_fixture_ids (name, id)
select 'custom_note_type', note_type.id
from public.current_create_note_type(
  'Private custom template',
  'Contains content that must be erased',
  '[
    {"fieldKey":"Prompt","label":"Private prompt","fieldType":"rich_text","position":0,"required":true},
    {"fieldKey":"Extra","label":"Private extra","fieldType":"rich_text","position":1,"required":false}
  ]'::jsonb,
  '[{
    "templateKey":"private_template","name":"Private template",
    "ordinal":0,"frontTemplate":"{{Prompt}}","backTemplate":"{{Extra}}",
    "generationCondition":{"field":"Extra","when":"empty"}
  }]'::jsonb,
  '95000000-0000-0000-0000-000000000002'
) as note_type;

select is(
  (
    select template.generation_condition
    from public.card_templates as template
    where template.note_type_id = (
      select id from content_deletion_fixture_ids where name = 'custom_note_type'
    )
  ),
  'empty:Extra',
  'custom generation-condition objects normalize into the bounded database form'
);

insert into content_deletion_fixture_ids (name, id)
select 'deck', deck.id
from public.current_create_deck(
  'Private diagnosis notes',
  '{"schemaVersion":1,"type":"doc","content":[],"plainText":"Sensitive deck description"}'::jsonb,
  (select id from content_deletion_fixture_ids where name = 'folder'),
  'private',
  '95000000-0000-0000-0000-000000000003'
) as deck;

select lives_ok(
  $$
    select public.current_upsert_note_definition_with_media(
      (select id from content_deletion_fixture_ids where name = 'deck'),
      '96000000-0000-0000-0000-000000000001',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Private symptom","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Private diagnosis","position":1}
      }'::jsonb,
      '{
        "authoringData":{"kind":"basic","private":"must disappear"},
        "sourceReference":"Private clinician note",
        "sourceReferences":[{
          "semanticKey":"private-source","citationDoc":{"schemaVersion":1},
          "title":"Private title","author":"Private author",
          "url":"https://example.test/private","position":0
        }]
      }'::jsonb,
      array['Private tag']::text[],
      '[]'::jsonb,
      '95000000-0000-0000-0000-000000000004'
    )
  $$,
  'owner content exists before account deletion'
);

select lives_ok(
  $$
    select public.current_upsert_note_definition_with_media(
      (select id from content_deletion_fixture_ids where name = 'deck'),
      '96000000-0000-0000-0000-000000000001',
      'basic', 1,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Updated private symptom","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Updated private diagnosis","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"basic","private":"updated secret"}}'::jsonb,
      array['Private tag']::text[],
      '[]'::jsonb,
      '95000000-0000-0000-0000-000000000005'
    )
  $$,
  'a revision snapshot exists before account deletion'
);

insert into content_deletion_fixture_ids (name, id)
select 'media', asset.id
from public.current_register_media_asset(
  repeat('b', 64), 'image/png', 'image', 2048, 40, 40, null,
  'Private scan description',
  '95000000-0000-0000-0000-000000000006'
) as asset;
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_finalize_media_asset(
      '91000000-0000-0000-0000-000000000001',
      (select id from content_deletion_fixture_ids where name = 'media'),
      repeat('b', 64), 'image/png', true,
      '95000000-0000-0000-0000-000000000007'
    )
  $$,
  'service verification makes the deletion fixture media ready'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"92000000-0000-0000-0000-000000000001"}';
reset role;
select lives_ok(
  $$
    select public.current_link_media(
      (select id from content_deletion_fixture_ids where name = 'media'),
      'deck', (select id from content_deletion_fixture_ids where name = 'deck'),
      'attachment', 0, 'Private scan description',
      '95000000-0000-0000-0000-000000000008'
    )
  $$,
  'trusted atomic-wrapper internals create the private media reference fixture'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"92000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$
    select public.current_publish_deck(
      (select id from content_deletion_fixture_ids where name = 'deck'),
      (select version from public.decks where id = (select id from content_deletion_fixture_ids where name = 'deck')),
      'public',
      '95000000-0000-0000-0000-000000000009'
    )
  $$,
  'a frozen publication exists before deletion'
);
reset role;

select is(
  (select count(*)::integer from public.deck_publications),
  1,
  'the deletion fixture starts with a discoverable publication'
);
select is(
  (select count(*)::integer from public.note_revisions
    where deck_id = (select id from content_deletion_fixture_ids where name = 'deck')),
  1,
  'the deletion fixture starts with one immutable note revision'
);
select throws_ok(
  $$
    update public.profiles
    set account_status = 'deleted',
        auth_subject_id = null,
        deletion_tombstone_id = '97000000-0000-0000-0000-000000000001',
        deleted_at = pg_catalog.now()
    where id = '91000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'content deletion requires the due deletion worker',
  'a direct profile status flip cannot bypass the account-deletion transaction'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '91000000-0000-0000-0000-000000000001',
      'account_deletion',
      pg_catalog.decode(pg_catalog.repeat('51', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '95000000-0000-0000-0000-000000000010'
    );
    select public.admin_request_account_deletion(
      '91000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('51', 32), 'hex'),
      1,
      '95000000-0000-0000-0000-000000000011'
    );
  $$,
  'a reauthenticated deletion request queues the account worker'
);
reset role;

insert into content_deletion_fixture_ids (name, id)
select 'deletion_job', job.id
from public.deletion_jobs as job
where job.account_id = '91000000-0000-0000-0000-000000000001'
  and job.status = 'queued';

update public.deletion_jobs
set requested_at = pg_catalog.now() - interval '2 days',
    execute_after = pg_catalog.now() - interval '1 day'
where id = (select id from content_deletion_fixture_ids where name = 'deletion_job');

set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select id from content_deletion_fixture_ids where name = 'deletion_job'),
    '95000000-0000-0000-0000-000000000012'
  ) is not null,
  'the due account-deletion worker completes with Phase 02 content present'
);
reset role;

select ok(
  (
    select status = 'deleted'
      and title not like '%diagnosis%'
      and description_plain = ''
      and description_doc = '{}'::jsonb
      and visibility = 'private'
      and published_version is null
      and deleted_at is not null
    from public.decks
    where id = (select id from content_deletion_fixture_ids where name = 'deck')
  ),
  'owned deck identity remains as a minimized deleted tombstone'
);
select ok(
  (
    select deleted_at is not null
      and sort_text = ''
      and source_reference is null
      and metadata = '{}'::jsonb
      and card_payload = '{}'::jsonb
    from public.notes
    where id = '96000000-0000-0000-0000-000000000001'
  ),
  'owned note content and source metadata are erased'
);
select is(
  (
    select count(*)::integer
    from public.note_field_values
    where note_id = '96000000-0000-0000-0000-000000000001'
      and (plain_text <> '' or normalized_text <> '' or value_doc <> '{}'::jsonb)
  ),
  0,
  'rich field values no longer retain authored text'
);
select ok(
  (
    select not active and deleted_at is not null
      and generation_key like 'g1:deleted:%'
    from public.cards
    where note_id = '96000000-0000-0000-0000-000000000001'
  ),
  'generated card identities are retired without retaining semantic keys'
);
select is(
  (select count(*)::integer from public.deck_publications),
  0,
  'account deletion withdraws the frozen public projection'
);
select ok(
  (
    select status = 'deleting'
      and reference_count = 0
      and alt_text is null
      and metadata = '{}'::jsonb
      and delete_after <= pg_catalog.now()
    from public.media_assets
    where id = (select id from content_deletion_fixture_ids where name = 'media')
  ),
  'owned media is detached, minimized, and queued for physical deletion'
);
select is(
  (
    select count(*)::integer
    from public.deck_versions
    where deck_id = (select id from content_deletion_fixture_ids where name = 'deck')
      and (
        deck_snapshot <> '{"deleted":true}'::jsonb
        or content_snapshot <> '{"schemaVersion":1,"notes":[]}'::jsonb
      )
  ),
  0,
  'deck history coordinates remain while authored snapshots are redacted'
);
select is(
  (
    select count(*)::integer
    from public.note_revisions
    where deck_id = (select id from content_deletion_fixture_ids where name = 'deck')
      and (
        note_snapshot <> '{"deleted":true}'::jsonb
        or fields_snapshot <> '[]'::jsonb
        or card_payload_snapshot <> '{}'::jsonb
      )
  ),
  0,
  'note revision coordinates remain while authored snapshots are redacted'
);
select ok(
  (
    select deleted_at is not null
      and display_name = 'Deleted note type'
      and description = ''
    from public.note_types
    where id = (select id from content_deletion_fixture_ids where name = 'custom_note_type')
  ),
  'owned custom note types are minimized and retired'
);
select is(
  (select count(*)::integer from private.content_mutation_receipts
    where account_id = '91000000-0000-0000-0000-000000000001'),
  0,
  'private mutation receipts containing response projections are erased'
);
select is(
  (select count(*)::integer from public.audit_events
    where actor_account_id = '91000000-0000-0000-0000-000000000001'
      and event_type = 'privacy.account_deletion_completed'),
  1,
  'the append-only account-deletion audit fact is preserved'
);

set local role service_role;
insert into content_deletion_fixture_ids (name, id)
select 'replayed_tombstone', public.admin_process_account_deletion(
    (select id from content_deletion_fixture_ids where name = 'deletion_job'),
    '95000000-0000-0000-0000-000000000012'
  );
reset role;
select is(
  (select id from content_deletion_fixture_ids where name = 'replayed_tombstone'),
  (select account_tombstone_id from public.deletion_jobs
    where id = (select id from content_deletion_fixture_ids where name = 'deletion_job')),
  'account deletion remains idempotent after content cleanup'
);

select * from finish();
rollback;
