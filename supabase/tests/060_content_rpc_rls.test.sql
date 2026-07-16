begin;

select no_plan();

create temporary table content_fixture_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on content_fixture_ids to anon, authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
    'content-owner@example.test', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
    'content-attacker@example.test', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set display_name = case id
      when '81000000-0000-0000-0000-000000000001' then 'Content Owner'
      else 'Content Attacker'
    end,
    handle = case id
      when '81000000-0000-0000-0000-000000000001' then 'content_owner'
      else 'content_attacker'
    end,
    age_band = 'adult', account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id in (
  '81000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '82000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );

insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values
  (
    '83000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    'Owner browser', 'pgTAP', '84000000-0000-0000-0000-000000000001'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000002',
    'Attacker browser', 'pgTAP', '84000000-0000-0000-0000-000000000002'
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';

insert into content_fixture_ids (name, id)
select 'root_folder', folder.id
from public.current_create_folder(
  'Courses', null, '85000000-0000-0000-0000-000000000001'
) as folder;
insert into content_fixture_ids (name, id)
select 'child_folder', folder.id
from public.current_create_folder(
  'Biology', (select id from content_fixture_ids where name = 'root_folder'),
  '85000000-0000-0000-0000-000000000002'
) as folder;

select throws_ok(
  pg_catalog.format(
    'select public.current_update_folder(%L, 1, %L, %L, %L)',
    (select id from content_fixture_ids where name = 'root_folder'),
    'Courses',
    (select id from content_fixture_ids where name = 'child_folder'),
    '85000000-0000-0000-0000-000000000003'
  ),
  '23514',
  'folder cycle is not allowed',
  'folder hierarchy rejects a descendant-to-ancestor cycle'
);

insert into content_fixture_ids (name, id)
select 'deck', deck.id
from public.current_create_deck(
  'Cell biology',
  '{"schemaVersion":1,"type":"doc","content":[],"plainText":"A cell deck"}'::jsonb,
  (select id from content_fixture_ids where name = 'child_folder'),
  'private',
  '85000000-0000-0000-0000-000000000004'
) as deck;

select is(
  (
    select note_type.code from public.decks as deck
    join public.note_types as note_type on note_type.id = deck.default_note_type_id
    where deck.id = (select id from content_fixture_ids where name = 'deck')
  ),
  'basic',
  'deck creation seeds the usable Basic note type by stable code'
);
select is(
  (select theme from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
  'neutral',
  'new decks receive the neutral constrained deck theme'
);
select is(
  (
    select id from public.current_create_deck(
      'Cell biology',
      '{"schemaVersion":1,"type":"doc","content":[],"plainText":"A cell deck"}'::jsonb,
      (select id from content_fixture_ids where name = 'child_folder'),
      'private',
      '85000000-0000-0000-0000-000000000004'
    )
  ),
  (select id from content_fixture_ids where name = 'deck'),
  'deck creation is idempotent'
);
select is(
  (select count(*)::integer from public.decks),
  1,
  'idempotent deck creation does not duplicate content'
);

select throws_ok(
  $$
    insert into public.decks (
      owner_account_id, title, slug, default_note_type_id, content_hash
    ) values (
      auth.uid(), 'Bypass', 'bypass',
      '02000000-0000-4000-8000-000000000001',
      repeat('0', 64)
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot bypass RPCs with a direct deck insert'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000001',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"What is a cell?","normalizedText":"what is a cell?","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"The basic unit of life.","normalizedText":"the basic unit of life.","position":1}
      }'::jsonb,
      '{
        "authoringData":{"kind":"basic"},
        "sourceReference":"Biology text, chapter 1",
        "sourceReferences":[{
          "semanticKey":"book-1","citationDoc":{"schemaVersion":1,"type":"citation"},
          "title":"Biology text","author":"Example Author","url":"https://example.test/book","position":0
        }]
      }'::jsonb,
      array['Cells','Foundations']::text[],
      '[]'::jsonb,
      '85000000-0000-0000-0000-000000000005'
    )
  $$,
  'a Basic note is persisted and reconciled atomically'
);

select is(
  (select card_payload from public.notes where id = '86000000-0000-0000-0000-000000000001'),
  '{"kind":"basic"}'::jsonb,
  'stored card_payload equals transport authoringData exactly'
);
select is(
  (select source_reference from public.notes where id = '86000000-0000-0000-0000-000000000001'),
  'Biology text, chapter 1',
  'the concise source reference is stored outside authoringData'
);
select is(
  (select count(*)::integer from public.source_references
    where note_id = '86000000-0000-0000-0000-000000000001' and deleted_at is null),
  1,
  'structured citations normalize outside authoringData'
);
select is(
  (select generation_key from public.cards
    where note_id = '86000000-0000-0000-0000-000000000001' and active),
  'g1:basic:forward',
  'Basic generation identity matches the domain g1 contract'
);
insert into content_fixture_ids (name, id)
select 'basic_card', id from public.cards
where note_id = '86000000-0000-0000-0000-000000000001' and active;

select throws_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000001', 'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"stale","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"stale","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"basic"}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000006'
    )
  $$,
  'P0001',
  'content version conflict',
  'stale optimistic note versions fail with a machine-readable conflict boundary'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000001', 'basic', 1,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"What is a cell membrane?","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"A selectively permeable boundary.","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"basic"}}'::jsonb,
      array['Cells']::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000007'
    )
  $$,
  'a valid optimistic note update succeeds'
);
select is(
  (select id from public.cards
    where note_id = '86000000-0000-0000-0000-000000000001' and active),
  (select id from content_fixture_ids where name = 'basic_card'),
  'nonstructural note edits preserve the generated card ID'
);
select is(
  (select count(*)::integer from public.note_revisions
    where note_id = '86000000-0000-0000-0000-000000000001'),
  1,
  'note update records immutable revision history'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000002', 'optional_reversed', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"mitosis","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"cell division","position":1},
        "AddReverse":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"true","normalizedText":"true","position":2}
      }'::jsonb,
      '{"authoringData":{"kind":"optional_reversed"}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000008'
    )
  $$,
  'optional reverse note persists'
);
select is(
  (select pg_catalog.array_agg(generation_key order by generation_key)
    from public.cards where note_id = '86000000-0000-0000-0000-000000000002' and active),
  array['g1:optional_reversed:forward','g1:optional_reversed:reverse']::text[],
  'optional reverse creates stable forward and reverse siblings when enabled'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000003', 'cloze', 0,
      '{
        "Text":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Cells contain nuclei.","position":0}
      }'::jsonb,
      '{"authoringData":{"kind":"cloze","clozes":[
        {"semanticKey":"term:one","ranges":[{"from":0,"to":5}]},
        {"semanticKey":"term-two","ranges":[{"from":14,"to":20}]}
      ]}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000009'
    )
  $$,
  'multiple semantic cloze groups persist'
);
select is(
  (select pg_catalog.array_agg(generation_key order by generation_key)
    from public.cards where note_id = '86000000-0000-0000-0000-000000000003' and active),
  array['g1:cloze:term%3Aone','g1:cloze:term-two']::text[],
  'cloze siblings use URI-encoded domain generation identities'
);

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000004', 'diagram', 0,
      '{
        "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Label the cell","position":0},
        "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Cell diagram","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"diagram","hotspots":[{
        "semanticKey":"nucleus","shape":{"type":"rectangle","x":0.1,"y":0.2,"width":0.2,"height":0.2},
        "label":"Nucleus","aliases":["cell nucleus"],"promptDirection":"bidirectional"
      }]}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000010'
    )
  $$,
  'normalized bidirectional diagram hotspot persists'
);
select is(
  (select pg_catalog.array_agg(generation_key order by generation_key)
    from public.cards where note_id = '86000000-0000-0000-0000-000000000004' and active),
  array[
    'g1:diagram:nucleus%3Alabel_to_region',
    'g1:diagram:nucleus%3Aregion_to_label'
  ]::text[],
  'bidirectional hotspots generate two exact domain identities'
);

insert into content_fixture_ids (name, id)
select 'media', asset.id
from public.current_register_media_asset(
  repeat('a', 64), 'image/png', 'image', 1024, 20, 20, null,
  'Cell illustration', '85000000-0000-0000-0000-000000000011'
) as asset;
select throws_ok(
  $$
    select public.admin_finalize_media_asset(
      auth.uid(), (select id from content_fixture_ids where name = 'media'),
      repeat('a', 64), 'image/png', true,
      '85000000-0000-0000-0000-000000000012'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot self-assert magic-byte verification'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_finalize_media_asset(
      '81000000-0000-0000-0000-000000000001',
      (select id from content_fixture_ids where name = 'media'),
      repeat('a', 64), 'image/png', true,
      '85000000-0000-0000-0000-000000000012'
    )
  $$,
  'service media finalization verifies hash and detected MIME'
);
reset role;
select ok(
  (select status = 'ready'
      and reference_count = 0
      and delete_after between pg_catalog.now() + interval '6 days 23 hours'
        and pg_catalog.now() + interval '7 days 1 hour'
    from public.media_assets
    where id = (select id from content_fixture_ids where name = 'media')),
  'verified but unreferenced media receives a delayed orphan-deletion deadline'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
reset role;
select lives_ok(
  $$
    select public.current_link_media(
      (select id from content_fixture_ids where name = 'media'),
      'deck', (select id from content_fixture_ids where name = 'deck'),
      'attachment', 0, 'Cell illustration',
      '85000000-0000-0000-0000-000000000013'
    )
  $$,
  'trusted atomic-wrapper internals can link verified media to an editable deck'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
select is(
  (select reference_count from public.media_assets
    where id = (select id from content_fixture_ids where name = 'media')),
  1,
  'media linking increments the maintained reference count'
);
select is(
  (select delete_after from public.media_assets
    where id = (select id from content_fixture_ids where name = 'media')),
  null::timestamptz,
  'media linking clears the orphan-deletion deadline'
);

select lives_ok(
  $$
    select public.current_publish_deck(
      (select id from content_fixture_ids where name = 'deck'),
      (select version from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
      'public', '85000000-0000-0000-0000-000000000014'
    )
  $$,
  'authorized publication freezes deck, card, and media projections'
);
insert into content_fixture_ids (name, id)
select 'deck_public_id', public_id from public.decks
where id = (select id from content_fixture_ids where name = 'deck');
select is(
  (select count(*)::integer from public.card_publications
    where deck_public_id = (select id from content_fixture_ids where name = 'deck_public_id')),
  (select card_count from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
  'published card projection contains exactly the frozen active cards'
);
select is(
  (select count(*)::integer from public.media_publications
    where deck_public_id = (select id from content_fixture_ids where name = 'deck_public_id')),
  1,
  'only explicitly linked verified media enters the published projection'
);
reset role;

set local role anon;
select is(
  (select count(*)::integer from public.published_decks),
  1,
  'anonymous discovery sees the public frozen deck projection'
);
select is(
  (select count(*)::integer from public.get_public_deck(
    (select id from content_fixture_ids where name = 'deck_public_id')
  )),
  1,
  'anonymous exact public-ID lookup returns published metadata'
);
select is(
  (select count(*)::integer from public.get_public_deck_cards(
    (select id from content_fixture_ids where name = 'deck_public_id')
  )),
  7,
  'anonymous exact lookup returns only the seven frozen card projections'
);
select ok(
  (
    select media.media_public_id::text not like '%81000000-0000-0000-0000-000000000001%'
      and media.mime_type = 'image/png'
    from public.get_public_deck_media(
      (select id from content_fixture_ids where name = 'deck_public_id')
    ) as media
  ),
  'public media metadata uses an opaque public ID without exposing a storage locator'
);
select throws_ok(
  $$select * from public.decks$$,
  '42501',
  null,
  'anonymous visitors cannot query live deck rows'
);
select throws_ok(
  $$select * from public.deck_versions$$,
  '42501',
  null,
  'anonymous visitors cannot query version history'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::integer from public.decks),
  0,
  'an unrelated authenticated account cannot read live rows for a public deck'
);
select is(
  (select count(*)::integer from public.notes),
  0,
  'an unrelated authenticated account cannot read public-deck drafts'
);
select is(
  (select count(*)::integer from public.deck_versions),
  0,
  'an unrelated authenticated account cannot read public-deck history'
);
select is(
  (select count(*)::integer from public.published_decks),
  1,
  'an unrelated account uses the same frozen public projection as anonymous visitors'
);
select throws_ok(
  $$
    select public.current_delete_note(
      '86000000-0000-0000-0000-000000000001', 2,
      '85000000-0000-0000-0000-000000000015'
    )
  $$,
  '42501',
  'note is unavailable',
  'an unrelated authenticated account cannot mutate an owner note'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000001', 'basic', 2,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Private draft question","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Private draft answer","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"basic"}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000016'
    )
  $$,
  'an owner can create a draft after publication'
);
select is(
  (
    select field_values -> 'Front' ->> 'plainText'
    from public.card_publications
    where deck_public_id = (select id from content_fixture_ids where name = 'deck_public_id')
      and generation_key = 'g1:basic:forward'
  ),
  'What is a cell membrane?',
  'draft edits do not mutate the frozen public projection'
);

select lives_ok(
  $$
    select public.current_publish_deck(
      (select id from content_fixture_ids where name = 'deck'),
      (select version from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
      'unlisted', '85000000-0000-0000-0000-000000000017'
    )
  $$,
  'an owner can intentionally republish the current version as unlisted'
);
reset role;

set local role anon;
select is(
  (select count(*)::integer from public.published_decks),
  0,
  'unlisted publications are absent from enumerable discovery views'
);
select is(
  (select count(*)::integer from public.get_public_deck(
    (select id from content_fixture_ids where name = 'deck_public_id')
  )),
  1,
  'an exact opaque public ID resolves an unlisted publication'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$
    select public.current_restore_deck_version(
      (select id from content_fixture_ids where name = 'deck'),
      (select version from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
      3,
      '85000000-0000-0000-0000-000000000018'
    )
  $$,
  'an authorized manager can restore a prior immutable deck version'
);
select is(
  (
    select field_value.plain_text
    from public.note_field_values as field_value
    join public.note_type_fields as field on field.id = field_value.field_id
    where field_value.note_id = '86000000-0000-0000-0000-000000000001'
      and field.field_key = 'Front'
      and field_value.deleted_at is null
  ),
  'What is a cell membrane?',
  'version restore replaces the live content with the selected snapshot'
);
select is(
  (select note_count from public.decks where id = (select id from content_fixture_ids where name = 'deck')),
  1,
  'version restore removes notes that were absent from the selected snapshot'
);
select ok(
  exists(
    select 1
    from public.deck_versions as deck_version
    join public.decks as deck on deck.id = deck_version.deck_id
    where deck.id = (select id from content_fixture_ids where name = 'deck')
      and deck_version.version_number = deck.current_version
      and deck_version.restored_from_version = 3
      and deck_version.change_kind = 'deck_version_restored'
  ),
  'version restore creates a new immutable head linked to the restored version'
);

reset role;
create temporary table card_type_rpc_cases (
  note_id uuid primary key,
  note_type_code text not null,
  fields jsonb not null,
  payload jsonb not null,
  expected_keys text[] not null,
  idempotency_key uuid not null
) on commit drop;
grant select on card_type_rpc_cases to authenticated;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
insert into content_fixture_ids (name, id)
select 'audio_media', asset.id
from public.current_register_media_asset(
  repeat('c', 64), 'audio/mpeg', 'audio', 4096, null, null, 1200,
  null, '85000000-0000-0000-0000-000000000019'
) as asset;
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_finalize_media_asset(
      '81000000-0000-0000-0000-000000000001',
      (select id from content_fixture_ids where name = 'audio_media'),
      repeat('c', 64), 'audio/mpeg', true,
      '85000000-0000-0000-0000-000000000020'
    )
  $$,
  'audio media is verified for specialized card persistence'
);
reset role;

insert into card_type_rpc_cases values
  (
    '86000000-0000-0000-0000-000000000005', 'basic_reversed',
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"front","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"back","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic_reversed"}}'::jsonb,
    array['g1:basic_reversed:forward','g1:basic_reversed:reverse']::text[],
    '85000000-0000-0000-0000-000000000021'
  ),
  (
    '86000000-0000-0000-0000-000000000006', 'bidirectional',
    '{
      "SideA":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"alpha","position":0},
      "SideB":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"beta","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"bidirectional"}}'::jsonb,
    array['g1:bidirectional:a_to_b','g1:bidirectional:b_to_a']::text[],
    '85000000-0000-0000-0000-000000000022'
  ),
  (
    '86000000-0000-0000-0000-000000000007', 'typed_answer',
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Spell mitochondrion","position":0},
      "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"mitochondrion","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"typed_answer","acceptedAnswers":["mitochondrion"]}}'::jsonb,
    array['g1:typed_answer:typed']::text[],
    '85000000-0000-0000-0000-000000000023'
  ),
  (
    '86000000-0000-0000-0000-000000000008', 'image_occlusion',
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Identify the organelle","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"A labeled cell","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"image_occlusion","mode":"hide_all_reveal_one","occlusions":[
      {"semanticKey":"mask-a","groupKey":"nucleus","shape":{"type":"rectangle","x":0.1,"y":0.1,"width":0.2,"height":0.2},"label":"Mask A","altText":"Upper-left region"},
      {"semanticKey":"mask-b","groupKey":"nucleus","shape":{"type":"ellipse","centerX":0.6,"centerY":0.6,"radiusX":0.1,"radiusY":0.1},"label":"Mask B","altText":"Central region"}
    ]}}'::jsonb,
    array['g1:image_occlusion:nucleus']::text[],
    '85000000-0000-0000-0000-000000000024'
  ),
  (
    '86000000-0000-0000-0000-000000000009', 'multiple_choice',
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Choose one","position":0}}'::jsonb,
    '{"authoringData":{"kind":"multiple_choice","choices":[
      {"semanticKey":"choice-a","content":{"schemaVersion":1,"type":"doc","content":[]},"isCorrect":true,"position":0},
      {"semanticKey":"choice-b","content":{"schemaVersion":1,"type":"doc","content":[]},"isCorrect":false,"position":1}
    ]}}'::jsonb,
    array['g1:multiple_choice:choice']::text[],
    '85000000-0000-0000-0000-000000000025'
  ),
  (
    '86000000-0000-0000-0000-000000000010', 'select_all',
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Choose all","position":0}}'::jsonb,
    '{"authoringData":{"kind":"select_all","choices":[
      {"semanticKey":"select-a","content":{"schemaVersion":1,"type":"doc","content":[]},"isCorrect":true,"position":0},
      {"semanticKey":"select-b","content":{"schemaVersion":1,"type":"doc","content":[]},"isCorrect":true,"position":1},
      {"semanticKey":"select-c","content":{"schemaVersion":1,"type":"doc","content":[]},"isCorrect":false,"position":2}
    ]}}'::jsonb,
    array['g1:select_all:choice']::text[],
    '85000000-0000-0000-0000-000000000026'
  ),
  (
    '86000000-0000-0000-0000-000000000011', 'true_false',
    '{"Statement":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Cells have membranes","position":0}}'::jsonb,
    '{"authoringData":{"kind":"true_false","answer":true}}'::jsonb,
    array['g1:true_false:boolean']::text[],
    '85000000-0000-0000-0000-000000000027'
  ),
  (
    '86000000-0000-0000-0000-000000000012', 'ordering',
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Order mitosis","position":0}}'::jsonb,
    '{"authoringData":{"kind":"ordering","orderingItems":[
      {"semanticKey":"prophase","content":{"schemaVersion":1,"type":"doc","content":[]},"position":0},
      {"semanticKey":"metaphase","content":{"schemaVersion":1,"type":"doc","content":[]},"position":1},
      {"semanticKey":"anaphase","content":{"schemaVersion":1,"type":"doc","content":[]},"position":2}
    ]}}'::jsonb,
    array['g1:ordering:sequence']::text[],
    '85000000-0000-0000-0000-000000000028'
  ),
  (
    '86000000-0000-0000-0000-000000000013', 'list_answer',
    '{"Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Name organelles","position":0}}'::jsonb,
    '{"authoringData":{"kind":"list_answer","listItems":[
      {"semanticKey":"nucleus","answer":"Nucleus","aliases":["cell nucleus"],"required":true,"position":0},
      {"semanticKey":"ribosome","answer":"Ribosome","aliases":[],"required":false,"position":1}
    ]}}'::jsonb,
    array['g1:list_answer:list']::text[],
    '85000000-0000-0000-0000-000000000029'
  ),
  (
    '86000000-0000-0000-0000-000000000014', 'audio_prompt',
    '{
      "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"cell","position":1},
      "Transcript":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"cell","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'audio_prompt',
        'audioPrompt', pg_catalog.jsonb_build_object(
          'assetId', (select id::text from content_fixture_ids where name = 'audio_media'),
          'transcript', 'cell',
          'answer', pg_catalog.jsonb_build_object('schemaVersion', 1, 'type', 'doc', 'content', '[]'::jsonb)
        )
      )
    ),
    array['g1:audio_prompt:audio']::text[],
    '85000000-0000-0000-0000-000000000030'
  ),
  (
    '86000000-0000-0000-0000-000000000015', 'pronunciation',
    '{"Text":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"mitochondria","position":0}}'::jsonb,
    '{"authoringData":{"kind":"pronunciation","pronunciationPrompt":{"text":"mitochondria","language":"en-US","ttsAllowed":true,"fallbackAnswer":"mitochondria"}}}'::jsonb,
    array['g1:pronunciation:pronunciation']::text[],
    '85000000-0000-0000-0000-000000000031'
  ),
  (
    '86000000-0000-0000-0000-000000000016', 'drawing',
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Draw a cell","position":0},
      "AlternativeText":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"A round cell with nucleus","position":2}
    }'::jsonb,
    '{"authoringData":{"kind":"drawing","drawingLayers":[{
      "semanticKey":"guide","strokes":[{
        "semanticKey":"stroke-1","color":"#223344","width":4,
        "points":[{"x":0.1,"y":0.2,"pressure":0.5,"timeOffsetMs":0},{"x":0.8,"y":0.7,"pressure":0.7,"timeOffsetMs":100}]
      }],"opacity":0.5,"position":0
    }]}}'::jsonb,
    array['g1:drawing:drawing']::text[],
    '85000000-0000-0000-0000-000000000032'
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"82000000-0000-0000-0000-000000000001"}';
select lives_ok(
  pg_catalog.format(
    'select public.current_upsert_note_with_media(%L, %L, %L, 0, %L::jsonb, %L::jsonb, %L::text[], %L::jsonb, %L)',
    (select id from content_fixture_ids where name = 'deck'),
    test_case.note_id,
    test_case.note_type_code,
    test_case.fields,
    test_case.payload,
    '{}'::text[],
    '[]'::jsonb,
    test_case.idempotency_key
  ),
  test_case.note_type_code || ' persists through the actor-derived note RPC'
)
from card_type_rpc_cases as test_case
order by test_case.note_id;

select is(
  (
    select pg_catalog.array_agg(card.generation_key order by card.generation_key)
    from public.cards as card
    where card.note_id = test_case.note_id and card.active and card.deleted_at is null
  ),
  test_case.expected_keys,
  test_case.note_type_code || ' uses the exact domain generation identities'
)
from card_type_rpc_cases as test_case
order by test_case.note_id;

select is(
  (select count(*)::integer from public.image_occlusions
    where note_id = '86000000-0000-0000-0000-000000000008' and deleted_at is null),
  2,
  'image occlusion persists both normalized masks while grouping one sibling'
);
select is(
  (select mode from public.image_occlusions
    where note_id = '86000000-0000-0000-0000-000000000008' and deleted_at is null limit 1),
  'hide_all_reveal_one'::public.occlusion_mode,
  'image occlusion persists the domain mode property'
);
select is(
  (select count(*)::integer from public.card_choices
    where note_id in (
      '86000000-0000-0000-0000-000000000009',
      '86000000-0000-0000-0000-000000000010'
    ) and deleted_at is null),
  5,
  'multiple-choice and select-all correctness metadata normalizes'
);
select is(
  (select count(*)::integer from public.ordering_items
    where note_id = '86000000-0000-0000-0000-000000000012' and deleted_at is null),
  3,
  'ordering items normalize with stable semantic keys'
);
select is(
  (select count(*)::integer from public.list_answer_items
    where note_id = '86000000-0000-0000-0000-000000000013' and deleted_at is null),
  2,
  'list answers normalize required and optional aliases'
);
select ok(
  exists(select 1 from public.audio_prompts
    where note_id = '86000000-0000-0000-0000-000000000014' and deleted_at is null)
  and exists(select 1 from public.pronunciation_prompts
    where note_id = '86000000-0000-0000-0000-000000000015' and deleted_at is null)
  and exists(select 1 from public.drawing_reference_layers
    where note_id = '86000000-0000-0000-0000-000000000016' and deleted_at is null),
  'audio, pronunciation, and drawing specialized children persist'
);
select throws_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from content_fixture_ids where name = 'deck'),
      '86000000-0000-0000-0000-000000000017', 'drawing', 0,
      '{
        "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Invalid drawing","position":0},
        "AlternativeText":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Fallback","position":2}
      }'::jsonb,
      '{"authoringData":{"kind":"drawing","drawingLayers":[{
        "semanticKey":"bad","strokes":[{"semanticKey":"bad-stroke","color":"#000000","width":0.1,"points":[{"x":0.5,"y":0.5}]}],"opacity":1,"position":0
      }]}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '85000000-0000-0000-0000-000000000033'
    )
  $$,
  '22023',
  'drawing stroke metadata is invalid',
  'drawing persistence rejects stroke widths outside the 0.25-64 CSS-pixel contract'
);

insert into content_fixture_ids (name, id)
select 'conditional_custom_type', note_type.id
from public.current_create_note_type(
  'Conditional custom type', 'Tests empty-field sibling generation',
  '[
    {"fieldKey":"Prompt","label":"Prompt","fieldType":"rich_text","position":0,"required":true},
    {"fieldKey":"Extra","label":"Extra","fieldType":"rich_text","position":1,"required":false}
  ]'::jsonb,
  '[
    {"templateKey":"always","name":"Always","ordinal":0,"frontTemplate":"{{Prompt}}","backTemplate":"{{Extra}}"},
    {"templateKey":"when_empty","name":"When empty","ordinal":1,"frontTemplate":"{{Prompt}}","backTemplate":"{{Extra}}","generationCondition":{"field":"Extra","when":"empty"}}
  ]'::jsonb,
  '85000000-0000-0000-0000-000000000034'
) as note_type;
select lives_ok(
  pg_catalog.format(
    'select public.current_upsert_note_with_media(%L, %L, %L, 0, %L::jsonb, %L::jsonb, %L::text[], %L::jsonb, %L)',
    (select id from content_fixture_ids where name = 'deck'),
    '86000000-0000-0000-0000-000000000018',
    (select code from public.note_types where id = (select id from content_fixture_ids where name = 'conditional_custom_type')),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Prompt value","position":0},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"custom"}}'::jsonb,
    '{}'::text[],
    '[]'::jsonb,
    '85000000-0000-0000-0000-000000000035'
  ),
  'custom note conditions reconcile through the same note RPC'
);
select is(
  (select pg_catalog.array_agg(generation_key order by generation_key)
    from public.cards where note_id = '86000000-0000-0000-0000-000000000018' and active),
  array['g1:custom:always','g1:custom:when_empty']::text[],
  'empty custom fields generate the conditionally enabled sibling'
);
select lives_ok(
  pg_catalog.format(
    'select public.current_upsert_note_with_media(%L, %L, %L, 1, %L::jsonb, %L::jsonb, %L::text[], %L::jsonb, %L)',
    (select id from content_fixture_ids where name = 'deck'),
    '86000000-0000-0000-0000-000000000018',
    (select code from public.note_types where id = (select id from content_fixture_ids where name = 'conditional_custom_type')),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Prompt value","position":0},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Now populated","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"custom"}}'::jsonb,
    '{}'::text[],
    '[]'::jsonb,
    '85000000-0000-0000-0000-000000000036'
  ),
  'changing a conditional custom field reconciles the sibling set'
);
select is(
  (select pg_catalog.array_agg(generation_key order by generation_key)
    from public.cards where note_id = '86000000-0000-0000-0000-000000000018' and active),
  array['g1:custom:always']::text[],
  'obsolete conditional siblings deactivate while the stable sibling survives'
);
select * from finish();
rollback;
