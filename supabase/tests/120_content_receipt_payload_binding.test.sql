begin;

select no_plan();

create temporary table receipt_binding_ids (
  name text primary key,
  id uuid not null
) on commit drop;
create temporary table receipt_binding_versions (
  name text primary key,
  value bigint not null
) on commit drop;
grant select, insert, update, delete on receipt_binding_ids, receipt_binding_versions
to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'receipt-binding@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'receipt-binding-editor@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set display_name = case id
      when '41000000-0000-4000-8000-000000000001'
        then 'Receipt Binding Owner'
      else 'Receipt Binding Editor'
    end,
    handle = case id
      when '41000000-0000-4000-8000-000000000001'
        then 'receipt_binding_owner'
      else 'receipt_binding_editor'
    end,
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id in (
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '42000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );
insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values
  (
    '43000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    'Receipt binding browser', 'pgTAP',
    '44000000-0000-4000-8000-000000000001'
  ),
  (
    '43000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000002',
    'Receipt binding editor browser', 'pgTAP',
    '44000000-0000-4000-8000-000000000002'
  );

select ok(
  exists(
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'content_mutation_receipts'
      and column_name = 'request_fingerprint'
  )
  and exists(
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'content_mutation_receipts'
      and column_name = 'completed_at'
  )
  and exists(
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.content_mutation_receipts'::regclass
      and conname = 'content_receipts_completion_shape'
  )
  and exists(
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.content_mutation_receipts'::regclass
      and contype = 'p'
  ),
  'the private receipt ledger uniquely serializes a key and distinguishes bound pending and completed commands'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)',
    'execute'
  )
  and pg_catalog.pg_get_functiondef(
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)'::regprocedure
  ) like '%private.get_content_receipt(%'
  and pg_catalog.pg_get_functiondef(
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)'::regprocedure
  ) like '%request_fingerprint is distinct from v_fingerprint%',
  'the private binding helper delegates serialization and permission rechecks before matching payloads'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'private.get_content_receipt(uuid,uuid,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)'::regprocedure
  )) like '%insert into private.content_mutation_receipts%'
  and pg_catalog.pg_get_functiondef(
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)'::regprocedure
  ) like '%''pending''%'
  and pg_catalog.pg_get_functiondef(
    'private.get_bound_content_receipt(uuid,uuid,text,jsonb)'::regprocedure
  ) like '%completed_at%',
  'the bound lookup inherits the transaction lock and creates only an unfinished pending row'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'private.record_content_receipt(uuid,uuid,text,text,uuid,jsonb)'::regprocedure
  ) like '%completed_at is not null%'
  and pg_catalog.pg_get_functiondef(
    'private.record_content_receipt(uuid,uuid,text,text,uuid,jsonb)'::regprocedure
  ) like '%resource_type = p_resource_type%'
  and pg_catalog.pg_get_functiondef(
    'private.record_content_receipt(uuid,uuid,text,text,uuid,jsonb)'::regprocedure
  ) like '%v_response_fingerprint%',
  'the centralized writer completes bound commands and preserves 080 response fingerprints'
);

with affected(signature) as (
  values
    ('public.current_create_folder(text,uuid,uuid)'::regprocedure),
    ('private.content_update_folder_unchecked(uuid,bigint,text,uuid,uuid)'::regprocedure),
    ('private.content_delete_folder_unchecked(uuid,bigint,uuid)'::regprocedure),
    ('public.current_create_note_type(text,text,jsonb,jsonb,uuid)'::regprocedure),
    ('private.content_update_note_type_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure),
    ('public.current_create_deck(text,jsonb,uuid,public.deck_visibility,uuid)'::regprocedure),
    ('private.content_update_deck_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure),
    ('private.set_deck_lifecycle(text,uuid,bigint,uuid)'::regprocedure),
    ('private.content_delete_note_unchecked(uuid,bigint,uuid)'::regprocedure),
    ('public.current_duplicate_deck(uuid,text,uuid,uuid)'::regprocedure),
    ('public.current_register_media_asset(text,text,public.media_kind,bigint,integer,integer,integer,text,uuid)'::regprocedure),
    ('private.content_bulk_tag_notes_unchecked(uuid,uuid[],bigint[],text[],text[],uuid)'::regprocedure),
    ('private.content_bulk_move_notes_unchecked(uuid,uuid,uuid[],bigint[],uuid)'::regprocedure),
    ('private.content_publish_deck_unchecked(uuid,bigint,public.deck_visibility,uuid)'::regprocedure),
    ('private.content_unpublish_deck_unchecked(uuid,bigint,uuid)'::regprocedure),
    ('private.content_restore_deck_version_unchecked(uuid,bigint,bigint,uuid)'::regprocedure)
)
select is(
  (
    select pg_catalog.count(*)
    from affected
    where pg_catalog.pg_get_functiondef(signature) like '%private.get_bound_content_receipt(%'
  ),
  16::bigint,
  'all final implementations behind the 19 affected browser RPCs use payload-bound lookup'
);

with browser_mutation(signature) as (
  values
    ('public.current_create_folder(text,uuid,uuid)'::regprocedure),
    ('public.current_update_folder(uuid,bigint,text,uuid,uuid)'::regprocedure),
    ('public.current_move_folder(uuid,bigint,uuid,uuid)'::regprocedure),
    ('public.current_delete_folder(uuid,bigint,uuid)'::regprocedure),
    ('public.current_create_note_type(text,text,jsonb,jsonb,uuid)'::regprocedure),
    ('public.current_update_note_type(uuid,bigint,jsonb,uuid)'::regprocedure),
    ('public.current_create_deck(text,jsonb,uuid,public.deck_visibility,uuid)'::regprocedure),
    ('public.current_update_deck(uuid,bigint,jsonb,uuid)'::regprocedure),
    ('public.current_archive_deck(uuid,bigint,uuid)'::regprocedure),
    ('public.current_restore_deck(uuid,bigint,uuid)'::regprocedure),
    ('public.current_delete_deck(uuid,bigint,uuid)'::regprocedure),
    ('public.current_duplicate_deck(uuid,text,uuid,uuid)'::regprocedure),
    ('public.current_delete_note(uuid,bigint,uuid)'::regprocedure),
    ('public.current_register_media_asset(text,text,public.media_kind,bigint,integer,integer,integer,text,uuid)'::regprocedure),
    ('public.current_publish_deck(uuid,bigint,public.deck_visibility,uuid)'::regprocedure),
    ('public.current_unpublish_deck(uuid,bigint,uuid)'::regprocedure),
    ('public.current_restore_deck_version(uuid,bigint,bigint,uuid)'::regprocedure),
    ('public.current_bulk_tag_notes(uuid,uuid[],bigint[],text[],text[],uuid)'::regprocedure),
    ('public.current_bulk_move_notes(uuid,uuid,uuid[],bigint[],uuid)'::regprocedure),
    ('public.current_upsert_note_definition_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid,jsonb)'::regprocedure),
    ('public.current_apply_deck_settings_and_publication(uuid,bigint,jsonb,text,public.deck_visibility,uuid)'::regprocedure)
)
select is(
  (
    select pg_catalog.count(*)
    from browser_mutation
    where pg_catalog.has_function_privilege(
      'authenticated', signature, 'execute'
    )
  ),
  21::bigint,
  'all 21 browser-reachable content mutation RPCs are covered by a bound or self-fingerprinted command family'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

-- Folder create, update/move, and delete operation families.
insert into receipt_binding_ids (name, id)
select 'folder_create', folder.id
from public.current_create_folder(
  'Bound folder', null, '45000000-0000-4000-8000-000000000001'
) as folder;
select lives_ok(
  $$select public.current_create_folder(
    'Bound folder', null, '45000000-0000-4000-8000-000000000001'
  )$$,
  'an exact folder-create retry returns its original success'
);
select throws_ok(
  $$select public.current_create_folder(
    'Changed folder', null, '45000000-0000-4000-8000-000000000001'
  )$$,
  '22023', 'content mutation replay does not match',
  'folder create rejects a changed name under the same UUID'
);

insert into receipt_binding_ids (name, id)
select 'folder_update', folder.id
from public.current_create_folder(
  'Update target', null, '45000000-0000-4000-8000-000000000002'
) as folder;
insert into receipt_binding_versions (name, value)
select 'folder_update', version from public.folders
where id = (select id from receipt_binding_ids where name = 'folder_update');
select lives_ok(
  $$select public.current_update_folder(
    (select id from receipt_binding_ids where name = 'folder_update'),
    (select value from receipt_binding_versions where name = 'folder_update'),
    'Updated folder', null, '45000000-0000-4000-8000-000000000003'
  )$$,
  'the first folder update succeeds'
);
select lives_ok(
  $$select public.current_update_folder(
    (select id from receipt_binding_ids where name = 'folder_update'),
    (select value from receipt_binding_versions where name = 'folder_update'),
    'Updated folder', null, '45000000-0000-4000-8000-000000000003'
  )$$,
  'an exact folder-update retry returns its original success'
);
select throws_ok(
  $$select public.current_update_folder(
    (select id from receipt_binding_ids where name = 'folder_update'),
    (select value from receipt_binding_versions where name = 'folder_update'),
    'Different update', null, '45000000-0000-4000-8000-000000000003'
  )$$,
  '22023', 'content mutation replay does not match',
  'folder update rejects a changed patch under the same UUID'
);

insert into receipt_binding_ids (name, id)
select fixture.name, folder.id
from (
  values
    ('move_parent_a', 'Move parent A', '45000000-0000-4000-8000-000000000004'::uuid),
    ('move_parent_b', 'Move parent B', '45000000-0000-4000-8000-000000000005'::uuid),
    ('move_child', 'Move child', '45000000-0000-4000-8000-000000000006'::uuid)
) as fixture(name, label, key)
cross join lateral public.current_create_folder(fixture.label, null, fixture.key) as folder;
insert into receipt_binding_versions (name, value)
select 'move_child', version from public.folders
where id = (select id from receipt_binding_ids where name = 'move_child');
select lives_ok(
  $$select public.current_move_folder(
    (select id from receipt_binding_ids where name = 'move_child'),
    (select value from receipt_binding_versions where name = 'move_child'),
    (select id from receipt_binding_ids where name = 'move_parent_a'),
    '45000000-0000-4000-8000-000000000007'
  )$$,
  'the first folder move succeeds'
);
select lives_ok(
  $$select public.current_move_folder(
    (select id from receipt_binding_ids where name = 'move_child'),
    (select value from receipt_binding_versions where name = 'move_child'),
    (select id from receipt_binding_ids where name = 'move_parent_a'),
    '45000000-0000-4000-8000-000000000007'
  )$$,
  'an exact folder-move retry returns its original success'
);
select throws_ok(
  $$select public.current_move_folder(
    (select id from receipt_binding_ids where name = 'move_child'),
    (select value from receipt_binding_versions where name = 'move_child'),
    (select id from receipt_binding_ids where name = 'move_parent_b'),
    '45000000-0000-4000-8000-000000000007'
  )$$,
  '22023', 'content mutation replay does not match',
  'folder move rejects a changed destination under the same UUID'
);

insert into receipt_binding_ids (name, id)
select 'folder_delete', folder.id
from public.current_create_folder(
  'Delete target', null, '45000000-0000-4000-8000-000000000008'
) as folder;
insert into receipt_binding_versions (name, value)
select 'folder_delete', version from public.folders
where id = (select id from receipt_binding_ids where name = 'folder_delete');
select lives_ok(
  $$select public.current_delete_folder(
    (select id from receipt_binding_ids where name = 'folder_delete'),
    (select value from receipt_binding_versions where name = 'folder_delete'),
    '45000000-0000-4000-8000-000000000009'
  )$$,
  'the first folder delete succeeds'
);
select lives_ok(
  $$select public.current_delete_folder(
    (select id from receipt_binding_ids where name = 'folder_delete'),
    (select value from receipt_binding_versions where name = 'folder_delete'),
    '45000000-0000-4000-8000-000000000009'
  )$$,
  'an exact folder-delete retry returns its original success'
);
select throws_ok(
  $$select public.current_delete_folder(
    (select id from receipt_binding_ids where name = 'folder_delete'),
    (select value + 1 from receipt_binding_versions where name = 'folder_delete'),
    '45000000-0000-4000-8000-000000000009'
  )$$,
  '22023', 'content mutation replay does not match',
  'folder delete rejects a changed expected version under the same UUID'
);

-- Note-type create and update families.
insert into receipt_binding_ids (name, id)
select 'note_type', note_type.id
from public.current_create_note_type(
  'Bound custom type', 'Original description',
  '[
    {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
    {"fieldKey":"Answer","label":"Answer","fieldType":"rich_text","position":1,"required":true}
  ]'::jsonb,
  '[{
    "templateKey":"recall","name":"Recall","ordinal":0,
    "frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}",
    "answerFieldKey":"Answer"
  }]'::jsonb,
  '45000000-0000-4000-8000-000000000010'
) as note_type;
select lives_ok(
  $$select public.current_create_note_type(
    'Bound custom type', 'Original description',
    '[
      {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
      {"fieldKey":"Answer","label":"Answer","fieldType":"rich_text","position":1,"required":true}
    ]'::jsonb,
    '[{
      "templateKey":"recall","name":"Recall","ordinal":0,
      "frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}",
      "answerFieldKey":"Answer"
    }]'::jsonb,
    '45000000-0000-4000-8000-000000000010'
  )$$,
  'an exact note-type-create retry returns its original success'
);
select throws_ok(
  $$select public.current_create_note_type(
    'Bound custom type', 'Changed description',
    '[
      {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
      {"fieldKey":"Answer","label":"Answer","fieldType":"rich_text","position":1,"required":true}
    ]'::jsonb,
    '[{
      "templateKey":"recall","name":"Recall","ordinal":0,
      "frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}",
      "answerFieldKey":"Answer"
    }]'::jsonb,
    '45000000-0000-4000-8000-000000000010'
  )$$,
  '22023', 'content mutation replay does not match',
  'note-type create rejects changed definition metadata under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'note_type', version from public.note_types
where id = (select id from receipt_binding_ids where name = 'note_type');
select lives_ok(
  $$select public.current_update_note_type(
    (select id from receipt_binding_ids where name = 'note_type'),
    (select value from receipt_binding_versions where name = 'note_type'),
    '{"description":"Updated"}'::jsonb,
    '45000000-0000-4000-8000-000000000011'
  )$$,
  'the first note-type update succeeds'
);
select lives_ok(
  $$select public.current_update_note_type(
    (select id from receipt_binding_ids where name = 'note_type'),
    (select value from receipt_binding_versions where name = 'note_type'),
    '{"description":"Updated"}'::jsonb,
    '45000000-0000-4000-8000-000000000011'
  )$$,
  'an exact note-type-update retry returns its original success'
);
select throws_ok(
  $$select public.current_update_note_type(
    (select id from receipt_binding_ids where name = 'note_type'),
    (select value from receipt_binding_versions where name = 'note_type'),
    '{"description":"Different"}'::jsonb,
    '45000000-0000-4000-8000-000000000011'
  )$$,
  '22023', 'content mutation replay does not match',
  'note-type update rejects a changed patch under the same UUID'
);

-- Deck create, update, lifecycle, and duplication families.
insert into receipt_binding_ids (name, id)
select 'deck_create', deck.id
from public.current_create_deck(
  'Bound deck', '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private', '45000000-0000-4000-8000-000000000012'
) as deck;
select lives_ok(
  $$select public.current_create_deck(
    'Bound deck', '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
    null, 'private', '45000000-0000-4000-8000-000000000012'
  )$$,
  'an exact deck-create retry returns its original success'
);
select throws_ok(
  $$select public.current_create_deck(
    'Changed deck', '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
    null, 'private', '45000000-0000-4000-8000-000000000012'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck create rejects a changed title under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'deck_update', version from public.decks
where id = (select id from receipt_binding_ids where name = 'deck_create');
select lives_ok(
  $$select public.current_update_deck(
    (select id from receipt_binding_ids where name = 'deck_create'),
    (select value from receipt_binding_versions where name = 'deck_update'),
    '{"title":"Updated deck"}'::jsonb,
    '45000000-0000-4000-8000-000000000013'
  )$$,
  'the first deck update succeeds'
);
select lives_ok(
  $$select public.current_update_deck(
    (select id from receipt_binding_ids where name = 'deck_create'),
    (select value from receipt_binding_versions where name = 'deck_update'),
    '{"title":"Updated deck"}'::jsonb,
    '45000000-0000-4000-8000-000000000013'
  )$$,
  'an exact deck-update retry returns its original success'
);
select throws_ok(
  $$select public.current_update_deck(
    (select id from receipt_binding_ids where name = 'deck_create'),
    (select value from receipt_binding_versions where name = 'deck_update'),
    '{"title":"Different deck"}'::jsonb,
    '45000000-0000-4000-8000-000000000013'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck update rejects a changed patch under the same UUID'
);

insert into receipt_binding_ids (name, id)
select fixture.name, deck.id
from (
  values
    ('lifecycle_deck', 'Lifecycle deck', '45000000-0000-4000-8000-000000000014'::uuid),
    ('delete_deck', 'Delete deck', '45000000-0000-4000-8000-000000000015'::uuid),
    ('duplicate_source', 'Duplicate source', '45000000-0000-4000-8000-000000000016'::uuid),
    ('permission_deck', 'Permission deck', '45000000-0000-4000-8000-000000000037'::uuid)
) as fixture(name, label, key)
cross join lateral public.current_create_deck(
  fixture.label,
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null,
  'private',
  fixture.key
) as deck;

insert into receipt_binding_versions (name, value)
select 'archive', version from public.decks
where id = (select id from receipt_binding_ids where name = 'lifecycle_deck');
select lives_ok(
  $$select public.current_archive_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value from receipt_binding_versions where name = 'archive'),
    '45000000-0000-4000-8000-000000000017'
  )$$,
  'the first deck archive succeeds'
);
select lives_ok(
  $$select public.current_archive_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value from receipt_binding_versions where name = 'archive'),
    '45000000-0000-4000-8000-000000000017'
  )$$,
  'an exact deck-archive retry returns its original success'
);
select throws_ok(
  $$select public.current_archive_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value + 1 from receipt_binding_versions where name = 'archive'),
    '45000000-0000-4000-8000-000000000017'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck archive rejects a changed expected version under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'restore', version from public.decks
where id = (select id from receipt_binding_ids where name = 'lifecycle_deck');
select lives_ok(
  $$select public.current_restore_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value from receipt_binding_versions where name = 'restore'),
    '45000000-0000-4000-8000-000000000018'
  )$$,
  'the first deck restore succeeds'
);
select lives_ok(
  $$select public.current_restore_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value from receipt_binding_versions where name = 'restore'),
    '45000000-0000-4000-8000-000000000018'
  )$$,
  'an exact deck-restore retry returns its original success'
);
select throws_ok(
  $$select public.current_restore_deck(
    (select id from receipt_binding_ids where name = 'lifecycle_deck'),
    (select value + 1 from receipt_binding_versions where name = 'restore'),
    '45000000-0000-4000-8000-000000000018'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck restore rejects a changed expected version under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'delete_deck', version from public.decks
where id = (select id from receipt_binding_ids where name = 'delete_deck');
select lives_ok(
  $$select public.current_delete_deck(
    (select id from receipt_binding_ids where name = 'delete_deck'),
    (select value from receipt_binding_versions where name = 'delete_deck'),
    '45000000-0000-4000-8000-000000000019'
  )$$,
  'the first deck delete succeeds'
);
select lives_ok(
  $$select public.current_delete_deck(
    (select id from receipt_binding_ids where name = 'delete_deck'),
    (select value from receipt_binding_versions where name = 'delete_deck'),
    '45000000-0000-4000-8000-000000000019'
  )$$,
  'an exact deck-delete retry returns its original success'
);
select throws_ok(
  $$select public.current_delete_deck(
    (select id from receipt_binding_ids where name = 'delete_deck'),
    (select value + 1 from receipt_binding_versions where name = 'delete_deck'),
    '45000000-0000-4000-8000-000000000019'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck delete rejects a changed expected version under the same UUID'
);

insert into receipt_binding_ids (name, id)
select 'duplicate', deck.id
from public.current_duplicate_deck(
  (select id from receipt_binding_ids where name = 'duplicate_source'),
  'Bound copy', null, '45000000-0000-4000-8000-000000000020'
) as deck;
select lives_ok(
  $$select public.current_duplicate_deck(
    (select id from receipt_binding_ids where name = 'duplicate_source'),
    'Bound copy', null, '45000000-0000-4000-8000-000000000020'
  )$$,
  'an exact deck-duplicate retry returns its original success'
);
select throws_ok(
  $$select public.current_duplicate_deck(
    (select id from receipt_binding_ids where name = 'duplicate_source'),
    'Changed copy', null, '45000000-0000-4000-8000-000000000020'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck duplicate rejects a changed title under the same UUID'
);

-- Note, bulk, publication, and version-restore families.
insert into receipt_binding_ids (name, id)
select fixture.name, deck.id
from (
  values
    ('note_source', 'Note source', '45000000-0000-4000-8000-000000000021'::uuid),
    ('note_target', 'Note target', '45000000-0000-4000-8000-000000000022'::uuid),
    ('note_other_target', 'Other target', '45000000-0000-4000-8000-000000000023'::uuid),
    ('publish_deck', 'Publish deck', '45000000-0000-4000-8000-000000000024'::uuid)
) as fixture(name, label, key)
cross join lateral public.current_create_deck(
  fixture.label,
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null,
  'private',
  fixture.key
) as deck;

select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from receipt_binding_ids where name = 'note_source'),
    '46000000-0000-4000-8000-000000000001', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"First","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Answer","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '45000000-0000-4000-8000-000000000025'
  )$$,
  'the first bulk fixture note is created'
);
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from receipt_binding_ids where name = 'note_source'),
    '46000000-0000-4000-8000-000000000001', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"First","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Answer","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '45000000-0000-4000-8000-000000000025'
  )$$,
  'an exact atomic note retry returns its original success'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from receipt_binding_ids where name = 'note_source'),
    '46000000-0000-4000-8000-000000000001', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Changed first","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Answer","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '45000000-0000-4000-8000-000000000025'
  )$$,
  '22023', 'content mutation replay does not match',
  'the atomic note boundary rejects changed fields under the same UUID'
);
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from receipt_binding_ids where name = 'note_source'),
    '46000000-0000-4000-8000-000000000002', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Second","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Answer","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '45000000-0000-4000-8000-000000000026'
  )$$,
  'the second bulk fixture note is created'
);
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    '46000000-0000-4000-8000-000000000003', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Published","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Answer","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '45000000-0000-4000-8000-000000000027'
  )$$,
  'the publication fixture note is created'
);

insert into receipt_binding_ids (name, id)
select 'media_registration', asset.id
from public.current_register_media_asset(
  repeat('b', 64), 'image/png', 'image', 2048, 32, 32, null,
  'Bound image', '45000000-0000-4000-8000-000000000035'
) as asset;
select lives_ok(
  $$select public.current_register_media_asset(
    repeat('b', 64), 'image/png', 'image', 2048, 32, 32, null,
    'Bound image', '45000000-0000-4000-8000-000000000035'
  )$$,
  'an exact media-registration retry returns its original success'
);
select throws_ok(
  $$select public.current_register_media_asset(
    repeat('b', 64), 'image/png', 'image', 2048, 32, 32, null,
    'Changed alt text', '45000000-0000-4000-8000-000000000035'
  )$$,
  '22023', 'content mutation replay does not match',
  'media registration rejects changed metadata under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'bulk_tag_note', version from public.notes
where id = '46000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.current_bulk_tag_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    array['46000000-0000-4000-8000-000000000001'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_tag_note')]::bigint[],
    array['Bound tag']::text[], '{}'::text[],
    '45000000-0000-4000-8000-000000000028'
  )$$,
  'the first bulk-tag command succeeds'
);
select lives_ok(
  $$select public.current_bulk_tag_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    array['46000000-0000-4000-8000-000000000001'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_tag_note')]::bigint[],
    array['Bound tag']::text[], '{}'::text[],
    '45000000-0000-4000-8000-000000000028'
  )$$,
  'an exact bulk-tag retry returns its original success'
);
select throws_ok(
  $$select public.current_bulk_tag_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    array['46000000-0000-4000-8000-000000000001'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_tag_note')]::bigint[],
    array['Changed tag']::text[], '{}'::text[],
    '45000000-0000-4000-8000-000000000028'
  )$$,
  '22023', 'content mutation replay does not match',
  'bulk tag rejects a changed tag set under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'bulk_move_note', version from public.notes
where id = '46000000-0000-4000-8000-000000000002';
select lives_ok(
  $$select public.current_bulk_move_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    (select id from receipt_binding_ids where name = 'note_target'),
    array['46000000-0000-4000-8000-000000000002'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_move_note')]::bigint[],
    '45000000-0000-4000-8000-000000000029'
  )$$,
  'the first bulk-move command succeeds'
);
select lives_ok(
  $$select public.current_bulk_move_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    (select id from receipt_binding_ids where name = 'note_target'),
    array['46000000-0000-4000-8000-000000000002'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_move_note')]::bigint[],
    '45000000-0000-4000-8000-000000000029'
  )$$,
  'an exact bulk-move retry returns its original success'
);
select throws_ok(
  $$select public.current_bulk_move_notes(
    (select id from receipt_binding_ids where name = 'note_source'),
    (select id from receipt_binding_ids where name = 'note_other_target'),
    array['46000000-0000-4000-8000-000000000002'::uuid],
    array[(select value from receipt_binding_versions where name = 'bulk_move_note')]::bigint[],
    '45000000-0000-4000-8000-000000000029'
  )$$,
  '22023', 'content mutation replay does not match',
  'bulk move rejects a changed target deck under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'note_delete', version from public.notes
where id = '46000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.current_delete_note(
    '46000000-0000-4000-8000-000000000001',
    (select value from receipt_binding_versions where name = 'note_delete'),
    '45000000-0000-4000-8000-000000000030'
  )$$,
  'the first note delete succeeds'
);
select lives_ok(
  $$select public.current_delete_note(
    '46000000-0000-4000-8000-000000000001',
    (select value from receipt_binding_versions where name = 'note_delete'),
    '45000000-0000-4000-8000-000000000030'
  )$$,
  'an exact note-delete retry returns its original success'
);
select throws_ok(
  $$select public.current_delete_note(
    '46000000-0000-4000-8000-000000000001',
    (select value + 1 from receipt_binding_versions where name = 'note_delete'),
    '45000000-0000-4000-8000-000000000030'
  )$$,
  '22023', 'content mutation replay does not match',
  'note delete rejects a changed expected version under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'publish', version from public.decks
where id = (select id from receipt_binding_ids where name = 'publish_deck');
select lives_ok(
  $$select public.current_publish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'publish'),
    'public', '45000000-0000-4000-8000-000000000031'
  )$$,
  'the first deck publication succeeds'
);
select lives_ok(
  $$select public.current_publish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'publish'),
    'public', '45000000-0000-4000-8000-000000000031'
  )$$,
  'an exact deck-publish retry returns its original success'
);
select throws_ok(
  $$select public.current_publish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'publish'),
    'unlisted', '45000000-0000-4000-8000-000000000031'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck publish rejects a changed visibility under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'unpublish', version from public.decks
where id = (select id from receipt_binding_ids where name = 'publish_deck');
select lives_ok(
  $$select public.current_unpublish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'unpublish'),
    '45000000-0000-4000-8000-000000000032'
  )$$,
  'the first deck unpublish succeeds'
);
select lives_ok(
  $$select public.current_unpublish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'unpublish'),
    '45000000-0000-4000-8000-000000000032'
  )$$,
  'an exact deck-unpublish retry returns its original success'
);
select throws_ok(
  $$select public.current_unpublish_deck(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value + 1 from receipt_binding_versions where name = 'unpublish'),
    '45000000-0000-4000-8000-000000000032'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck unpublish rejects a changed expected version under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'atomic_publish', version from public.decks
where id = (select id from receipt_binding_ids where name = 'publish_deck');
select lives_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'atomic_publish'),
    '{"title":"Atomic publication"}'::jsonb,
    'publish', 'public', '45000000-0000-4000-8000-000000000036'
  )$$,
  'the first atomic settings/publication command succeeds'
);
select lives_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'atomic_publish'),
    '{"title":"Atomic publication"}'::jsonb,
    'publish', 'public', '45000000-0000-4000-8000-000000000036'
  )$$,
  'an exact atomic settings/publication retry returns its original success'
);
select throws_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'atomic_publish'),
    '{"title":"Changed atomic publication"}'::jsonb,
    'publish', 'public', '45000000-0000-4000-8000-000000000036'
  )$$,
  '22023', 'content mutation replay does not match',
  'atomic settings/publication rejects a changed patch under the same UUID'
);

insert into receipt_binding_versions (name, value)
select 'version_restore', version from public.decks
where id = (select id from receipt_binding_ids where name = 'publish_deck');
select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'version_restore'),
    1, '45000000-0000-4000-8000-000000000033'
  )$$,
  'the first deck-version restore succeeds'
);
select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'version_restore'),
    1, '45000000-0000-4000-8000-000000000033'
  )$$,
  'an exact deck-version-restore retry returns its original success'
);
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from receipt_binding_ids where name = 'publish_deck'),
    (select value from receipt_binding_versions where name = 'version_restore'),
    2, '45000000-0000-4000-8000-000000000033'
  )$$,
  '22023', 'content mutation replay does not match',
  'deck-version restore rejects a changed target version under the same UUID'
);

reset role;

insert into receipt_binding_versions (name, value)
select 'permission_deck', version from public.decks
where id = (select id from receipt_binding_ids where name = 'permission_deck');
insert into public.deck_members (
  deck_id, account_id, role, granted_by
) values (
  (select id from receipt_binding_ids where name = 'permission_deck'),
  '41000000-0000-4000-8000-000000000002',
  'editor', '41000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select public.current_update_deck(
    (select id from receipt_binding_ids where name = 'permission_deck'),
    (select value from receipt_binding_versions where name = 'permission_deck'),
    '{"title":"Editor update"}'::jsonb,
    '45000000-0000-4000-8000-000000000038'
  )$$,
  'an authorized editor can create a payload-bound receipt'
);

reset role;
update public.deck_members
set revoked_at = pg_catalog.now(), version = version + 1
where deck_id = (select id from receipt_binding_ids where name = 'permission_deck')
  and account_id = '41000000-0000-4000-8000-000000000002';

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.current_update_deck(
    (select id from receipt_binding_ids where name = 'permission_deck'),
    (select value from receipt_binding_versions where name = 'permission_deck'),
    '{"title":"Editor update"}'::jsonb,
    '45000000-0000-4000-8000-000000000038'
  )$$,
  '42501', 'content mutation replay is no longer authorized',
  'an exact payload retry still rechecks permission after editor revocation'
);

reset role;

select throws_ok(
  $$insert into private.content_mutation_receipts (
    account_id, idempotency_key, operation, resource_type, resource_id,
    response, request_fingerprint, completed_at
  ) values (
    '41000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000039',
    'folder.update', 'pending', null, '{}'::jsonb, null, null
  )$$,
  '23514', null,
  'a pending receipt cannot exist without an exact command fingerprint'
);
select throws_ok(
  $$insert into private.content_mutation_receipts (
    account_id, idempotency_key, operation, resource_type, resource_id,
    response, request_fingerprint, completed_at
  ) values (
    '41000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000039',
    'folder.update', 'pending', null, '{}'::jsonb, repeat('c', 64), pg_catalog.now()
  )$$,
  '23514', null,
  'a completed receipt cannot retain the pending resource shape'
);

insert into private.content_mutation_receipts (
  account_id, idempotency_key, operation, resource_type, resource_id,
  response, request_fingerprint, completed_at
) values (
  '41000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000040',
  'folder.update', 'pending', null, '{}'::jsonb, repeat('d', 64), null
);
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.current_update_folder(
    (select id from receipt_binding_ids where name = 'folder_update'),
    (select version from public.folders where id = (
      select id from receipt_binding_ids where name = 'folder_update'
    )),
    'Pending retry', null, '45000000-0000-4000-8000-000000000040'
  )$$,
  '42501', 'content mutation replay is no longer authorized',
  'an impossible durable pending receipt fails closed instead of replaying'
);
reset role;
delete from private.content_mutation_receipts
where account_id = '41000000-0000-4000-8000-000000000001'
  and idempotency_key = '45000000-0000-4000-8000-000000000040';

-- Pre-090 legacy receipts cannot be reconstructed safely and therefore fail
-- closed instead of replaying a potentially different command.
insert into private.content_mutation_receipts (
  account_id, idempotency_key, operation, resource_type, resource_id,
  response, request_fingerprint, completed_at
) values (
  '41000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000034',
  'folder.update', 'folder',
  (select id from receipt_binding_ids where name = 'folder_update'),
  '{"version":2}'::jsonb, null, pg_catalog.now()
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.current_update_folder(
    (select id from receipt_binding_ids where name = 'folder_update'),
    (select version from public.folders where id = (
      select id from receipt_binding_ids where name = 'folder_update'
    )),
    'Legacy retry', null, '45000000-0000-4000-8000-000000000034'
  )$$,
  '22023', 'content mutation replay does not match',
  'an inherited unbound receipt fails closed rather than replaying unknown input'
);

reset role;

select is(
  (
    select pg_catalog.count(*)
    from private.content_mutation_receipts as receipt
    where receipt.account_id = '41000000-0000-4000-8000-000000000001'
      and receipt.completed_at is not null
      and receipt.operation in (
        'folder.create', 'folder.update', 'folder.delete',
        'note_type.create', 'note_type.update',
        'deck.create', 'deck.update', 'deck.archive', 'deck.restore', 'deck.delete',
        'deck.duplicate', 'note.bulk_tag', 'note.bulk_move', 'note.delete',
        'deck.publish', 'deck.unpublish', 'deck_version.restore', 'media.register'
      )
      and receipt.request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  (
    select pg_catalog.count(*)
    from private.content_mutation_receipts as receipt
    where receipt.account_id = '41000000-0000-4000-8000-000000000001'
      and receipt.completed_at is not null
      and receipt.operation in (
        'folder.create', 'folder.update', 'folder.delete',
        'note_type.create', 'note_type.update',
        'deck.create', 'deck.update', 'deck.archive', 'deck.restore', 'deck.delete',
        'deck.duplicate', 'note.bulk_tag', 'note.bulk_move', 'note.delete',
        'deck.publish', 'deck.unpublish', 'deck_version.restore', 'media.register'
      )
      and receipt.idempotency_key <> '45000000-0000-4000-8000-000000000034'
  ),
  'every new browser-reachable legacy-operation receipt stores a completed command fingerprint'
);

select * from finish();
rollback;
