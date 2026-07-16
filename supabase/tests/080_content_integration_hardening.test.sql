begin;

select no_plan();

-- Contract assumptions for 20260716002000:
-- * p_media_links is an array of {assetId,purpose,position,altText}; the note is
--   the implicit reference owner.
-- * public media metadata contains no bucket/path; the service-only locator
--   returns (media_public_id, storage_bucket, storage_path).
create temporary table hardening_ids (
  name text primary key,
  id uuid not null
) on commit drop;
create temporary table hardening_numbers (
  name text primary key,
  value bigint not null
) on commit drop;
create temporary table hardening_text (
  name text primary key,
  value text not null
) on commit drop;
create temporary table hardening_card_ids (
  note_id uuid not null,
  card_id uuid not null,
  primary key (note_id, card_id)
) on commit drop;
create temporary table hardening_public_card_ids (
  generation_key text primary key,
  card_public_id uuid not null
) on commit drop;

grant select, insert, update, delete on
  hardening_ids,
  hardening_numbers,
  hardening_text,
  hardening_card_ids,
  hardening_public_card_ids
to anon, authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'hardening-owner@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'hardening-editor@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'hardening-viewer@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set display_name = case id
      when '11000000-0000-4000-8000-000000000001' then 'Hardening Owner'
      when '11000000-0000-4000-8000-000000000002' then 'Hardening Editor'
      else 'Hardening Viewer'
    end,
    handle = case id
      when '11000000-0000-4000-8000-000000000001' then 'hardening_owner'
      when '11000000-0000-4000-8000-000000000002' then 'hardening_editor'
      else 'hardening_viewer'
    end,
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '12000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '12000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000003',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );

insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values
  (
    '13000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    'Owner browser', 'pgTAP', '14000000-0000-4000-8000-000000000001'
  ),
  (
    '13000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000002',
    'Editor browser', 'pgTAP', '14000000-0000-4000-8000-000000000002'
  ),
  (
    '13000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000003',
    'Viewer browser', 'pgTAP', '14000000-0000-4000-8000-000000000003'
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000001"}';

insert into hardening_ids (name, id)
select 'folder', folder.id
from public.current_create_folder(
  'Hardening folder', null,
  '15000000-0000-4000-8000-000000000001'
) as folder;

insert into hardening_ids (name, id)
select 'source_deck', deck.id
from public.current_create_deck(
  'Source deck',
  '{"schemaVersion":1,"type":"doc","content":[],"plainText":"Source"}'::jsonb,
  (select id from hardening_ids where name = 'folder'),
  'private', '15000000-0000-4000-8000-000000000002'
) as deck;
insert into hardening_ids (name, id)
select 'target_deck', deck.id
from public.current_create_deck(
  'Target deck',
  '{"schemaVersion":1,"type":"doc","content":[],"plainText":"Target"}'::jsonb,
  (select id from hardening_ids where name = 'folder'),
  'private', '15000000-0000-4000-8000-000000000003'
) as deck;
insert into hardening_ids (name, id)
select 'archived_deck', deck.id
from public.current_create_deck(
  'Archived deck',
  '{"schemaVersion":1,"type":"doc","content":[],"plainText":"Archive"}'::jsonb,
  (select id from hardening_ids where name = 'folder'),
  'private', '15000000-0000-4000-8000-000000000004'
) as deck;
select lives_ok(
  $$
    select public.current_archive_deck(
      (select id from hardening_ids where name = 'archived_deck'),
      1,
      '15000000-0000-4000-8000-000000000005'
    )
  $$,
  'the count fixture includes one archived deck'
);

insert into hardening_ids (name, id)
select 'media', asset.id
from public.current_register_media_asset(
  repeat('d', 64), 'image/png', 'image', 4096, 48, 48, null,
  'A cell diagram', '15000000-0000-4000-8000-000000000006'
) as asset;
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_finalize_media_asset(
      '11000000-0000-4000-8000-000000000001',
      (select id from hardening_ids where name = 'media'),
      repeat('d', 64), 'image/png', true,
      '15000000-0000-4000-8000-000000000007'
    )
  $$,
  'the integration media fixture is verified by the service boundary'
);
reset role;

insert into hardening_text (name, value)
select 'media_storage_path', storage_path
from public.media_assets
where id = (select id from hardening_ids where name = 'media');
insert into hardening_ids (name, id)
select 'media_public_id', public_id
from public.media_assets
where id = (select id from hardening_ids where name = 'media');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from hardening_ids where name = 'source_deck'),
      '16000000-0000-4000-8000-000000000001',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Atomic front","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Atomic back","position":1}
      }'::jsonb,
      '{"authoringData":{
        "kind":"basic","schemaVersion":1,
        "front":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Atomic front"}]}]},
        "back":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Atomic back"}]}]}
      }}'::jsonb,
      array['RemoveMe']::text[],
      '[{"assetId":"19000000-0000-4000-8000-000000000099","purpose":"prompt","position":0,"altText":"Missing"}]'::jsonb,
      '15000000-0000-4000-8000-000000000008'
    )
  $$,
  '42501',
  null,
  'an unavailable media link rolls the entire note transaction back'
);
select is(
  (select count(*)::integer from public.notes
    where id = '16000000-0000-4000-8000-000000000001'),
  0,
  'failed atomic media reconciliation leaves no note row'
);
select ok(
  (
    select version = 1 and current_version = 1 and note_count = 0 and card_count = 0
    from public.decks
    where id = (select id from hardening_ids where name = 'source_deck')
  ),
  'failed atomic media reconciliation leaves deck versions and counts unchanged'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from hardening_ids where name = 'source_deck'),
      '16000000-0000-4000-8000-000000000001',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Atomic front","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Atomic back","position":1}
      }'::jsonb,
      '{"authoringData":{
        "kind":"basic","schemaVersion":1,
        "front":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Atomic front"}]}]},
        "back":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Atomic back"}]}]}
      }}'::jsonb,
      array['RemoveMe']::text[],
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'assetId', (select id from hardening_ids where name = 'media'),
        'purpose', 'prompt', 'position', 0, 'altText', 'A cell diagram'
      )),
      '15000000-0000-4000-8000-000000000009'
    )
  $$,
  'valid note and media reconciliation commits atomically'
);
select ok(
  exists(
    select 1 from public.notes
    where id = '16000000-0000-4000-8000-000000000001' and version = 1
  )
  and exists(
    select 1 from public.cards
    where note_id = '16000000-0000-4000-8000-000000000001'
      and generation_key = 'g1:basic:forward' and active
  )
  and exists(
    select 1 from public.media_references
    where media_asset_id = (select id from hardening_ids where name = 'media')
      and note_id = '16000000-0000-4000-8000-000000000001'
      and reference_type = 'note' and deleted_at is null
  ),
  'atomic success persists the note, stable card, and active media reference'
);
select is(
  (select reference_count from public.media_assets
    where id = (select id from hardening_ids where name = 'media')),
  1,
  'atomic success increments media reference_count exactly once'
);
select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from hardening_ids where name = 'source_deck'),
      '16000000-0000-4000-8000-000000000001',
      'basic', 999,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::text[],
      '[]'::jsonb,
      '15000000-0000-4000-8000-000000000009'
    )
  $$,
  'an exact idempotency replay returns the prior atomic response before reapplying input'
);
select ok(
  (select version = 1 from public.notes
    where id = '16000000-0000-4000-8000-000000000001')
  and (select reference_count = 1 from public.media_assets
    where id = (select id from hardening_ids where name = 'media')),
  'an idempotency replay cannot change the note or its attachment graph'
);

select is(
  (select count(*)::integer from public.current_get_media_asset(
    (select id from hardening_ids where name = 'media')
  )),
  1,
  'an authenticated owner can resolve private media metadata and storage location'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000003"}';
select is(
  (select count(*)::integer from public.current_get_media_asset(
    (select id from hardening_ids where name = 'media')
  )),
  0,
  'an unrelated authenticated account cannot resolve private media'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from hardening_ids where name = 'source_deck'),
      '16000000-0000-4000-8000-000000000002',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Second front","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Second back","position":1}
      }'::jsonb,
      '{"authoringData":{
        "kind":"basic","schemaVersion":1,
        "front":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Second front"}]}]},
        "back":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Second back"}]}]}
      }}'::jsonb,
      array['RemoveMe']::text[], '[]'::jsonb,
      '15000000-0000-4000-8000-000000000010'
    )
  $$,
  'a second atomic note succeeds without media links'
);

insert into hardening_ids (name, id)
select 'custom_note_type', note_type.id
from public.current_create_note_type(
  'Filtered publication type', 'Secret is not referenced by its template',
  '[
    {"fieldKey":"Term","label":"Term","fieldType":"rich_text","position":0,"required":true},
    {"fieldKey":"Definition","label":"Definition","fieldType":"rich_text","position":1,"required":true},
    {"fieldKey":"Secret","label":"Secret","fieldType":"rich_text","position":2,"required":false}
  ]'::jsonb,
  '[{
    "templateKey":"definition","name":"Definition","ordinal":0,
    "frontTemplate":"{{Term}}","backTemplate":"{{Definition}}",
    "answerFieldKey":"Definition"
  }]'::jsonb,
  '15000000-0000-4000-8000-000000000011'
) as note_type;

select lives_ok(
  pg_catalog.format(
    'select public.current_upsert_note_with_media(%L,%L,%L,0,%L::jsonb,%L::jsonb,%L::text[],%L::jsonb,%L)',
    (select id from hardening_ids where name = 'source_deck'),
    '16000000-0000-4000-8000-000000000003',
    (select code from public.note_types where id = (select id from hardening_ids where name = 'custom_note_type')),
    '{
      "Term":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Osmosis","position":0},
      "Definition":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Movement through a membrane","position":1},
      "Secret":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Never publish this","position":2}
    }'::jsonb,
    '{"authoringData":{
      "kind":"custom","schemaVersion":1,
      "fields":{
        "Term":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Osmosis"}]}]},
        "Definition":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Movement through a membrane"}]}]},
        "Secret":{"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Never publish this"}]}]}
      },
      "templates":[{
        "semanticKey":"definition","name":"Definition",
        "frontTemplate":"{{Term}}","backTemplate":"{{Definition}}"
      }]
    }}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '15000000-0000-4000-8000-000000000012'
  ),
  'custom publication fixture persists through the atomic wrapper'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from hardening_ids where name = 'source_deck'),
      '16000000-0000-4000-8000-000000000004',
      'image_occlusion', 0,
      '{
        "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Identify the region","position":0},
        "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"A cell diagram","position":1},
        "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
      }'::jsonb,
      pg_catalog.jsonb_build_object(
        'authoringData', pg_catalog.jsonb_build_object(
          'kind', 'image_occlusion', 'schemaVersion', 1,
          'imageAssetId', (select id::text from hardening_ids where name = 'media'),
          'imageAlt', 'A cell diagram',
          'mode', 'hide_one_reveal_others',
          'occlusions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'semanticKey', 'nucleus-mask', 'groupKey', 'nucleus',
            'shape', '{"kind":"rectangle","x":0.1,"y":0.1,"width":0.2,"height":0.2}'::jsonb,
            'label', 'Nucleus', 'altText', 'Central cell region'
          ))
        )
      ),
      '{}'::text[],
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'assetId', (select id from hardening_ids where name = 'media'),
        'purpose', 'prompt', 'position', 0, 'altText', 'A cell diagram'
      )),
      '15000000-0000-4000-8000-000000000013'
    )
  $$,
  'nested-media publication fixture persists through the atomic wrapper'
);

reset role;
insert into public.deck_members (deck_id, account_id, role, granted_by) values
  (
    (select id from hardening_ids where name = 'source_deck'),
    '11000000-0000-4000-8000-000000000002', 'editor',
    '11000000-0000-4000-8000-000000000001'
  ),
  (
    (select id from hardening_ids where name = 'target_deck'),
    '11000000-0000-4000-8000-000000000002', 'editor',
    '11000000-0000-4000-8000-000000000001'
  ),
  (
    (select id from hardening_ids where name = 'source_deck'),
    '11000000-0000-4000-8000-000000000003', 'viewer',
    '11000000-0000-4000-8000-000000000001'
  ),
  (
    (select id from hardening_ids where name = 'target_deck'),
    '11000000-0000-4000-8000-000000000003', 'viewer',
    '11000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000003"}';
select is(
  (select count(*)::integer from public.current_get_media_asset(
    (select id from hardening_ids where name = 'media')
  )),
  1,
  'a deck viewer can resolve media linked to a deck they may view'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000002"}';
insert into hardening_numbers (name, value)
select 'source_before_tag', current_version
from public.decks where id = (select id from hardening_ids where name = 'source_deck');
select lives_ok(
  $$
    select public.current_bulk_tag_notes(
      (select id from hardening_ids where name = 'source_deck'),
      array[
        '16000000-0000-4000-8000-000000000001',
        '16000000-0000-4000-8000-000000000002'
      ]::uuid[],
      array[
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000001'),
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000002')
      ]::bigint[],
      array['Shared Tag']::text[], array['RemoveMe']::text[],
      '15000000-0000-4000-8000-000000000014'
    )
  $$,
  'an editor atomically adds and removes tags from a bounded note selection'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.note_tags as note_tag
    join public.tags as tag on tag.id = note_tag.tag_id
    where note_tag.note_id in (
      '16000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000002'
    )
      and note_tag.deleted_at is null
      and tag.deleted_at is null
      and tag.normalized_name = 'shared tag'
  ),
  2,
  'bulk tagging links both notes to one normalized deck-scoped tag'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.note_tags as note_tag
    join public.tags as tag on tag.id = note_tag.tag_id
    where note_tag.note_id in (
      '16000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000002'
    )
      and note_tag.deleted_at is null
      and tag.normalized_name = 'removeme'
  ),
  0,
  'bulk tagging removes the requested prior tag from every selected note'
);
select is(
  (select current_version from public.decks
    where id = (select id from hardening_ids where name = 'source_deck')),
  (select value + 1 from hardening_numbers where name = 'source_before_tag'),
  'one bulk-tag transaction creates exactly one new source deck content head'
);

select throws_ok(
  $$
    select public.current_bulk_tag_notes(
      (select id from hardening_ids where name = 'source_deck'),
      array[
        '16000000-0000-4000-8000-000000000001',
        '16000000-0000-4000-8000-000000000002'
      ]::uuid[],
      array[
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000001'),
        (select version - 1 from public.notes where id = '16000000-0000-4000-8000-000000000002')
      ]::bigint[],
      array['Should Not Apply']::text[], '{}'::text[],
      '15000000-0000-4000-8000-000000000015'
    )
  $$,
  'P0001',
  null,
  'one stale note version rolls back the entire bulk-tag mutation'
);
select is(
  (select count(*)::integer from public.tags
    where deck_id = (select id from hardening_ids where name = 'source_deck')
      and normalized_name = 'should not apply' and deleted_at is null),
  0,
  'a conflicted bulk-tag mutation creates no partial tag state'
);

insert into hardening_card_ids (note_id, card_id)
select card.note_id, card.id
from public.cards as card
where card.note_id in (
  '16000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002'
)
  and card.active and card.deleted_at is null;

select throws_ok(
  $$
    select public.current_bulk_move_notes(
      (select id from hardening_ids where name = 'source_deck'),
      (select id from hardening_ids where name = 'target_deck'),
      array[
        '16000000-0000-4000-8000-000000000001',
        '16000000-0000-4000-8000-000000000002'
      ]::uuid[],
      array[
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000001'),
        (select version - 1 from public.notes where id = '16000000-0000-4000-8000-000000000002')
      ]::bigint[],
      '15000000-0000-4000-8000-000000000016'
    )
  $$,
  'P0001',
  null,
  'one stale note version rolls back the entire bulk move'
);
select is(
  (select count(*)::integer from public.notes
    where id in (
      '16000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000002'
    )
      and deck_id = (select id from hardening_ids where name = 'source_deck')),
  2,
  'a conflicted bulk move leaves every selected note in the source deck'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000003"}';
select throws_ok(
  $$
    select public.current_bulk_tag_notes(
      (select id from hardening_ids where name = 'source_deck'),
      array['16000000-0000-4000-8000-000000000001']::uuid[],
      array[(select version from public.notes where id = '16000000-0000-4000-8000-000000000001')]::bigint[],
      array['Viewer tag']::text[], '{}'::text[],
      '15000000-0000-4000-8000-000000000017'
    )
  $$,
  '42501',
  null,
  'a viewer cannot bulk-tag notes'
);
select throws_ok(
  $$
    select public.current_bulk_move_notes(
      (select id from hardening_ids where name = 'source_deck'),
      (select id from hardening_ids where name = 'target_deck'),
      array['16000000-0000-4000-8000-000000000001']::uuid[],
      array[(select version from public.notes where id = '16000000-0000-4000-8000-000000000001')]::bigint[],
      '15000000-0000-4000-8000-000000000018'
    )
  $$,
  '42501',
  null,
  'a viewer cannot bulk-move notes'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000002"}';
insert into hardening_numbers (name, value)
select 'source_before_move', current_version
from public.decks where id = (select id from hardening_ids where name = 'source_deck');
insert into hardening_numbers (name, value)
select 'target_before_move', current_version
from public.decks where id = (select id from hardening_ids where name = 'target_deck');
select lives_ok(
  $$
    select public.current_bulk_move_notes(
      (select id from hardening_ids where name = 'source_deck'),
      (select id from hardening_ids where name = 'target_deck'),
      array[
        '16000000-0000-4000-8000-000000000001',
        '16000000-0000-4000-8000-000000000002'
      ]::uuid[],
      array[
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000001'),
        (select version from public.notes where id = '16000000-0000-4000-8000-000000000002')
      ]::bigint[],
      '15000000-0000-4000-8000-000000000019'
    )
  $$,
  'an editor atomically moves a bounded selection between editable decks'
);
select is(
  (select count(*)::integer from public.notes
    where id in (
      '16000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000002'
    )
      and deck_id = (select id from hardening_ids where name = 'target_deck')),
  2,
  'bulk move changes both note deck IDs atomically'
);
select is(
  (
    select count(*)::integer
    from hardening_card_ids as before
    join public.cards as card
      on card.id = before.card_id and card.note_id = before.note_id
    where card.active and card.deleted_at is null
  ),
  2,
  'bulk move preserves stable generated card IDs'
);
select is(
  (
    select count(*)::integer
    from public.note_tags as note_tag
    join public.tags as tag on tag.id = note_tag.tag_id
    where note_tag.note_id in (
      '16000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000002'
    )
      and note_tag.deleted_at is null
      and tag.deleted_at is null
      and tag.deck_id = (select id from hardening_ids where name = 'target_deck')
      and tag.normalized_name = 'shared tag'
  ),
  2,
  'bulk move remaps active tags into the destination deck namespace'
);
select is(
  (select current_version from public.decks
    where id = (select id from hardening_ids where name = 'source_deck')),
  (select value + 1 from hardening_numbers where name = 'source_before_move'),
  'bulk move creates exactly one new source deck head'
);
select is(
  (select current_version from public.decks
    where id = (select id from hardening_ids where name = 'target_deck')),
  (select value + 1 from hardening_numbers where name = 'target_before_move'),
  'bulk move creates exactly one new target deck head'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000001"}';
select ok(
  (
    select active_decks = 2
      and archived_decks = 1
      and notes = 4
      and cards = 4
      and folders = 1
    from public.current_get_library_counts()
  ),
  'library counts exactly match active/archived decks, live notes/cards, and folders'
);

select lives_ok(
  $$
    select public.current_publish_deck(
      (select id from hardening_ids where name = 'source_deck'),
      (select version from public.decks where id = (select id from hardening_ids where name = 'source_deck')),
      'public', '15000000-0000-4000-8000-000000000020'
    )
  $$,
  'the safe publication fixture publishes through the manager boundary'
);
insert into hardening_ids (name, id)
select 'source_public_id', public_id
from public.decks where id = (select id from hardening_ids where name = 'source_deck');

select is(
  (
    select count(*)::integer
    from public.card_publications as publication
    join public.cards as card on card.id = publication.card_public_id
    where publication.deck_public_id = (
      select id from hardening_ids where name = 'source_public_id'
    )
  ),
  0,
  'published card IDs are derived and never reuse internal card row IDs'
);
insert into hardening_public_card_ids (generation_key, card_public_id)
select publication.generation_key, publication.card_public_id
from public.card_publications as publication
where publication.deck_public_id = (
  select id from hardening_ids where name = 'source_public_id'
);

select ok(
  (
    select field_values ? 'Term'
      and field_values ? 'Definition'
      and not (field_values ? 'Secret')
    from public.card_publications
    where deck_public_id = (select id from hardening_ids where name = 'source_public_id')
      and generation_key = 'g1:custom:definition'
  ),
  'publication projects only custom fields referenced by the selected template'
);
select ok(
  (
    select pg_catalog.strpos(
        card_payload::text,
        (select id::text from hardening_ids where name = 'media')
      ) = 0
      and pg_catalog.strpos(
        card_payload::text,
        (select id::text from hardening_ids where name = 'media_public_id')
      ) > 0
    from public.card_publications
    where deck_public_id = (select id from hardening_ids where name = 'source_public_id')
      and generation_key = 'g1:image_occlusion:nucleus'
  ),
  'nested card payload media IDs are rewritten from internal to public identities'
);

select lives_ok(
  $$
    select public.current_publish_deck(
      (select id from hardening_ids where name = 'source_deck'),
      (select version from public.decks where id = (select id from hardening_ids where name = 'source_deck')),
      'public', '15000000-0000-4000-8000-000000000021'
    )
  $$,
  'republishing the unchanged source deck succeeds'
);
select is(
  (
    select count(*)::integer
    from hardening_public_card_ids as before
    join public.card_publications as publication
      on publication.generation_key = before.generation_key
      and publication.card_public_id = before.card_public_id
    where publication.deck_public_id = (
      select id from hardening_ids where name = 'source_public_id'
    )
  ),
  (select count(*)::integer from hardening_public_card_ids),
  'derived public card IDs remain stable across publication replacement'
);
reset role;

set local role anon;
select ok(
  not exists(
    select 1
    from public.get_public_deck_media(
      (select id from hardening_ids where name = 'source_public_id')
    ) as media
    where pg_catalog.to_jsonb(media) ?| array[
      'storage_bucket','storage_path','path','media_asset_id','owner_account_id'
    ]
  ),
  'anonymous public media metadata exposes no internal ID or storage locator'
);
select ok(
  not exists(
    select 1 from public.published_media as media
    where pg_catalog.to_jsonb(media) ?| array[
      'storage_bucket','storage_path','path','media_asset_id','owner_account_id'
    ]
  ),
  'the enumerable public media view exposes no internal storage locator'
);
select throws_ok(
  $$
    select * from public.admin_get_public_deck_media_storage(
      (select id from hardening_ids where name = 'source_public_id')
    )
  $$,
  '42501',
  null,
  'anonymous callers cannot invoke the public-media storage locator'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"12000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$
    select * from public.admin_get_public_deck_media_storage(
      (select id from hardening_ids where name = 'source_public_id')
    )
  $$,
  '42501',
  null,
  'authenticated browser callers cannot invoke the service media locator'
);
reset role;

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.admin_get_public_deck_media_storage(
      (select id from hardening_ids where name = 'source_public_id')
    ) as locator
    where locator.media_public_id = (select id from hardening_ids where name = 'media_public_id')
      and locator.storage_bucket = 'lumen-content-media'
      and locator.storage_path = (select value from hardening_text where name = 'media_storage_path')
  ),
  1,
  'the service-only locator resolves the exact verified published media object'
);
reset role;

select * from finish();
rollback;
