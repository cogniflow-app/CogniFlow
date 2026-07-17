begin;

select no_plan();

create temporary table atomic_content_ids (
  name text primary key,
  id uuid not null
) on commit drop;
create temporary table atomic_content_text (
  name text primary key,
  value text not null
) on commit drop;
grant select, insert, update, delete on atomic_content_ids, atomic_content_text
to authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '31000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'atomic-content@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
  pg_catalog.now(), pg_catalog.now(), false
);

update public.profiles
set display_name = 'Atomic Content Owner',
    handle = 'atomic_content_owner',
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id = '31000000-0000-4000-8000-000000000001';

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values (
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
);
insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values (
  '33000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'Atomic content browser', 'pgTAP',
  '34000000-0000-4000-8000-000000000001'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note_definition_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid,jsonb)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_apply_deck_settings_and_publication(uuid,bigint,jsonb,text,public.deck_visibility,uuid)',
    'execute'
  ),
  'authenticated routes can invoke both additive atomic mutation boundaries'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid)',
    'execute'
  ),
  'authenticated callers cannot bypass definition-aware atomic note persistence'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_claim_due_media_deletions(integer,uuid,integer)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_complete_media_deletion(uuid,uuid,boolean,text)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_abandon_media_asset_upload(uuid,uuid,uuid)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_claim_due_media_deletions(integer,uuid,integer)',
    'execute'
  ),
  'physical deletion leases and upload compensation are service-only'
);
select ok(
  pg_catalog.strpos(
    pg_catalog.lower(pg_catalog.pg_get_functiondef(
      'private.adjust_embedded_media_asset_usage(uuid,integer)'::regprocedure
    )),
    'for update'
  ) < pg_catalog.strpos(
    pg_catalog.lower(pg_catalog.pg_get_functiondef(
      'private.adjust_embedded_media_asset_usage(uuid,integer)'::regprocedure
    )),
    'content_media_deletion_jobs'
  ),
  'embedded media resurrection locks the asset before checking deletion jobs in a fresh statement'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'private.adjust_embedded_media_asset_usage(uuid,integer)'::regprocedure
  ) not like '%job.status = ''leased''%'
  and pg_catalog.pg_get_functiondef(
    'private.adjust_embedded_media_asset_usage(uuid,integer)'::regprocedure
  ) like '%job.media_asset_id = p_media_asset_id%',
  'every deletion-job state permanently fences the old asset identity from resurrection'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.current_link_media(uuid,public.media_reference_type,uuid,public.media_reference_purpose,integer,text,uuid)'::regprocedure
  ) like '%asset.status in (''ready'', ''deleting'')%'
  and pg_catalog.pg_get_functiondef(
    'private.content_update_deck_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure
  ) like '%asset.status in (''ready'', ''deleting'')%',
  'explicit links and covers may revive only the pre-claim deletion grace state'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'private.create_custom_note_type_definition(uuid,jsonb,uuid)'::regprocedure
  ) like '%not between 1 and 64%'
  and pg_catalog.pg_get_functiondef(
    'private.create_custom_note_type_definition(uuid,jsonb,uuid)'::regprocedure
  ) like '%not between 1 and 20%'
  and pg_catalog.pg_get_functiondef(
    'private.create_custom_note_type_definition(uuid,jsonb,uuid)'::regprocedure
  ) like '%not between 1 and 120%'
  and (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid)
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.card_templates'::regclass
      and constraint_row.conname = 'card_templates_name_length'
  ) like '%120%',
  'database custom-definition limits match the 64-field, 20-template, 120-name domain contract'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.current_upsert_note_definition_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid,jsonb)'::regprocedure
  ) like '%__lumenRequestFingerprint%'
  and pg_catalog.pg_get_functiondef(
    'public.current_upsert_note_definition_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid,jsonb)'::regprocedure
  ) like '%extensions.gen_random_uuid()%'
  and pg_catalog.pg_get_functiondef(
    'public.current_apply_deck_settings_and_publication(uuid,bigint,jsonb,text,public.deck_visibility,uuid)'::regprocedure
  ) like '%extensions.gen_random_uuid()%'
  and pg_catalog.pg_get_functiondef(
    'public.current_apply_deck_settings_and_publication(uuid,bigint,jsonb,text,public.deck_visibility,uuid)'::regprocedure
  ) like '%__lumenRequestFingerprint%'
  and pg_catalog.pg_get_functiondef(
    'public.current_apply_deck_settings_and_publication(uuid,bigint,jsonb,text,public.deck_visibility,uuid)'::regprocedure
  ) not like '%deck-settings-before-publication%',
  'atomic wrappers use collision-resistant inner receipts and fingerprint note replays'
);

set local role service_role;
select throws_ok(
  $$select * from public.admin_claim_due_media_deletions(
    null, '37000000-0000-4000-8000-000000000099', 60
  )$$,
  '22023',
  'media deletion claim is invalid',
  'a null batch limit cannot become an unbounded deletion claim'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"32000000-0000-4000-8000-000000000001"}';

insert into atomic_content_ids (name, id)
select 'deck', deck.id
from public.current_create_deck(
  'Atomic authoring deck',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null,
  'private',
  '35000000-0000-4000-8000-000000000001'
) as deck;

select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from atomic_content_ids where name = 'deck'),
    '36000000-0000-4000-8000-000000000099', 'custom', 0,
    '{}'::jsonb,
    '{"authoringData":{"kind":"custom"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '35000000-0000-4000-8000-000000000099',
    '{"displayName":"Incomplete","templates":[]}'::jsonb
  )$$,
  '22023',
  'custom note type definition is invalid',
  'custom definitions must explicitly contain both fields and templates'
);

select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from atomic_content_ids where name = 'deck'),
    '36000000-0000-4000-8000-000000000098', 'custom_deadbeef', 0,
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Prompt"}}'::jsonb,
    '{"authoringData":{"kind":"custom","fields":{"Prompt":{"schemaVersion":1,"type":"doc","content":[]}},"templates":[{"semanticKey":"recall","name":"Recall","frontTemplate":"{{Prompt}}","backTemplate":"{{Prompt}}"}]}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '35000000-0000-4000-8000-000000000098'
  )$$,
  '22023',
  'custom note type definition is required',
  'every custom write requires its complete definition, including an existing custom code'
);

select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from atomic_content_ids where name = 'deck'),
    '36000000-0000-4000-8000-000000000097', 'custom', 0,
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Prompt"}}'::jsonb,
    '{"authoringData":{"kind":"custom","fields":{"Prompt":{"schemaVersion":1,"type":"doc","content":[]}},"templates":[{"semanticKey":"recall","name":"Recall","frontTemplate":"{{Prompt}} changed","backTemplate":"{{Prompt}}"}]}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '35000000-0000-4000-8000-000000000097',
    '{"displayName":"Mismatch","fields":[{"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true}],"templates":[{"templateKey":"recall","name":"Recall","ordinal":0,"frontTemplate":"{{Prompt}}","backTemplate":"{{Prompt}}","answerFieldKey":"Prompt","schemaVersion":1}]}'::jsonb
  )$$,
  '22023',
  'custom note type definition does not match authoring payload',
  'custom definition template properties must exactly match authored properties'
);

select lives_ok(
  $$
    select public.current_upsert_note_definition_with_media(
      p_deck_id => (select id from atomic_content_ids where name = 'deck'),
      p_note_id => '36000000-0000-4000-8000-000000000001',
      p_note_type_code => 'custom',
      p_custom_note_type_definition => '{
        "displayName":"Custom recall","description":"Atomic definition",
        "fields":[
          {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
          {"fieldKey":"Answer","label":"Answer","fieldType":"rich_text","position":1,"required":true}
        ],
        "templates":[{
          "templateKey":"recall","name":"Recall","ordinal":0,
          "frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}",
          "answerFieldKey":"Answer","schemaVersion":1
        }]
      }'::jsonb,
      p_expected_version => 0,
      p_fields => '{
        "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Organelle?","position":0},
        "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Mitochondria","position":1}
      }'::jsonb,
      p_card_payload => '{
        "authoringData":{
          "kind":"custom","schemaVersion":1,
          "fields":{
            "Prompt":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Organelle?"}]}]},
            "Answer":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mitochondria"}]}]}
          },
          "templates":[{
            "semanticKey":"recall","name":"Recall",
            "frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}"
          }]
        }
      }'::jsonb,
      p_tags => '{}'::text[], p_media_links => '[]'::jsonb,
      p_idempotency_key => '35000000-0000-4000-8000-000000000002'
    )
  $$,
  'custom note type creation and note upsert commit through one RPC'
);

insert into atomic_content_ids (name, id)
select 'first_note_type', note.note_type_id
from public.notes as note
where note.id = '36000000-0000-4000-8000-000000000001';

select ok(
  (
    select pg_catalog.count(*) = 2
    from public.note_type_fields as field
    where field.note_type_id = (select id from atomic_content_ids where name = 'first_note_type')
      and field.deleted_at is null
  )
  and (
    select pg_catalog.count(*) = 1
    from public.card_templates as template
    where template.note_type_id = (select id from atomic_content_ids where name = 'first_note_type')
      and template.deleted_at is null
  ),
  'the custom field and template definition is durable'
);

select ok(
  not (
    public.current_upsert_note_definition_with_media(
      (select id from atomic_content_ids where name = 'deck'),
      '36000000-0000-4000-8000-000000000090', 'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Stable front"},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Stable back"}
      }'::jsonb,
      '{"authoringData":{"kind":"basic"}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '35000000-0000-4000-8000-000000000090'
    ) ? '__lumenRequestFingerprint'
  ),
  'private replay fingerprints are not exposed in the note response'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from atomic_content_ids where name = 'deck'),
    '36000000-0000-4000-8000-000000000090', 'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Tampered front"},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Stable back"}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '35000000-0000-4000-8000-000000000090'
  )$$,
  '22023',
  'content mutation replay does not match',
  'an idempotency key cannot replay a different semantic note request'
);

select lives_ok(
  $$
    select public.current_upsert_note_definition_with_media(
      p_deck_id => (select id from atomic_content_ids where name = 'deck'),
      p_note_id => '36000000-0000-4000-8000-000000000001',
      p_note_type_code => 'custom',
      p_custom_note_type_definition => '{
        "displayName":"Custom recall","description":"Edited atomically",
        "fields":[
          {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
          {"fieldKey":"Answer","label":"Answer","fieldType":"rich_text","position":1,"required":true},
          {"fieldKey":"Hint","label":"Hint","fieldType":"rich_text","position":2,"required":false}
        ],
        "templates":[
          {"templateKey":"recall","name":"Recall","ordinal":0,"frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}","answerFieldKey":"Answer","schemaVersion":1},
          {"templateKey":"hinted","name":"Hinted","ordinal":1,"frontTemplate":"{{Hint}} {{Prompt}}","backTemplate":"{{Answer}}","answerFieldKey":"Answer","schemaVersion":1}
        ]
      }'::jsonb,
      p_expected_version => 1,
      p_fields => '{
        "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Organelle?","position":0},
        "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Mitochondria","position":1},
        "Hint":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Energy","position":2}
      }'::jsonb,
      p_card_payload => '{
        "authoringData":{
          "kind":"custom","schemaVersion":1,
          "fields":{
            "Prompt":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Organelle?"}]}]},
            "Answer":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mitochondria"}]}]},
            "Hint":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Energy"}]}]}
          },
          "templates":[
            {"semanticKey":"recall","name":"Recall","frontTemplate":"{{Prompt}}","backTemplate":"{{Answer}}"},
            {"semanticKey":"hinted","name":"Hinted","frontTemplate":"{{Hint}} {{Prompt}}","backTemplate":"{{Answer}}"}
          ]
        }
      }'::jsonb,
      p_tags => '{}'::text[], p_media_links => '[]'::jsonb,
      p_idempotency_key => '35000000-0000-4000-8000-000000000003'
    )
  $$,
  'editing an existing custom note atomically persists its changed definition'
);

select ok(
  (
    select note.note_type_id <> (select id from atomic_content_ids where name = 'first_note_type')
      and note.version = 2
    from public.notes as note
    where note.id = '36000000-0000-4000-8000-000000000001'
  )
  and (
    select pg_catalog.count(*) = 3
    from public.note_type_fields as field
    join public.notes as note on note.note_type_id = field.note_type_id
    where note.id = '36000000-0000-4000-8000-000000000001'
      and field.deleted_at is null
  )
  and (
    select pg_catalog.count(*) = 2
    from public.card_templates as template
    join public.notes as note on note.note_type_id = template.note_type_id
    where note.id = '36000000-0000-4000-8000-000000000001'
      and template.deleted_at is null
  ),
  'definition changes use copy-on-write and preserve the edited field/template graph'
);

insert into atomic_content_text (name, value)
select 'publish_version', deck.version::text
from public.decks as deck
where deck.id = (select id from atomic_content_ids where name = 'deck');
select lives_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from atomic_content_ids where name = 'deck'),
    (select value::bigint from atomic_content_text where name = 'publish_version'),
    '{"title":"Published atomic deck"}'::jsonb,
    'publish', 'public',
    '35000000-0000-4000-8000-000000000091'
  )$$,
  'settings and publication commit through one collision-resistant boundary'
);
select throws_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from atomic_content_ids where name = 'deck'),
    (select value::bigint from atomic_content_text where name = 'publish_version'),
    '{"title":"Replay payload must not win"}'::jsonb,
    'publish', 'public',
    '35000000-0000-4000-8000-000000000091'
  )$$,
  '22023',
  'content mutation replay does not match',
  'a publication idempotency key cannot replay a different settings command'
);

insert into atomic_content_ids (name, id)
select 'empty_deck', deck.id
from public.current_create_deck(
  'Unchanged title',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null,
  'private',
  '35000000-0000-4000-8000-000000000004'
) as deck;

select throws_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from atomic_content_ids where name = 'empty_deck'),
    (select version from public.decks where id = (
      select id from atomic_content_ids where name = 'empty_deck'
    )),
    '{}'::jsonb, null, 'private',
    '35000000-0000-4000-8000-000000000097'
  )$$,
  '22023',
  'deck publication command is invalid',
  'a null publication action is rejected explicitly'
);
select throws_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from atomic_content_ids where name = 'empty_deck'),
    (select version from public.decks where id = (
      select id from atomic_content_ids where name = 'empty_deck'
    )),
    '{}'::jsonb, 'publish', null,
    '35000000-0000-4000-8000-000000000098'
  )$$,
  '22023',
  'published visibility must be public or unlisted',
  'publish visibility cannot be null'
);
select throws_ok(
  $$select public.current_apply_deck_settings_and_publication(
    (select id from atomic_content_ids where name = 'empty_deck'),
    (select version from public.decks where id = (
      select id from atomic_content_ids where name = 'empty_deck'
    )),
    '{}'::jsonb, 'unpublish', null,
    '35000000-0000-4000-8000-000000000096'
  )$$,
  '22023',
  'unpublish visibility must be private',
  'unpublish visibility cannot be null'
);

select throws_ok(
  $$
    select public.current_apply_deck_settings_and_publication(
      (select id from atomic_content_ids where name = 'empty_deck'),
      (select version from public.decks where id = (
        select id from atomic_content_ids where name = 'empty_deck'
      )),
      '{"title":"Must roll back"}'::jsonb,
      'publish', 'public',
      '35000000-0000-4000-8000-000000000005'
    )
  $$,
  '22023',
  'a deck must contain an active card before publication',
  'a publication failure rolls back its settings patch'
);
select is(
  (select title from public.decks where id = (
    select id from atomic_content_ids where name = 'empty_deck'
  )),
  'Unchanged title',
  'deck settings cannot partially commit before publication'
);

insert into atomic_content_ids (name, id)
select 'media', asset.id
from public.current_register_media_asset(
  repeat('a', 64), 'image/png', 'image', 1024, 16, 16, null,
  'Deletion fixture', '35000000-0000-4000-8000-000000000006'
) as asset;
select ok(
  (
    select asset.status = 'pending'
      and asset.delete_after > pg_catalog.now() + interval '23 hours'
      and asset.delete_after <= pg_catalog.now() + interval '24 hours 1 minute'
    from public.media_assets as asset
    where asset.id = (select id from atomic_content_ids where name = 'media')
  ),
  'a registered upload reservation receives a bounded pending-cleanup deadline'
);
insert into atomic_content_text (name, value)
select 'media_registration_version', asset.version::text
from public.media_assets as asset
where asset.id = (select id from atomic_content_ids where name = 'media');
insert into atomic_content_text (name, value)
select 'media_registration_deadline', asset.delete_after::text
from public.media_assets as asset
where asset.id = (select id from atomic_content_ids where name = 'media');
select is(
  (
    select asset.version::text
    from public.current_register_media_asset(
      repeat('a', 64), 'image/png', 'image', 1024, 16, 16, null,
      'Deletion fixture', '35000000-0000-4000-8000-000000000006'
    ) as asset
  ),
  (select value from atomic_content_text where name = 'media_registration_version'),
  'an exact live registration receipt replay returns without creating a new asset version'
);
select ok(
  (
    select asset.version::text = (
        select value from atomic_content_text where name = 'media_registration_version'
      )
      and asset.delete_after::text = (
        select value from atomic_content_text where name = 'media_registration_deadline'
      )
    from public.media_assets as asset
    where asset.id = (select id from atomic_content_ids where name = 'media')
  ),
  'registration replay leaves the pending cleanup deadline and row version stable'
);

reset role;
set local role service_role;
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '31000000-0000-4000-8000-000000000001',
    (select id from atomic_content_ids where name = 'media'),
    repeat('a', 64), 'image/png', true,
    '35000000-0000-4000-8000-000000000007'
  )$$,
  'service finalization prepares the physical-deletion fixture'
);
reset role;
update public.media_assets
set delete_after = pg_catalog.now() - interval '1 minute'
where id = (select id from atomic_content_ids where name = 'media');

set local role service_role;
insert into atomic_content_text (name, value)
select 'lease', lease_token::text
from public.admin_claim_due_media_deletions(
  1, '37000000-0000-4000-8000-000000000001', 60
);
select is(
  (select pg_catalog.count(*) from atomic_content_text where name = 'lease'),
  1::bigint,
  'the service worker leases one due zero-reference ready object'
);
reset role;
select is(
  (select status::text from public.media_assets where id = (
    select id from atomic_content_ids where name = 'media'
  )),
  'deleting',
  'claim atomically transitions a due never-linked ready object to deleting'
);

update private.content_media_deletion_jobs
set lease_until = pg_catalog.now() - interval '1 second'
where media_asset_id = (select id from atomic_content_ids where name = 'media');
select throws_ok(
  $$insert into public.audio_prompts (note_id, media_asset_id, transcript, answer)
    values (
      '36000000-0000-4000-8000-000000000001',
      (select id from atomic_content_ids where name = 'media'),
      'leased audio', 'must not attach'
    )$$,
  '55000',
  'media asset is unavailable',
  'an expired but still-leased physical-deletion object cannot be reattached'
);
select throws_ok(
  $$insert into public.media_references (
      media_asset_id, deck_id, note_id, reference_type, owner_id,
      purpose, position, alt_text, created_by
    ) values (
      (select id from atomic_content_ids where name = 'media'),
      (select id from atomic_content_ids where name = 'deck'),
      '36000000-0000-4000-8000-000000000001',
      'note', '36000000-0000-4000-8000-000000000001',
      'attachment', 99, 'must not attach',
      '31000000-0000-4000-8000-000000000001'
    )$$,
  '55000',
  'media asset is unavailable',
  'an explicit media reference cannot revive an expired but still-leased object'
);

set local role service_role;
select is(
  public.admin_complete_media_deletion(
    (select id from atomic_content_ids where name = 'media'),
    (select value::uuid from atomic_content_text where name = 'lease'),
    false, 'provider unavailable'
  ) ->> 'status',
  'queued',
  'a provider failure requeues the physical deletion'
);
reset role;
select ok(
  (
    select asset.status = 'deleting' and asset.deleted_at is null
    from public.media_assets as asset
    where asset.id = (select id from atomic_content_ids where name = 'media')
  )
  and (
    select job.status = 'queued'
      and job.available_at > pg_catalog.now()
      and job.last_error = 'provider unavailable'
    from private.content_media_deletion_jobs as job
    where job.media_asset_id = (select id from atomic_content_ids where name = 'media')
  ),
  'failed deletion uses bounded backoff without tombstoning the asset'
);
select throws_ok(
  $$insert into public.audio_prompts (note_id, media_asset_id, transcript, answer)
    values (
      '36000000-0000-4000-8000-000000000001',
      (select id from atomic_content_ids where name = 'media'),
      'queued audio', 'must remain fenced'
    )$$,
  '55000',
  'media asset is unavailable',
  'a queued job still fences the asset from a stale worker deleting new usage'
);
update private.content_media_deletion_jobs
set available_at = pg_catalog.now() - interval '1 second'
where media_asset_id = (select id from atomic_content_ids where name = 'media');

set local role service_role;
update atomic_content_text
set value = claimed.lease_token::text
from public.admin_claim_due_media_deletions(
  1, '37000000-0000-4000-8000-000000000002', 60
) as claimed
where name = 'lease';
select is(
  public.admin_complete_media_deletion(
    (select id from atomic_content_ids where name = 'media'),
    (select value::uuid from atomic_content_text where name = 'lease'),
    true, null
  ) ->> 'status',
  'completed',
  'a successful physical Storage removal completes the durable job'
);
reset role;
select ok(
  (
    select status = 'deleted'
      and deleted_at is not null
      and storage_bucket = 'deleted'
    from public.media_assets
    where id = (select id from atomic_content_ids where name = 'media')
  ),
  'completion tombstones the locator only after worker success'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"32000000-0000-4000-8000-000000000001"}';
insert into atomic_content_ids (name, id)
select 'media_reupload', asset.id
from public.current_register_media_asset(
  repeat('a', 64), 'image/png', 'image', 1024, 16, 16, null,
  'Fresh upload of the same bytes', '35000000-0000-4000-8000-000000000008'
) as asset;
select ok(
  (select id from atomic_content_ids where name = 'media_reupload')
    <> (select id from atomic_content_ids where name = 'media')
  and (
    select new_asset.status = 'pending'
      and new_asset.deleted_at is null
      and new_asset.public_id <> old_asset.public_id
      and new_asset.storage_path <> old_asset.storage_path
    from public.media_assets as new_asset
    join public.media_assets as old_asset
      on old_asset.id = (select id from atomic_content_ids where name = 'media')
    where new_asset.id = (select id from atomic_content_ids where name = 'media_reupload')
  )
  and (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(*) filter (where deleted_at is null) = 1
    from public.media_assets
    where owner_account_id = '31000000-0000-4000-8000-000000000001'
      and sha256 = repeat('a', 64)
  ),
  'completed tombstones retain history while identical bytes receive a fresh live asset and path'
);
reset role;

set local role service_role;
select is(
  (
    select status::text
    from public.admin_abandon_media_asset_upload(
      '31000000-0000-4000-8000-000000000001',
      (select id from atomic_content_ids where name = 'media_reupload'),
      '35000000-0000-4000-8000-000000000008'
    )
  ),
  'deleting',
  'a known failed upload is compensated into immediate cleanup eligibility'
);
reset role;
select ok(
  not exists(
    select 1
    from private.content_mutation_receipts as receipt
    where receipt.account_id = '31000000-0000-4000-8000-000000000001'
      and receipt.idempotency_key = '35000000-0000-4000-8000-000000000008'
  )
  and (
    select delete_after <= pg_catalog.now()
    from public.media_assets
    where id = (select id from atomic_content_ids where name = 'media_reupload')
  ),
  'upload compensation releases the registration receipt and makes cleanup due'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"32000000-0000-4000-8000-000000000001"}';
select is(
  (
    select status::text
    from public.current_register_media_asset(
      repeat('a', 64), 'image/png', 'image', 1024, 16, 16, null,
      'Fresh upload of the same bytes', '35000000-0000-4000-8000-000000000008'
    )
  ),
  'pending',
  'retry before a cleanup claim safely reuses the unverified reservation'
);
reset role;
update public.media_assets
set delete_after = pg_catalog.now() - interval '1 minute'
where id = (select id from atomic_content_ids where name = 'media_reupload');

set local role service_role;
insert into atomic_content_text (name, value)
select 'pending_lease', lease_token::text
from public.admin_claim_due_media_deletions(
  1, '37000000-0000-4000-8000-000000000003', 60
);
reset role;
select is(
  (
    select status::text
    from public.media_assets
    where id = (select id from atomic_content_ids where name = 'media_reupload')
  ),
  'deleting',
  'the worker claims an expired pending reservation even when no Storage object exists'
);
set local role service_role;
select is(
  public.admin_complete_media_deletion(
    (select id from atomic_content_ids where name = 'media_reupload'),
    (select value::uuid from atomic_content_text where name = 'pending_lease'),
    true, null
  ) ->> 'status',
  'completed',
  'successful empty Storage removal tombstones an abandoned pending reservation'
);
reset role;

select * from finish();
rollback;
