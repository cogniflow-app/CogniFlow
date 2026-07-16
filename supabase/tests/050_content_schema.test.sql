begin;

select no_plan();

select has_table('public', 'folders', 'folders table exists');
select has_table('public', 'decks', 'decks table exists');
select has_table('public', 'deck_members', 'deck members table exists');
select has_table('public', 'folder_items', 'folder items table exists');
select has_table('public', 'tags', 'tags table exists');
select has_table('public', 'note_tags', 'note tags table exists');
select has_table('public', 'note_types', 'note types table exists');
select has_table('public', 'note_type_fields', 'note type fields table exists');
select has_table('public', 'card_templates', 'card templates table exists');
select has_table('public', 'notes', 'notes table exists');
select has_table('public', 'note_field_values', 'note field values table exists');
select has_table('public', 'cards', 'generated cards table exists');
select has_table('public', 'card_choices', 'card choices table exists');
select has_table('public', 'cloze_definitions', 'cloze definitions table exists');
select has_table('public', 'image_occlusions', 'image occlusions table exists');
select has_table('public', 'diagram_hotspots', 'diagram hotspots table exists');
select has_table('public', 'ordering_items', 'ordering items table exists');
select has_table('public', 'list_answer_items', 'list-answer items table exists');
select has_table('public', 'audio_prompts', 'audio prompts table exists');
select has_table('public', 'pronunciation_prompts', 'pronunciation prompts table exists');
select has_table('public', 'drawing_reference_layers', 'drawing reference layers table exists');
select has_table('public', 'media_assets', 'media assets table exists');
select has_table('public', 'media_references', 'media references table exists');
select has_table('public', 'source_references', 'source references table exists');
select has_table('public', 'note_revisions', 'note revisions table exists');
select has_table('public', 'deck_versions', 'deck versions table exists');
select has_table('public', 'content_change_impacts', 'content impacts table exists');
select has_table('public', 'deck_publications', 'safe deck publication table exists');
select has_table('public', 'card_publications', 'safe card publication table exists');
select has_table('public', 'media_publications', 'safe media publication table exists');
select has_table('private', 'content_mutation_receipts', 'private content idempotency ledger exists');

select is(
  (select count(*)::integer from public.note_types where is_system and deleted_at is null),
  17,
  'all seventeen required system note types are seeded'
);
select is(
  (select count(*)::integer from public.card_templates
    where deleted_at is null and note_type_id in (
      select id from public.note_types where is_system
    )),
  20,
  'system note types seed all static and sibling templates'
);
select is(
  (select card_kind::text from public.note_types where code = 'basic' and is_system),
  'basic',
  'Basic is resolved by a stable system code'
);
select is(
  (select count(*)::integer from public.note_types where code in (
    'basic','basic_reversed','optional_reversed','bidirectional','custom_multi_field',
    'typed_answer','cloze','image_occlusion','multiple_choice','select_all','true_false',
    'ordering','list_answer','diagram','audio_prompt','pronunciation','drawing'
  )),
  17,
  'every required card-authoring code is present'
);

select ok(
  not exists(
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'folders','decks','deck_members','folder_items','tags','note_tags','note_types',
        'note_type_fields','card_templates','notes','note_field_values','cards','card_choices',
        'cloze_definitions','image_occlusions','diagram_hotspots','ordering_items',
        'list_answer_items','audio_prompts','pronunciation_prompts','drawing_reference_layers',
        'media_assets','media_references','source_references','note_revisions','deck_versions',
        'content_change_impacts','deck_publications','card_publications','media_publications'
      )
      and not relation.relrowsecurity
  ),
  'RLS is enabled on every Phase 02 exposed table'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_index as index_record
    join pg_catalog.pg_class as index_relation on index_relation.oid = index_record.indexrelid
    where index_relation.relname = 'cards_note_id_template_id_generation_key_key'
      and index_record.indisunique
  ),
  'generated siblings have a stable unique note/template/generation identity'
);
select ok(
  exists(
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_generation_key_format'
      and pg_catalog.pg_get_constraintdef(oid) like '%\%%'
  ),
  'generated-card identity permits URI-encoded semantic keys'
);
select ok(
  exists(
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.folders'::regclass
      and tgname = 'folders_prevent_cycle' and not tgisinternal
  ),
  'folder cycle prevention is enforced by a database trigger'
);

select is(
  (select reloptions::text from pg_catalog.pg_class where oid = 'public.published_decks'::regclass),
  '{security_invoker=true,security_barrier=true}',
  'published deck view is security-invoker and security-barrier'
);
select is(
  (select reloptions::text from pg_catalog.pg_class where oid = 'public.published_cards'::regclass),
  '{security_invoker=true,security_barrier=true}',
  'published card view is security-invoker and security-barrier'
);
select is(
  (select reloptions::text from pg_catalog.pg_class where oid = 'public.published_media'::regclass),
  '{security_invoker=true,security_barrier=true}',
  'published media view is security-invoker and security-barrier'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.decks', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.notes', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.cards', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.deck_versions', 'select'),
  'anonymous visitors have no draft or history table privileges'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.decks', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.decks', 'update')
  and not pg_catalog.has_table_privilege('authenticated', 'public.notes', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.notes', 'update')
  and not pg_catalog.has_table_privilege('authenticated', 'public.notes', 'delete'),
  'authenticated clients cannot write content tables directly'
);
select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.decks', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'public.notes', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'public.media_assets', 'select'),
  'service role retains the narrow RPC-only product-table boundary'
);

select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
    where p.oid = 'public.current_upsert_note(uuid,uuid,text,bigint,jsonb,jsonb,text[],uuid)'::regprocedure)
  and (select p.proconfig @> array['search_path=""']::text[] from pg_catalog.pg_proc as p
    where p.oid = 'public.current_upsert_note(uuid,uuid,text,bigint,jsonb,jsonb,text[],uuid)'::regprocedure)
    is true,
  'note upsert is security-definer with an empty search path'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note(uuid,uuid,text,bigint,jsonb,jsonb,text[],uuid)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_upsert_note_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid)',
    'execute'
  ),
  'authenticated callers use only the atomic note and media upsert boundary'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_finalize_media_asset(uuid,uuid,text,text,boolean,uuid)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_finalize_media_asset(uuid,uuid,text,text,boolean,uuid)',
    'execute'
  ),
  'magic-byte media finalization is service-only'
);
select ok(
  pg_catalog.has_function_privilege('anon', 'public.get_public_deck(uuid)', 'execute')
  and pg_catalog.has_function_privilege('anon', 'public.get_public_deck_cards(uuid)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.current_publish_deck(uuid,bigint,public.deck_visibility,uuid)', 'execute'),
  'anonymous visitors receive only exact read-only publication RPCs'
);

select is(
  (select count(*)::integer from storage.buckets where id = 'lumen-content-media'
    and not public and file_size_limit = 10485760),
  1,
  'the content-media bucket is private and size bounded'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'content_media_read','content_media_insert','content_media_update','content_media_delete'
      )),
  4,
  'storage read/write boundaries are installed through migrations'
);

select * from finish();
rollback;
