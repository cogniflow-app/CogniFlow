begin;

select no_plan();

create temporary table version_media_ids (
  name text primary key,
  id uuid not null
) on commit drop;
create temporary table version_media_values (
  name text primary key,
  value text not null
) on commit drop;
create temporary table version_media_results (
  name text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update, delete
on version_media_ids, version_media_values, version_media_results
to authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '41000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'version-media@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
  pg_catalog.now(), pg_catalog.now(), false
);

update public.profiles
set display_name = 'Version Media Owner',
    handle = 'version_media_owner',
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id = '41000000-0000-4000-8000-000000000001';

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
);
insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values (
  '43000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  'Version media browser', 'pgTAP',
  '44000000-0000-4000-8000-000000000001'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '41000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'version-editor@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
  pg_catalog.now(), pg_catalog.now(), false
);
update public.profiles
set display_name = 'Version Media Editor',
    handle = 'version_media_editor',
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id = '41000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '42000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000002',
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
);
insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values (
  '43000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000002',
  '42000000-0000-4000-8000-000000000002',
  'Version editor browser', 'pgTAP',
  '44000000-0000-4000-8000-000000000002'
);

select lives_ok(
  $$select private.assert_card_payload_media_links(
    '{"authoringData":{"kind":"basic","assetIdentifier":"not-an-asset-key"}}'::jsonb,
    '[]'::jsonb,
    '41000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    null
  )$$,
  'media validation ignores unrelated property names instead of scanning JSON text'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

insert into version_media_ids (name, id)
select 'deck', deck.id
from public.current_create_deck(
  'Version media graph',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private',
  '44000000-0000-4000-8000-000000000002'
) as deck;

reset role;
insert into public.deck_members (deck_id, account_id, role, granted_by)
values (
  (select id from version_media_ids where name = 'deck'),
  '41000000-0000-4000-8000-000000000002',
  'editor',
  '41000000-0000-4000-8000-000000000001'
);
select ok(
  (
    select deck.content_hash = deck_version.content_hash
      and deck_version.content_snapshot = private.capture_deck_content(deck.id)
      and deck_version.content_hash = private.content_hash(
        deck_version.content_snapshot
      )
    from public.decks as deck
    join public.deck_versions as deck_version
      on deck_version.deck_id = deck.id
     and deck_version.version_number = deck.current_version
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'a newly created empty deck and its schema-two head have the same exact hash'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

insert into version_media_ids (name, id)
select 'asset_a', asset.id
from public.current_register_media_asset(
  repeat('a', 64), 'image/png', 'image', 1024, 32, 32, null,
  'Historical diagram A',
  '44000000-0000-4000-8000-000000000003'
) as asset;
insert into version_media_ids (name, id)
select 'asset_b', asset.id
from public.current_register_media_asset(
  repeat('b', 64), 'image/png', 'image', 1024, 32, 32, null,
  'Historical diagram B',
  '44000000-0000-4000-8000-000000000004'
) as asset;
insert into version_media_ids (name, id)
select 'audio_a', asset.id
from public.current_register_media_asset(
  repeat('c', 64), 'audio/webm', 'audio', 2048, null, null, 1000,
  'Historical audio A',
  '44000000-0000-4000-8000-000000000020'
) as asset;
insert into version_media_ids (name, id)
select 'audio_b', asset.id
from public.current_register_media_asset(
  repeat('d', 64), 'audio/webm', 'audio', 2048, null, null, 1000,
  'Historical audio B',
  '44000000-0000-4000-8000-000000000021'
) as asset;
insert into version_media_ids (name, id)
select 'asset_a_public', asset.public_id
from public.media_assets as asset
where asset.id = (select id from version_media_ids where name = 'asset_a');
insert into version_media_ids (name, id)
select 'asset_b_public', asset.public_id
from public.media_assets as asset
where asset.id = (select id from version_media_ids where name = 'asset_b');

reset role;
set local role service_role;
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '41000000-0000-4000-8000-000000000001',
    (select id from version_media_ids where name = 'asset_a'),
    repeat('a', 64), 'image/png', true,
    '44000000-0000-4000-8000-000000000005'
  )$$,
  'service verification prepares historical asset A'
);
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '41000000-0000-4000-8000-000000000001',
    (select id from version_media_ids where name = 'asset_b'),
    repeat('b', 64), 'image/png', true,
    '44000000-0000-4000-8000-000000000006'
  )$$,
  'service verification prepares historical asset B'
);
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '41000000-0000-4000-8000-000000000001',
    (select id from version_media_ids where name = 'audio_a'),
    repeat('c', 64), 'audio/webm', true,
    '44000000-0000-4000-8000-000000000023'
  )$$,
  'service verification prepares historical audio A'
);
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '41000000-0000-4000-8000-000000000001',
    (select id from version_media_ids where name = 'audio_b'),
    repeat('d', 64), 'audio/webm', true,
    '44000000-0000-4000-8000-000000000024'
  )$$,
  'service verification prepares historical audio B'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
insert into version_media_ids (name, id)
select 'foreign_asset', asset.id
from public.current_register_media_asset(
  repeat('e', 64), 'image/png', 'image', 1024, 32, 32, null,
  'Unrelated editor image',
  '44000000-0000-4000-8000-000000000022'
) as asset;
reset role;
set local role service_role;
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '41000000-0000-4000-8000-000000000002',
    (select id from version_media_ids where name = 'foreign_asset'),
    repeat('e', 64), 'image/png', true,
    '44000000-0000-4000-8000-000000000025'
  )$$,
  'service verification prepares an unrelated editor-owned image'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000090', 'image_occlusion', 0,
    '{}'::jsonb,
    '{"authoringData":{"kind":"image_occlusion","imageAssetId":"bogus"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '44000000-0000-4000-8000-000000000090'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'the browser RPC rejects a malformed embedded media identity'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000091', 'image_occlusion', 0,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'image_occlusion',
        'imageAssetId', (select id from version_media_ids where name = 'asset_a')
      )
    ),
    '{}'::text[], '[]'::jsonb,
    '44000000-0000-4000-8000-000000000091'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'the browser RPC rejects an embedded asset omitted from explicit links'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000092', 'basic', 0,
    '{}'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Extra link'
    )),
    '44000000-0000-4000-8000-000000000092'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'the browser RPC rejects an explicit link absent from authoring data'
);

select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000093', 'custom', 0,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'custom',
        'fields', pg_catalog.jsonb_build_object(
          'Media', pg_catalog.jsonb_build_object(
            'kind', 'media',
            'assetId', (select id from version_media_ids where name = 'asset_a'),
            'alt', 'Missing discriminator'
          )
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Missing discriminator'
    )),
    '44000000-0000-4000-8000-000000000093'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'custom media requires an explicit image-or-audio discriminator at the RPC boundary'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000094', 'custom', 0,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'custom',
        'fields', pg_catalog.jsonb_build_object(
          'Media', pg_catalog.jsonb_build_object(
            'kind', 'media', 'mediaKind', 'video',
            'assetId', (select id from version_media_ids where name = 'asset_a'),
            'alt', 'Forged discriminator'
          )
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Forged discriminator'
    )),
    '44000000-0000-4000-8000-000000000094'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'custom media rejects a forged discriminator at the RPC boundary'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000095', 'custom', 0,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'custom',
        'fields', pg_catalog.jsonb_build_object(
          'Media', pg_catalog.jsonb_build_object(
            'kind', 'media', 'mediaKind', 'audio',
            'assetId', (select id from version_media_ids where name = 'asset_a'),
            'alt', 'Kind mismatch'
          )
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Kind mismatch'
    )),
    '44000000-0000-4000-8000-000000000095'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'custom media kind must match the ready owner asset kind'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000096', 'basic', 0,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'basic',
        'legacyDoc', pg_catalog.jsonb_build_object(
          'type', 'audio',
          'attrs', pg_catalog.jsonb_build_object(
            'assetId', (select id from version_media_ids where name = 'asset_a'),
            'transcript', 'Wrong rich-media kind'
          )
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Wrong rich-media kind'
    )),
    '44000000-0000-4000-8000-000000000096'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'rich audio nodes cannot bind an image asset through the direct RPC'
);

select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000001', 'image_occlusion', 0,
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Locate A","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram A","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'image_occlusion', 'schemaVersion', 1,
        'imageAssetId', (select id from version_media_ids where name = 'asset_a'),
        'imageAlt', 'Historical diagram A',
        'mode', 'hide_one_reveal_others',
        'occlusions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'semanticKey', 'region', 'groupKey', 'region',
          'shape', '{"kind":"rectangle","x":0.1,"y":0.1,"width":0.2,"height":0.2}'::jsonb,
          'label', 'Region A', 'altText', 'Upper-left region'
        ))
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Historical diagram A'
    )),
    '44000000-0000-4000-8000-000000000007'
  )$$,
  'the initial note stores asset A through the atomic authoring boundary'
);
insert into version_media_values (name, value)
select 'version_a', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');

select ok(
  (
    select deck_version.content_snapshot ->> 'schemaVersion' = '2'
      and pg_catalog.jsonb_array_length(
        deck_version.content_snapshot -> 'mediaReferences'
      ) = 1
      and deck_version.content_snapshot #>> '{mediaReferences,0,mediaAssetId}' =
        (select id::text from version_media_ids where name = 'asset_a')
      and deck_version.content_hash = (
        select deck.content_hash
        from public.decks as deck
        where deck.id = deck_version.deck_id
      )
    from public.deck_versions as deck_version
    where deck_version.deck_id = (select id from version_media_ids where name = 'deck')
      and deck_version.version_number = (
        select value::bigint from version_media_values where name = 'version_a'
      )
  ),
  'the asset-A version snapshot contains its exact active explicit reference graph'
);

set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000001', 'image_occlusion',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000001'),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Locate A","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram A","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', (
        select note.card_payload
        from public.notes as note
        where note.id = '46000000-0000-4000-8000-000000000001'
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'inline', 'position', 7, 'altText', 'Historical diagram A'
    )),
    '44000000-0000-4000-8000-000000000030'
  )$$,
  'an editor can retain owner media while changing its link metadata'
);
select ok(
  exists(
    select 1
    from public.media_references as reference
    where reference.note_id = '46000000-0000-4000-8000-000000000001'
      and reference.media_asset_id = (
        select id from version_media_ids where name = 'asset_a'
      )
      and reference.purpose = 'inline'
      and reference.position = 7
      and reference.deleted_at is null
  ),
  'editor retention re-links the exact active same-note asset'
);
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000001', 'image_occlusion',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000001'),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Locate B","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram B","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', (
        select note.card_payload || pg_catalog.jsonb_build_object(
          'imageAssetId', (select id from version_media_ids where name = 'asset_b'),
          'imageAlt', 'Historical diagram B'
        )
        from public.notes as note
        where note.id = '46000000-0000-4000-8000-000000000001'
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_b'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Historical diagram B'
    )),
    '44000000-0000-4000-8000-000000000031'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'an editor cannot attach an unrelated owner asset by UUID'
);

reset role;
update public.media_assets
set status = 'deleting',
    delete_after = pg_catalog.now() + interval '7 days'
where id = (select id from version_media_ids where name = 'asset_b');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000001', 'image_occlusion',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000001'),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Locate B","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram B","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'image_occlusion', 'schemaVersion', 1,
        'imageAssetId', (select id from version_media_ids where name = 'asset_b'),
        'imageAlt', 'Historical diagram B',
        'mode', 'hide_one_reveal_others',
        'occlusions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'semanticKey', 'region', 'groupKey', 'region',
          'shape', '{"kind":"rectangle","x":0.2,"y":0.2,"width":0.3,"height":0.3}'::jsonb,
          'label', 'Region B', 'altText', 'Central region'
        ))
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_b'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Historical diagram B'
    )),
    '44000000-0000-4000-8000-000000000008'
  )$$,
  'editing the current note replaces asset A with asset B atomically'
);
select ok(
  (
    select asset.status = 'ready'
      and asset.delete_after is null
    from public.media_assets as asset
    where asset.id = (select id from version_media_ids where name = 'asset_b')
  ),
  'an unclaimed deleting asset is revived during its grace-period re-link'
);
insert into version_media_values (name, value)
select 'version_b', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');

select ok(
  (
    select pg_catalog.jsonb_array_length(
        deck_version.content_snapshot -> 'mediaReferences'
      ) = 1
      and deck_version.content_snapshot #>> '{mediaReferences,0,mediaAssetId}' =
        (select id::text from version_media_ids where name = 'asset_b')
    from public.deck_versions as deck_version
    where deck_version.deck_id = (select id from version_media_ids where name = 'deck')
      and deck_version.version_number = (
        select value::bigint from version_media_values where name = 'version_b'
      )
  ),
  'the post-link finalizer replaces the pre-link graph in the asset-B snapshot'
);

set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000001', 'image_occlusion',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000001'),
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Locate A again","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram A","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', (
        select note.card_payload || pg_catalog.jsonb_build_object(
          'imageAssetId', (select id from version_media_ids where name = 'asset_a'),
          'imageAlt', 'Historical diagram A'
        )
        from public.notes as note
        where note.id = '46000000-0000-4000-8000-000000000001'
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Historical diagram A'
    )),
    '44000000-0000-4000-8000-000000000032'
  )$$,
  '22023',
  'note media links do not match authoring payload',
  'an editor cannot resurrect an old tombstoned collaborator asset'
);
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.current_delete_note(
    '46000000-0000-4000-8000-000000000001',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000001'),
    '44000000-0000-4000-8000-000000000009'
  )$$,
  'deleting the current note retires its explicit media graph'
);
insert into version_media_values (name, value)
select 'version_deleted', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
select ok(
  (
    select pg_catalog.jsonb_array_length(
        deck_version.content_snapshot -> 'notes'
      ) = 0
      and pg_catalog.jsonb_array_length(
        deck_version.content_snapshot -> 'mediaReferences'
      ) = 0
    from public.deck_versions as deck_version
    where deck_version.deck_id = (select id from version_media_ids where name = 'deck')
      and deck_version.version_number = (
        select value::bigint from version_media_values where name = 'version_deleted'
      )
  ),
  'the deletion head snapshots neither the deleted note nor its retired reference'
);

reset role;
insert into version_media_values (name, value) values
  ('legacy_a', '9001'),
  ('legacy_empty', '9002'),
  ('legacy_missing', '9003'),
  ('legacy_foreign', '9004');

insert into public.deck_versions (
  deck_id, version_number, created_by, change_kind, summary,
  deck_snapshot, content_snapshot, content_hash, idempotency_key, created_at
)
select source.deck_id, 9001, source.created_by, 'legacy_fixture',
  'Schema-one embedded media fixture', source.deck_snapshot,
  legacy.snapshot, private.content_hash(legacy.snapshot),
  '44000000-0000-4000-8000-000000000040', source.created_at
from public.deck_versions as source
cross join lateral (
  select (source.content_snapshot - 'mediaReferences')
    || '{"schemaVersion":1}'::jsonb as snapshot
) as legacy
where source.deck_id = (select id from version_media_ids where name = 'deck')
  and source.version_number = (
    select value::bigint from version_media_values where name = 'version_a'
  );
insert into public.deck_versions (
  deck_id, version_number, created_by, change_kind, summary,
  deck_snapshot, content_snapshot, content_hash, idempotency_key, created_at
)
select source.deck_id, 9002, source.created_by, 'legacy_fixture',
  'Schema-one media-free fixture', source.deck_snapshot,
  legacy.snapshot, private.content_hash(legacy.snapshot),
  '44000000-0000-4000-8000-000000000041', source.created_at
from public.deck_versions as source
cross join lateral (
  select (source.content_snapshot - 'mediaReferences')
    || '{"schemaVersion":1}'::jsonb as snapshot
) as legacy
where source.deck_id = (select id from version_media_ids where name = 'deck')
  and source.version_number = (
    select value::bigint from version_media_values where name = 'version_deleted'
  );
insert into public.deck_versions (
  deck_id, version_number, created_by, change_kind, summary,
  deck_snapshot, content_snapshot, content_hash, idempotency_key, created_at
)
select source.deck_id, 9003, source.created_by, 'legacy_fixture',
  'Schema-one missing media fixture', source.deck_snapshot,
  legacy.snapshot, private.content_hash(legacy.snapshot),
  '44000000-0000-4000-8000-000000000042', source.created_at
from public.deck_versions as source
cross join lateral (
  select pg_catalog.jsonb_set(
    (source.content_snapshot - 'mediaReferences')
      || '{"schemaVersion":1}'::jsonb,
    '{notes,0,cardPayload,imageAssetId}',
    '"4f000000-0000-4000-8000-000000000001"'::jsonb
  ) as snapshot
) as legacy
where source.deck_id = (select id from version_media_ids where name = 'deck')
  and source.version_number = (
    select value::bigint from version_media_values where name = 'version_a'
  );
insert into public.deck_versions (
  deck_id, version_number, created_by, change_kind, summary,
  deck_snapshot, content_snapshot, content_hash, idempotency_key, created_at
)
select source.deck_id, 9004, source.created_by, 'legacy_fixture',
  'Schema-one foreign media fixture', source.deck_snapshot,
  legacy.snapshot, private.content_hash(legacy.snapshot),
  '44000000-0000-4000-8000-000000000043', source.created_at
from public.deck_versions as source
cross join lateral (
  select pg_catalog.jsonb_set(
    (source.content_snapshot - 'mediaReferences')
      || '{"schemaVersion":1}'::jsonb,
    '{notes,0,cardPayload,imageAssetId}',
    pg_catalog.to_jsonb((
      select id::text from version_media_ids where name = 'foreign_asset'
    ))
  ) as snapshot
) as legacy
where source.deck_id = (select id from version_media_ids where name = 'deck')
  and source.version_number = (
    select value::bigint from version_media_values where name = 'version_a'
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_a'),
    '44000000-0000-4000-8000-000000000044'
  )$$,
  'a schema-one version reconstructs its exact embedded note media'
);
select ok(
  exists(
    select 1
    from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.note_id = '46000000-0000-4000-8000-000000000001'
      and reference.media_asset_id = (
        select id from version_media_ids where name = 'asset_a'
      )
      and reference.reference_type = 'note'
      and reference.purpose = 'prompt'
      and reference.deleted_at is null
  )
  and (
    select target.content_snapshot ->> 'schemaVersion' = '1'
    from public.deck_versions as target
    where target.deck_id = (select id from version_media_ids where name = 'deck')
      and target.version_number = 9001
  )
  and (
    select head.content_snapshot ->> 'schemaVersion' = '2'
    from public.decks as deck
    join public.deck_versions as head
      on head.deck_id = deck.id
     and head.version_number = deck.current_version
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'legacy reconstruction leaves immutable v1 history intact and finalizes a v2 head'
);
select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_empty'),
    '44000000-0000-4000-8000-000000000045'
  )$$,
  'a media-free schema-one version restores without guessing legacy links'
);
insert into version_media_results (name, value)
select 'before_invalid_legacy', pg_catalog.to_jsonb(deck)
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_missing'),
    '44000000-0000-4000-8000-000000000046'
  )$$,
  '55000',
  'media asset is unavailable',
  'legacy reconstruction fails closed when an embedded asset is missing'
);
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_foreign'),
    '44000000-0000-4000-8000-000000000047'
  )$$,
  '55000',
  'media asset is unavailable',
  'legacy reconstruction cannot grant an unrelated foreign asset by UUID'
);
select ok(
  (select pg_catalog.to_jsonb(deck)
   from public.decks as deck
   where deck.id = (select id from version_media_ids where name = 'deck'))
    = (select value from version_media_results where name = 'before_invalid_legacy')
  and not exists(
    select 1
    from public.notes as note
    where note.deck_id = (select id from version_media_ids where name = 'deck')
      and note.deleted_at is null
  )
  and not exists(
    select 1
    from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.deleted_at is null
  ),
  'missing and foreign legacy restores roll back content, graph, counts, and receipts'
);

insert into version_media_values (name, value)
select 'restore_a_expected_version', deck.version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
insert into version_media_results (name, value)
select 'restore_a_first', pg_catalog.to_jsonb(restored)
from public.current_restore_deck_version(
  (select id from version_media_ids where name = 'deck'),
  (select value::bigint from version_media_values where name = 'restore_a_expected_version'),
  (select value::bigint from version_media_values where name = 'version_a'),
  '44000000-0000-4000-8000-000000000010'
) as restored;
insert into version_media_results (name, value)
select 'restore_a_retry', pg_catalog.to_jsonb(restored)
from public.current_restore_deck_version(
  (select id from version_media_ids where name = 'deck'),
  (select value::bigint from version_media_values where name = 'restore_a_expected_version'),
  (select value::bigint from version_media_values where name = 'version_a'),
  '44000000-0000-4000-8000-000000000010'
) as restored;

select is(
  (select value from version_media_results where name = 'restore_a_retry'),
  (select value from version_media_results where name = 'restore_a_first'),
  'an exact restore retry returns the same finalized deck row including content_hash'
);
select ok(
  (select pg_catalog.count(*) = 1
   from public.media_references as reference
   where reference.deck_id = (select id from version_media_ids where name = 'deck')
     and reference.media_asset_id = (select id from version_media_ids where name = 'asset_a')
     and reference.deleted_at is null)
  and not exists(
    select 1 from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.media_asset_id = (select id from version_media_ids where name = 'asset_b')
      and reference.deleted_at is null
  )
  and (select reference_count = 1 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_a'
  ))
  and (select reference_count = 0 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_b'
  )),
  'backward restore revives only asset A with authoritative counts and no stale B link'
);

select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'version_b'),
    '44000000-0000-4000-8000-000000000011'
  )$$,
  'forward restore reapplies the asset-B version'
);
select ok(
  (select pg_catalog.count(*) = 1
   from public.media_references as reference
   where reference.deck_id = (select id from version_media_ids where name = 'deck')
     and reference.media_asset_id = (select id from version_media_ids where name = 'asset_b')
     and reference.deleted_at is null)
  and not exists(
    select 1 from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.media_asset_id = (select id from version_media_ids where name = 'asset_a')
      and reference.deleted_at is null
  )
  and (select reference_count = 0 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_a'
  ))
  and (select reference_count = 1 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_b'
  )),
  'forward restore revives only asset B with authoritative counts and no stale A link'
);

reset role;
select ok(
  (
    select deck.content_hash = private.content_hash(
      private.capture_deck_content(deck.id)
    )
    from public.decks as deck
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and (
    select deck_version.content_snapshot = private.capture_deck_content(deck.id)
      and deck_version.content_hash = deck.content_hash
    from public.decks as deck
    join public.deck_versions as deck_version
      on deck_version.deck_id = deck.id
      and deck_version.version_number = deck.current_version
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'the restored head snapshot, version hash, and deck hash are the same finalized capture'
);

update public.media_assets
set delete_after = pg_catalog.now() - interval '1 minute'
where id = (select id from version_media_ids where name = 'asset_a');
set local role service_role;
insert into version_media_values (name, value)
select 'asset_a_lease', claimed.lease_token::text
from public.admin_claim_due_media_deletions(
  1, '49000000-0000-4000-8000-000000000001', 60
) as claimed
where claimed.media_asset_id = (select id from version_media_ids where name = 'asset_a');
select is(
  (select pg_catalog.count(*) from version_media_values where name = 'asset_a_lease'),
  1::bigint,
  'the worker leases zero-use historical asset A before the fencing test'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
insert into version_media_results (name, value)
select 'before_fenced_restore', pg_catalog.to_jsonb(deck)
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'version_a'),
    '44000000-0000-4000-8000-000000000012'
  )$$,
  '55000',
  'media asset is unavailable',
  'a durable worker job fences restoration of its historical asset identity'
);
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_a'),
    '44000000-0000-4000-8000-000000000048'
  )$$,
  '55000',
  'media asset is unavailable',
  'the same durable worker job fences schema-one media reconstruction'
);
select ok(
  (select pg_catalog.to_jsonb(deck) from public.decks as deck where deck.id = (
    select id from version_media_ids where name = 'deck'
  )) = (select value from version_media_results where name = 'before_fenced_restore')
  and (select reference_count = 0 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_a'
  ))
  and (select reference_count = 1 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_b'
  ))
  and (select pg_catalog.count(*) = 1
    from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.media_asset_id = (select id from version_media_ids where name = 'asset_b')
      and reference.deleted_at is null),
  'fenced restore rolls back content, refs, counts, hashes, and receipt side effects atomically'
);

select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'legacy_empty'),
    '44000000-0000-4000-8000-000000000013'
  )$$,
  'the media-free schema-one version restores while unrelated historical A remains fenced'
);
select ok(
  not exists(
    select 1 from public.notes as note
    where note.deck_id = (select id from version_media_ids where name = 'deck')
      and note.deleted_at is null
  )
  and not exists(
    select 1 from public.media_references as reference
    where reference.deck_id = (select id from version_media_ids where name = 'deck')
      and reference.deleted_at is null
  )
  and (select reference_count = 0 from public.media_assets where id = (
    select id from version_media_ids where name = 'asset_b'
  )),
  'restoring the deletion head yields exactly zero live notes, refs, and B usages'
);

select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'version_b'),
    '44000000-0000-4000-8000-000000000014'
  )$$,
  'the current asset-B note can be restored again after the deletion head'
);

select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000002', 'audio_prompt', 0,
    '{
      "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"alpha","position":1},
      "Transcript":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"alpha","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'audio_prompt',
        'audioPrompt', pg_catalog.jsonb_build_object(
          'assetId', (select id from version_media_ids where name = 'audio_a'),
          'transcript', 'alpha',
          'answer', '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'audio_a'),
      'purpose', 'prompt', 'position', 0, 'altText', 'alpha'
    )),
    '44000000-0000-4000-8000-000000000050'
  )$$,
  'an audio note stores its specialized child and explicit asset-A link'
);
insert into version_media_values (name, value)
select 'audio_version_a', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000002', 'audio_prompt',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000002'),
    '{
      "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"beta","position":1},
      "Transcript":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"beta","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'audio_prompt',
        'audioPrompt', pg_catalog.jsonb_build_object(
          'assetId', (select id from version_media_ids where name = 'audio_b'),
          'transcript', 'beta',
          'answer', '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb
        )
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'audio_b'),
      'purpose', 'prompt', 'position', 0, 'altText', 'beta'
    )),
    '44000000-0000-4000-8000-000000000051'
  )$$,
  'the owner replaces specialized audio A with audio B'
);
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'deck'),
    '46000000-0000-4000-8000-000000000002', 'audio_prompt',
    (select version from public.notes where id = '46000000-0000-4000-8000-000000000002'),
    '{
      "Answer":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"beta","position":1},
      "Transcript":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"beta","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', (
        select note.card_payload
        from public.notes as note
        where note.id = '46000000-0000-4000-8000-000000000002'
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'audio_b'),
      'purpose', 'inline', 'position', 3, 'altText', 'beta'
    )),
    '44000000-0000-4000-8000-000000000052'
  )$$,
  'an editor can retain collaborator audio through specialized persistence and re-linking'
);
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    (select value::bigint from version_media_values where name = 'audio_version_a'),
    '44000000-0000-4000-8000-000000000053'
  )$$,
  'restore-only provenance permits an older tombstoned specialized audio asset'
);
select ok(
  (
    select prompt.media_asset_id = (
      select id from version_media_ids where name = 'audio_a'
    )
    from public.audio_prompts as prompt
    where prompt.note_id = '46000000-0000-4000-8000-000000000002'
      and prompt.deleted_at is null
  )
  and exists(
    select 1
    from public.media_references as reference
    where reference.note_id = '46000000-0000-4000-8000-000000000002'
      and reference.media_asset_id = (
        select id from version_media_ids where name = 'audio_a'
      )
      and reference.deleted_at is null
  )
  and not exists(
    select 1
    from public.media_references as reference
    where reference.note_id = '46000000-0000-4000-8000-000000000002'
      and reference.media_asset_id = (
        select id from version_media_ids where name = 'audio_b'
      )
      and reference.deleted_at is null
  ),
  'specialized restore and its exact explicit graph select only historical audio A'
);

select lives_ok(
  $$select public.current_update_deck(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    pg_catalog.jsonb_build_object(
      'descriptionDoc', pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'type', 'doc',
        'content', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'type', 'paragraph',
            'attrs', pg_catalog.jsonb_build_object(
              'unlinkedInternalMediaId',
              (select id from version_media_ids where name = 'foreign_asset')
            )
          )
        )
      )
    ),
    '44000000-0000-4000-8000-000000000080'
  )$$,
  'the direct deck RPC accepts a legacy description containing an internal UUID'
);
select throws_ok(
  $$select public.current_publish_deck(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    'public', '44000000-0000-4000-8000-000000000081'
  )$$,
  '55000',
  'card publication contains an unavailable internal media identity',
  'publication fails closed when a deck description contains an unlinked internal media UUID'
);
reset role;
select ok(
  (
    select deck.visibility = 'private'
      and deck.published_version is null
      and deck.published_at is null
    from public.decks as deck
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and not exists(
    select 1
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'a description publication failure rolls back canonical and frozen publication state'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.current_update_deck(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    pg_catalog.jsonb_build_object(
      'descriptionDoc', pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'type', 'doc',
        'content', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'type', 'paragraph',
            'attrs', pg_catalog.jsonb_build_object(
              'attachedInternalMediaId',
              (select id from version_media_ids where name = 'asset_b'),
              'preexistingPublicMediaId',
              (select id from version_media_ids where name = 'asset_b_public')
            ),
            'content', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object(
                'type', 'text',
                'text', 'Trusted public description'
              )
            )
          )
        )
      ),
      'descriptionPlain', 'Caller-controlled draft '
        || (select id::text from version_media_ids where name = 'foreign_asset')
    ),
    '44000000-0000-4000-8000-000000000082'
  )$$,
  'the direct deck RPC receives a public document and a divergent internal-ID plain-text cache'
);

reset role;
select ok(
  (
    select private.text_contains_internal_media_id(deck.description_plain)
      and private.extract_public_description_plain(deck.description_doc)
        = 'Trusted public description'
    from public.decks as deck
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'the direct-RPC fixture proves canonical descriptionPlain is independently caller controlled'
);
update public.notes
set card_payload = card_payload || pg_catalog.jsonb_build_object(
  'legacyInternalMediaId',
  (select id from version_media_ids where name = 'foreign_asset')
)
where id = '46000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.current_publish_deck(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    'public', '44000000-0000-4000-8000-000000000083'
  )$$,
  '55000',
  'card publication contains an unavailable internal media identity',
  'publication fails closed for a pre-hardening card payload with an unlinked internal UUID'
);
reset role;
select ok(
  (
    select deck.visibility = 'private'
      and deck.published_version is null
      and deck.published_at is null
    from public.decks as deck
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and not exists(
    select 1
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'a legacy-card publication failure also rolls back every publication row'
);
update public.notes
set card_payload = (card_payload - 'legacyInternalMediaId')
  || pg_catalog.jsonb_build_object(
    'preexistingPublicMediaId',
    (select id from version_media_ids where name = 'asset_b_public')
  )
where id = '46000000-0000-4000-8000-000000000001';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.current_publish_deck(
    (select id from version_media_ids where name = 'deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'deck')),
    'public', '44000000-0000-4000-8000-000000000084'
  )$$,
  'the repaired deck and exact historical graph are publication ready'
);

reset role;
select ok(
  (select pg_catalog.count(*) = 1
   from public.media_publications as publication
   join public.decks as deck on deck.public_id = publication.deck_public_id
   where deck.id = (select id from version_media_ids where name = 'deck')
     and publication.media_public_id = (
       select id from version_media_ids where name = 'asset_b_public'
     ))
  and not exists(
    select 1
    from public.media_publications as publication
    join public.decks as deck on deck.public_id = publication.deck_public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
      and publication.media_public_id = (
        select id from version_media_ids where name = 'asset_a_public'
      )
  )
  and (
    select publication.description_doc #>> '{content,0,attrs,attachedInternalMediaId}' =
        (select id::text from version_media_ids where name = 'asset_b_public')
      and publication.description_doc #>> '{content,0,attrs,preexistingPublicMediaId}' =
        (select id::text from version_media_ids where name = 'asset_b_public')
      and publication.description_plain = 'Trusted public description'
      and private.public_description_plain_is_exact(
        publication.description_doc,
        publication.description_plain
      )
      and not private.text_contains_internal_media_id(
        publication.description_plain
      )
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and exists(
    select 1
    from public.card_publications as card
    join public.decks as deck on deck.public_id = card.deck_public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
      and card.card_payload ->> 'imageAssetId' =
        (select id::text from version_media_ids where name = 'asset_b_public')
      and card.card_payload ->> 'preexistingPublicMediaId' =
        (select id::text from version_media_ids where name = 'asset_b_public')
  )
  and not exists(
    select 1
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
      and private.card_json_contains_internal_media_id(
        publication.description_doc,
        0
      )
  )
  and not exists(
    select 1
    from public.card_publications as card
    join public.decks as deck on deck.public_id = card.deck_public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
      and (
        private.card_json_contains_internal_media_id(card.field_values, 0)
        or private.card_json_contains_internal_media_id(card.card_payload, 0)
        or private.card_json_contains_internal_media_id(card.source_references, 0)
      )
  ),
  'publication derives frozen plain text from the publicized document and leaks no caller cache or internal UUID'
);

insert into version_media_values (name, value)
select 'duplicate_b_before', asset.reference_count::text
from public.media_assets as asset
where asset.id = (select id from version_media_ids where name = 'asset_b');
insert into version_media_values (name, value)
select 'duplicate_audio_before', asset.reference_count::text
from public.media_assets as asset
where asset.id = (select id from version_media_ids where name = 'audio_a');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.current_duplicate_deck(
    (select id from version_media_ids where name = 'deck'),
    'Forbidden editor copy', null,
    '44000000-0000-4000-8000-000000000060'
  )$$,
  '42501',
  'only the source owner can duplicate a deck',
  'a non-owner cannot fork a media-bearing deck into foreign asset access'
);

set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
insert into version_media_ids (name, id)
select 'duplicate_deck', deck.id
from public.current_duplicate_deck(
  (select id from version_media_ids where name = 'deck'),
  'Owner media copy', null,
  '44000000-0000-4000-8000-000000000061'
) as deck;

reset role;
select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(distinct reference.media_asset_id) = 2
    from public.media_references as reference
    where reference.deck_id = (
      select id from version_media_ids where name = 'duplicate_deck'
    )
      and reference.deleted_at is null
      and reference.media_asset_id in (
        (select id from version_media_ids where name = 'asset_b'),
        (select id from version_media_ids where name = 'audio_a')
      )
  )
  and (
    select pg_catalog.jsonb_array_length(
        head.content_snapshot -> 'mediaReferences'
      ) = 2
      and head.content_snapshot = private.capture_deck_content(deck.id)
      and head.content_hash = deck.content_hash
    from public.decks as deck
    join public.deck_versions as head
      on head.deck_id = deck.id
     and head.version_number = deck.current_version
    where deck.id = (select id from version_media_ids where name = 'duplicate_deck')
  )
  and (
    select asset.reference_count = (
      select value::integer + 1
      from version_media_values where name = 'duplicate_b_before'
    )
    from public.media_assets as asset
    where asset.id = (select id from version_media_ids where name = 'asset_b')
  )
  and (
    select asset.reference_count = (
      select value::integer + 2
      from version_media_values where name = 'duplicate_audio_before'
    )
    from public.media_assets as asset
    where asset.id = (select id from version_media_ids where name = 'audio_a')
  ),
  'owner duplication rebuilds image/audio refs before its exact head and usage counts'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
insert into version_media_ids (name, id)
select 'media_free_deck', deck.id
from public.current_create_deck(
  'Owner media-free source',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private',
  '44000000-0000-4000-8000-000000000062'
) as deck;
reset role;
insert into public.deck_members (deck_id, account_id, role, granted_by)
values (
  (select id from version_media_ids where name = 'media_free_deck'),
  '41000000-0000-4000-8000-000000000002',
  'viewer',
  '41000000-0000-4000-8000-000000000001'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.current_duplicate_deck(
    (select id from version_media_ids where name = 'media_free_deck'),
    'Forbidden viewer copy', null,
    '44000000-0000-4000-8000-000000000063'
  )$$,
  '42501',
  'only the source owner can duplicate a deck',
  'owner-only duplication also rejects a viewer of a media-free source'
);

reset role;

insert into version_media_values (name, value)
select 'remediation_content_version', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
insert into version_media_values (name, value)
select 'remediation_content_hash', deck.content_hash::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'deck');
alter table public.deck_publications
  disable trigger deck_publications_freeze_safe_projection;
update public.deck_publications as publication
set description_plain = 'Legacy frozen plain leak '
  || (select id::text from version_media_ids where name = 'foreign_asset')
where publication.public_id = (
  select deck.public_id
  from public.decks as deck
  where deck.id = (select id from version_media_ids where name = 'deck')
);
alter table public.deck_publications
  enable trigger deck_publications_freeze_safe_projection;
select ok(
  exists(
    select 1
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
      and private.text_contains_internal_media_id(
        publication.description_plain
      )
  ),
  'the cleanup fixture represents a legacy frozen descriptionPlain leak'
);
select is(
  private.withdraw_internal_media_publications(),
  1,
  'the cleanup withdraws the one deck affected by a frozen plain-text leak'
);
select ok(
  (
    select deck.visibility = 'private'
      and deck.published_version is null
      and deck.published_at is null
      and deck.current_version = (
        select value::bigint
        from version_media_values
        where name = 'remediation_content_version'
      )
      and deck.content_hash::text = (
        select value
        from version_media_values
        where name = 'remediation_content_hash'
      )
    from public.decks as deck
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and not exists(
    select 1
    from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and not exists(
    select 1
    from public.card_publications as publication
    join public.decks as deck on deck.public_id = publication.deck_public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  )
  and not exists(
    select 1
    from public.media_publications as publication
    join public.decks as deck on deck.public_id = publication.deck_public_id
    where deck.id = (select id from version_media_ids where name = 'deck')
  ),
  'remediation removes every frozen projection and unpublishes without rewriting canonical history'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
insert into version_media_ids (name, id)
select 'move_source_deck', deck.id
from public.current_create_deck(
  'Move source',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private',
  '44000000-0000-4000-8000-000000000085'
) as deck;
insert into version_media_ids (name, id)
select 'move_target_deck', deck.id
from public.current_create_deck(
  'Move target',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private',
  '44000000-0000-4000-8000-000000000086'
) as deck;
select lives_ok(
  $$select public.current_upsert_note_definition_with_media(
    (select id from version_media_ids where name = 'move_source_deck'),
    '46000000-0000-4000-8000-000000000070', 'image_occlusion', 0,
    '{
      "Prompt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Move B","position":0},
      "ImageAlt":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Historical diagram B","position":1},
      "Extra":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"","position":2}
    }'::jsonb,
    pg_catalog.jsonb_build_object(
      'authoringData', pg_catalog.jsonb_build_object(
        'kind', 'image_occlusion', 'schemaVersion', 1,
        'imageAssetId', (select id from version_media_ids where name = 'asset_b'),
        'imageAlt', 'Historical diagram B',
        'mode', 'hide_one_reveal_others',
        'occlusions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'semanticKey', 'move-region', 'groupKey', 'move-region',
          'shape', '{"kind":"rectangle","x":0.2,"y":0.2,"width":0.2,"height":0.2}'::jsonb,
          'label', 'Move region', 'altText', 'Move region'
        ))
      )
    ),
    '{}'::text[],
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'assetId', (select id from version_media_ids where name = 'asset_b'),
      'purpose', 'prompt', 'position', 0, 'altText', 'Historical diagram B'
    )),
    '44000000-0000-4000-8000-000000000087'
  )$$,
  'a media-bearing note is created in the source deck before a bulk move'
);
insert into version_media_values (name, value)
select 'move_source_historical_version', deck.current_version::text
from public.decks as deck
where deck.id = (select id from version_media_ids where name = 'move_source_deck');
select lives_ok(
  $$select public.current_bulk_move_notes(
    (select id from version_media_ids where name = 'move_source_deck'),
    (select id from version_media_ids where name = 'move_target_deck'),
    array['46000000-0000-4000-8000-000000000070'::uuid],
    array[(
      select note.version
      from public.notes as note
      where note.id = '46000000-0000-4000-8000-000000000070'
    )]::bigint[],
    '44000000-0000-4000-8000-000000000088'
  )$$,
  'the note and its explicit media reference move atomically to the target deck'
);

reset role;
select ok(
  (
    select note.deck_id = (
      select id from version_media_ids where name = 'move_target_deck'
    )
    from public.notes as note
    where note.id = '46000000-0000-4000-8000-000000000070'
  )
  and exists(
    select 1
    from public.media_references as reference
    where reference.note_id = '46000000-0000-4000-8000-000000000070'
      and reference.deck_id = (
        select id from version_media_ids where name = 'move_target_deck'
      )
      and reference.media_asset_id = (
        select id from version_media_ids where name = 'asset_b'
      )
      and reference.deleted_at is null
  )
  and (
    select source_head.content_snapshot = private.capture_deck_content(source.id)
      and source_head.content_hash = source.content_hash
      and target_head.content_snapshot = private.capture_deck_content(target.id)
      and target_head.content_hash = target.content_hash
    from public.decks as source
    join public.deck_versions as source_head
      on source_head.deck_id = source.id
     and source_head.version_number = source.current_version
    cross join public.decks as target
    join public.deck_versions as target_head
      on target_head.deck_id = target.id
     and target_head.version_number = target.current_version
    where source.id = (select id from version_media_ids where name = 'move_source_deck')
      and target.id = (select id from version_media_ids where name = 'move_target_deck')
  ),
  'bulk move leaves both deck heads exact and assigns the reference to the target'
);
insert into version_media_results (name, value)
select 'post_move_state', pg_catalog.jsonb_build_object(
  'sourceDeck', pg_catalog.to_jsonb(source),
  'targetDeck', pg_catalog.to_jsonb(target),
  'note', pg_catalog.to_jsonb(note),
  'references', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(reference)
      order by reference.id
    )
    from public.media_references as reference
    where reference.note_id = note.id
  ), '[]'::jsonb),
  'assetReferenceCount', asset.reference_count
)
from public.decks as source
cross join public.decks as target
join public.notes as note
  on note.deck_id = target.id
 and note.id = '46000000-0000-4000-8000-000000000070'
join public.media_assets as asset
  on asset.id = (select id from version_media_ids where name = 'asset_b')
where source.id = (select id from version_media_ids where name = 'move_source_deck')
  and target.id = (select id from version_media_ids where name = 'move_target_deck');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"42000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from version_media_ids where name = 'move_source_deck'),
    (select version from public.decks where id = (select id from version_media_ids where name = 'move_source_deck')),
    (select value::bigint from version_media_values where name = 'move_source_historical_version'),
    '44000000-0000-4000-8000-000000000089'
  )$$,
  '55000',
  'deck version note identity belongs to another deck',
  'source restore cannot steal a note that was subsequently moved to another deck'
);

reset role;
select is(
  (
    select pg_catalog.jsonb_build_object(
      'sourceDeck', pg_catalog.to_jsonb(source),
      'targetDeck', pg_catalog.to_jsonb(target),
      'note', pg_catalog.to_jsonb(note),
      'references', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(reference)
          order by reference.id
        )
        from public.media_references as reference
        where reference.note_id = note.id
      ), '[]'::jsonb),
      'assetReferenceCount', asset.reference_count
    )
    from public.decks as source
    cross join public.decks as target
    join public.notes as note
      on note.deck_id = target.id
     and note.id = '46000000-0000-4000-8000-000000000070'
    join public.media_assets as asset
      on asset.id = (select id from version_media_ids where name = 'asset_b')
    where source.id = (select id from version_media_ids where name = 'move_source_deck')
      and target.id = (select id from version_media_ids where name = 'move_target_deck')
  ),
  (select value from version_media_results where name = 'post_move_state'),
  'failed source restore leaves both decks, the moved note/reference graph, and usage count byte-for-byte unchanged'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and pg_catalog.pg_get_functiondef(procedure.oid) ~*
        '(xmin[[:space:]]*::[[:space:]]*text|pg_current_xact_id\([[:space:]]*\)[[:space:]]*::[[:space:]]*text)'
  ),
  'database functions contain no epoch-losing text comparison of transaction identities'
);

select * from finish();

rollback;
