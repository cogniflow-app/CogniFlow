begin;

select no_plan();

create temporary table security_audit_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on security_audit_ids
to authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '21000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'security-owner@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '21000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'security-editor@example.test', '',
    pg_catalog.now(), '{}'::jsonb, '{}'::jsonb,
    pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set display_name = case id
      when '21000000-0000-4000-8000-000000000001' then 'Security Owner'
      else 'Security Editor'
    end,
    handle = case id
      when '21000000-0000-4000-8000-000000000001' then 'security_owner'
      else 'security_editor'
    end,
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id in (
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '22000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );

insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values
  (
    '23000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    'Owner audit browser', 'pgTAP',
    '24000000-0000-4000-8000-000000000001'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    'Editor audit browser', 'pgTAP',
    '24000000-0000-4000-8000-000000000002'
  );

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note(uuid,uuid,text,bigint,jsonb,jsonb,text[],uuid)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_link_media(uuid,public.media_reference_type,uuid,public.media_reference_purpose,integer,text,uuid)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_release_media_reference(uuid,uuid)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid)',
    'execute'
  ),
  'browser credentials expose only the atomic note and media mutation boundary'
);

select is(
  (
    select p.provolatile::text
    from pg_catalog.pg_proc as p
    where p.oid = 'private.get_content_receipt(uuid,uuid,text)'::regprocedure
  ),
  'v',
  'receipt lookup is volatile because it serializes same-key mutations'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'private.get_content_receipt(uuid,uuid,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%',
  'receipt lookup takes a transaction-scoped account/key advisory lock'
);
select ok(
  (
    select p.provolatile = 'v'
      and pg_catalog.pg_get_functiondef(p.oid) like '%for share%'
    from pg_catalog.pg_proc as p
    where p.oid = 'private.can_write_content_media_object(uuid,text,text)'::regprocedure
  ),
  'pending storage authorization locks the media row against finalization races'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000001"}';

insert into security_audit_ids (name, id)
select 'folder', folder.id
from public.current_create_folder(
  'Security audit folder', null,
  '25000000-0000-4000-8000-000000000001'
) as folder;

insert into security_audit_ids (name, id)
select 'deck', deck.id
from public.current_create_deck(
  'Security audit deck',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  (select id from security_audit_ids where name = 'folder'),
  'private', '25000000-0000-4000-8000-000000000002'
) as deck;

select lives_ok(
  $$
    select public.current_upsert_note_with_media(
      (select id from security_audit_ids where name = 'deck'),
      '26000000-0000-4000-8000-000000000001',
      'basic', 0,
      '{
        "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Guarded front","position":0},
        "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Guarded back","position":1}
      }'::jsonb,
      '{"authoringData":{"kind":"basic"}}'::jsonb,
      '{}'::text[], '[]'::jsonb,
      '25000000-0000-4000-8000-000000000003'
    )
  $$,
  'the explicit zero sentinel creates a note through the atomic wrapper'
);

select is(
  public.current_upsert_note_with_media(
    (select id from security_audit_ids where name = 'deck'),
    null,
    'basic', 0,
    '{
      "Front":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Derived identity front","position":0},
      "Back":{"doc":{"schemaVersion":1,"type":"doc","content":[]},"plainText":"Derived identity back","position":1}
    }'::jsonb,
    '{"authoringData":{"kind":"basic"}}'::jsonb,
    '{}'::text[], '[]'::jsonb,
    '25000000-0000-4000-8000-000000000004'
  ) #>> '{note,id}',
  '25000000-0000-4000-8000-000000000004',
  'a browser create without noteId derives a stable identity from its idempotency key'
);

select throws_ok(
  $$select public.current_update_folder(
    (select id from security_audit_ids where name = 'folder'), null,
    'ignored', null, '25000000-0000-4000-8000-000000000011'
  )$$,
  '22023', 'expected content version is required',
  'folder updates reject a NULL optimistic version'
);
select throws_ok(
  $$select public.current_move_folder(
    (select id from security_audit_ids where name = 'folder'), null,
    null, '25000000-0000-4000-8000-000000000012'
  )$$,
  '22023', 'expected content version is required',
  'folder moves reject a NULL optimistic version'
);
select throws_ok(
  $$select public.current_delete_folder(
    (select id from security_audit_ids where name = 'folder'), null,
    '25000000-0000-4000-8000-000000000013'
  )$$,
  '22023', 'expected content version is required',
  'folder deletion rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_update_note_type(
    '02000000-0000-4000-8000-000000000001', null,
    '{"displayName":"ignored"}'::jsonb,
    '25000000-0000-4000-8000-000000000014'
  )$$,
  '22023', 'expected content version is required',
  'note-type updates reject a NULL optimistic version'
);
select throws_ok(
  $$select public.current_update_deck(
    (select id from security_audit_ids where name = 'deck'), null,
    '{"title":"ignored"}'::jsonb,
    '25000000-0000-4000-8000-000000000015'
  )$$,
  '22023', 'expected content version is required',
  'deck updates reject a NULL optimistic version'
);
select throws_ok(
  $$select public.current_archive_deck(
    (select id from security_audit_ids where name = 'deck'), null,
    '25000000-0000-4000-8000-000000000016'
  )$$,
  '22023', 'expected content version is required',
  'deck archive rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_restore_deck(
    (select id from security_audit_ids where name = 'deck'), null,
    '25000000-0000-4000-8000-000000000017'
  )$$,
  '22023', 'expected content version is required',
  'deck restore rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_delete_deck(
    (select id from security_audit_ids where name = 'deck'), null,
    '25000000-0000-4000-8000-000000000018'
  )$$,
  '22023', 'expected content version is required',
  'deck deletion rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_upsert_note_with_media(
    (select id from security_audit_ids where name = 'deck'), null,
    'basic', null, '{}'::jsonb, '{}'::jsonb, '{}'::text[], '[]'::jsonb,
    '25000000-0000-4000-8000-000000000019'
  )$$,
  '22023', 'expected content version is required',
  'atomic note creation rejects NULL instead of treating it as a wildcard'
);
select throws_ok(
  $$select public.current_delete_note(
    '26000000-0000-4000-8000-000000000001', null,
    '25000000-0000-4000-8000-000000000020'
  )$$,
  '22023', 'expected content version is required',
  'note deletion rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_publish_deck(
    (select id from security_audit_ids where name = 'deck'), null, 'public',
    '25000000-0000-4000-8000-000000000021'
  )$$,
  '22023', 'expected content version is required',
  'publication rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_unpublish_deck(
    (select id from security_audit_ids where name = 'deck'), null,
    '25000000-0000-4000-8000-000000000022'
  )$$,
  '22023', 'expected content version is required',
  'unpublication rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_restore_deck_version(
    (select id from security_audit_ids where name = 'deck'), null, 1,
    '25000000-0000-4000-8000-000000000023'
  )$$,
  '22023', 'expected content version is required',
  'version restore rejects a NULL optimistic version'
);
select throws_ok(
  $$select public.current_bulk_tag_notes(
    (select id from security_audit_ids where name = 'deck'),
    array['26000000-0000-4000-8000-000000000001'::uuid],
    array[null::bigint], '{}'::text[], '{}'::text[],
    '25000000-0000-4000-8000-000000000024'
  )$$,
  '22023', 'expected content versions are required',
  'bulk tag rejects NULL elements in the optimistic version vector'
);
select throws_ok(
  $$select public.current_bulk_move_notes(
    (select id from security_audit_ids where name = 'deck'),
    '27000000-0000-4000-8000-000000000001',
    array['26000000-0000-4000-8000-000000000001'::uuid],
    array[null::bigint],
    '25000000-0000-4000-8000-000000000025'
  )$$,
  '22023', 'expected content versions are required',
  'bulk move rejects NULL elements in the optimistic version vector'
);

select throws_ok(
  $$select public.current_upsert_note(
    (select id from security_audit_ids where name = 'deck'), null,
    'basic', 0, '{}'::jsonb, '{}'::jsonb, '{}'::text[],
    '25000000-0000-4000-8000-000000000026'
  )$$,
  '42501', null,
  'browser callers cannot invoke the non-atomic note mutation component'
);
select throws_ok(
  $$select public.current_link_media(
    '27000000-0000-4000-8000-000000000002', 'deck',
    (select id from security_audit_ids where name = 'deck'),
    'attachment', 0, null,
    '25000000-0000-4000-8000-000000000027'
  )$$,
  '42501', null,
  'browser callers cannot invoke the standalone media-link component'
);
select throws_ok(
  $$select public.current_release_media_reference(
    '27000000-0000-4000-8000-000000000003',
    '25000000-0000-4000-8000-000000000028'
  )$$,
  '42501', null,
  'browser callers cannot invoke the standalone media-release component'
);

reset role;
insert into public.deck_members (
  deck_id, account_id, role, granted_by
) values (
  (select id from security_audit_ids where name = 'deck'),
  '21000000-0000-4000-8000-000000000002',
  'editor', '21000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select public.current_update_deck(
    (select id from security_audit_ids where name = 'deck'),
    (select version from public.decks where id = (
      select id from security_audit_ids where name = 'deck'
    )),
    '{"title":"Editor-authored title"}'::jsonb,
    '25000000-0000-4000-8000-000000000030'
  )$$,
  'an authorized editor can perform the original idempotent mutation'
);

reset role;
update public.deck_members
set revoked_at = pg_catalog.now(), version = version + 1
where deck_id = (select id from security_audit_ids where name = 'deck')
  and account_id = '21000000-0000-4000-8000-000000000002';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.current_update_deck(
    (select id from security_audit_ids where name = 'deck'),
    2,
    '{"title":"Editor-authored title"}'::jsonb,
    '25000000-0000-4000-8000-000000000030'
  )$$,
  '42501', 'content mutation replay is no longer authorized',
  'receipt replay rechecks current authorization after collaborator revocation'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000001"}';

insert into security_audit_ids (name, id)
select 'cover_deck', deck.id
from public.current_create_deck(
  'Cover lifecycle deck',
  '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  null, 'private', '25000000-0000-4000-8000-000000000031'
) as deck;

insert into security_audit_ids (name, id)
select 'cover_asset', asset.id
from public.current_register_media_asset(
  repeat('e', 64), 'image/png', 'image', 1024, 32, 32, null,
  'Cover image', '25000000-0000-4000-8000-000000000032'
) as asset;

reset role;
select is(
  (
    select private.can_write_content_media_object(
      auth.uid(), asset.storage_bucket, asset.storage_path
    )
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'cover_asset')
  ),
  true,
  'an authenticated owner may write the matching object while it is pending'
);

set local role service_role;
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '21000000-0000-4000-8000-000000000001',
    (select id from security_audit_ids where name = 'cover_asset'),
    repeat('e', 64), 'image/png', true,
    '25000000-0000-4000-8000-000000000033'
  )$$,
  'trusted finalization verifies the cover asset'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000001"}';
reset role;
select is(
  (
    select private.can_write_content_media_object(
      auth.uid(), asset.storage_bucket, asset.storage_path
    )
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'cover_asset')
  ),
  false,
  'a verified ready object cannot be replaced or deleted by browser credentials'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"22000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.current_update_deck(
    (select id from security_audit_ids where name = 'cover_deck'),
    (select version from public.decks where id = (
      select id from security_audit_ids where name = 'cover_deck'
    )),
    pg_catalog.jsonb_build_object(
      'coverAssetId', (select id from security_audit_ids where name = 'cover_asset')
    ),
    '25000000-0000-4000-8000-000000000034'
  )$$,
  'a verified owner asset can become a deck cover'
);
select ok(
  (
    select asset.reference_count = 1
      and asset.status = 'ready'
      and asset.delete_after is null
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'cover_asset')
  ),
  'deck cover usage increments the reference count and clears orphan cleanup'
);

select lives_ok(
  $$select public.current_delete_deck(
    (select id from security_audit_ids where name = 'cover_deck'),
    (select version from public.decks where id = (
      select id from security_audit_ids where name = 'cover_deck'
    )),
    '25000000-0000-4000-8000-000000000035'
  )$$,
  'soft-deleting a deck retires its cover usage'
);
select ok(
  (
    select asset.reference_count = 0
      and asset.status = 'deleting'
      and asset.delete_after is not null
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'cover_asset')
  ),
  'deleted deck covers enter the delayed orphan lifecycle'
);

insert into security_audit_ids (name, id)
select 'embedded_asset', asset.id
from public.current_register_media_asset(
  repeat('f', 64), 'image/png', 'image', 2048, 64, 64, null,
  'Specialized media', '25000000-0000-4000-8000-000000000036'
) as asset;

reset role;
set local role service_role;
select lives_ok(
  $$select public.admin_finalize_media_asset(
    '21000000-0000-4000-8000-000000000001',
    (select id from security_audit_ids where name = 'embedded_asset'),
    repeat('f', 64), 'image/png', true,
    '25000000-0000-4000-8000-000000000037'
  )$$,
  'trusted finalization verifies the specialized media asset'
);

reset role;
insert into public.audio_prompts (
  note_id, media_asset_id, transcript, answer
) values (
  '26000000-0000-4000-8000-000000000001',
  (select id from security_audit_ids where name = 'embedded_asset'),
  'audio transcript', 'audio answer'
);
insert into public.pronunciation_prompts (
  note_id, text, language, reference_asset_id
) values (
  '26000000-0000-4000-8000-000000000001',
  'pronounce', 'en-US',
  (select id from security_audit_ids where name = 'embedded_asset')
);
insert into public.drawing_reference_layers (
  note_id, semantic_key, media_asset_id, position
) values (
  '26000000-0000-4000-8000-000000000001', 'reference-layer',
  (select id from security_audit_ids where name = 'embedded_asset'), 0
);

select ok(
  (
    select asset.reference_count = 3
      and asset.status = 'ready'
      and asset.delete_after is null
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'embedded_asset')
  ),
  'audio, pronunciation, and drawing references each participate in media usage'
);

update public.audio_prompts
set deleted_at = pg_catalog.now(), version = version + 1
where note_id = '26000000-0000-4000-8000-000000000001';
update public.pronunciation_prompts
set deleted_at = pg_catalog.now(), version = version + 1
where note_id = '26000000-0000-4000-8000-000000000001';
update public.drawing_reference_layers
set deleted_at = pg_catalog.now(), version = version + 1
where note_id = '26000000-0000-4000-8000-000000000001';

select ok(
  (
    select asset.reference_count = 0
      and asset.status = 'deleting'
      and asset.delete_after is not null
    from public.media_assets as asset
    where asset.id = (select id from security_audit_ids where name = 'embedded_asset')
  ),
  'retiring all specialized references schedules delayed orphan cleanup'
);

select * from finish();
rollback;
