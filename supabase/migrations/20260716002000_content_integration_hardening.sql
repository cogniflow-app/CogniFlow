begin;

-- Keep the note mutation and its attachment graph in one database transaction.
create or replace function public.current_upsert_note_with_media(
  p_deck_id uuid,
  p_note_id uuid,
  p_note_type_code text,
  p_expected_version bigint,
  p_fields jsonb,
  p_card_payload jsonb,
  p_tags text[],
  p_media_links jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_response jsonb;
  v_note_id uuid;
  v_link jsonb;
  v_reference public.media_references;
  v_inner_key uuid;
  v_hex text;
begin
  v_receipt := private.get_content_receipt(
    v_account_id, p_idempotency_key, 'note.upsert_with_media'
  );
  if v_receipt.idempotency_key is not null then
    return v_receipt.response;
  end if;
  if p_media_links is null
    or pg_catalog.jsonb_typeof(p_media_links) <> 'array'
    or pg_catalog.jsonb_array_length(p_media_links) > 100
    or exists(
      select 1
      from pg_catalog.jsonb_array_elements(p_media_links) as link(value)
      where pg_catalog.jsonb_typeof(link.value) <> 'object'
        or not (link.value ? 'assetId')
        or coalesce(link.value ->> 'assetId', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or exists(
          select 1 from pg_catalog.jsonb_object_keys(link.value) as key
          where key not in ('assetId', 'altText', 'purpose', 'position')
        )
        or coalesce(link.value ->> 'purpose', 'prompt')
          not in ('cover', 'inline', 'attachment', 'prompt', 'answer', 'reference')
        or coalesce(link.value ->> 'position', '0') !~ '^[0-9]{1,5}$'
        or (link.value ->> 'position')::integer not between 0 and 9999
        or pg_catalog.char_length(coalesce(link.value ->> 'altText', '')) > 1000
    )
    or (
      select pg_catalog.count(*)
      from (
        select distinct
          link.value ->> 'assetId',
          coalesce(link.value ->> 'purpose', 'prompt'),
          coalesce(link.value ->> 'position', '0')
        from pg_catalog.jsonb_array_elements(p_media_links) as link(value)
      ) as distinct_link
    ) <> pg_catalog.jsonb_array_length(p_media_links) then
    raise exception using errcode = '22023', message = 'note media links are invalid';
  end if;

  -- The inner note RPC owns its own receipt, deck version, and audit event. A
  -- namespaced deterministic key prevents that receipt from consuming the
  -- caller's key, which is reserved for this larger atomic operation.
  v_hex := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'lumen:note-upsert-with-media:inner:v1:' || p_idempotency_key::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_hex := pg_catalog.substr(v_hex, 1, 12) || '5' || pg_catalog.substr(v_hex, 14, 3)
    || '8' || pg_catalog.substr(v_hex, 18, 15);
  v_inner_key := (
    pg_catalog.substr(v_hex, 1, 8) || '-' ||
    pg_catalog.substr(v_hex, 9, 4) || '-' ||
    pg_catalog.substr(v_hex, 13, 4) || '-' ||
    pg_catalog.substr(v_hex, 17, 4) || '-' ||
    pg_catalog.substr(v_hex, 21, 12)
  )::uuid;

  v_response := public.current_upsert_note(
    p_deck_id,
    p_note_id,
    p_note_type_code,
    p_expected_version,
    p_fields,
    p_card_payload,
    p_tags,
    v_inner_key
  );
  v_note_id := (v_response -> 'note' ->> 'id')::uuid;

  for v_reference in
    select reference.*
    from public.media_references as reference
    where reference.note_id = v_note_id
      and reference.reference_type = 'note'
      and reference.owner_id = v_note_id
      and reference.deleted_at is null
      and not exists(
        select 1
        from pg_catalog.jsonb_array_elements(p_media_links) as desired(value)
        where (desired.value ->> 'assetId')::uuid = reference.media_asset_id
          and coalesce(desired.value ->> 'purpose', 'prompt') = reference.purpose::text
          and coalesce((desired.value ->> 'position')::integer, 0) = reference.position
      )
    order by reference.id
  loop
    perform public.current_release_media_reference(
      v_reference.id,
      extensions.gen_random_uuid()
    );
  end loop;

  for v_link in
    select value
    from pg_catalog.jsonb_array_elements(p_media_links)
  loop
    perform public.current_link_media(
      (v_link ->> 'assetId')::uuid,
      'note'::public.media_reference_type,
      v_note_id,
      coalesce(v_link ->> 'purpose', 'prompt')::public.media_reference_purpose,
      coalesce((v_link ->> 'position')::integer, 0),
      nullif(pg_catalog.btrim(coalesce(v_link ->> 'altText', '')), ''),
      extensions.gen_random_uuid()
    );
  end loop;

  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.note_media_reconciled',
    'note', v_note_id, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'mediaCount', pg_catalog.jsonb_array_length(p_media_links)
    )
  );
  perform private.record_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.upsert_with_media',
    'note',
    v_note_id,
    v_response
  );
  return v_response;
end;
$function$;

-- Resolve private media only after proving that the current account owns it or
-- can view content that directly references it. Storage locators never travel
-- through the ordinary media_assets table grant.
create or replace function public.current_get_media_asset(p_media_asset_id uuid)
returns table (
  media_asset_id uuid,
  media_public_id uuid,
  kind public.media_kind,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  storage_bucket text,
  storage_path text,
  alt_text text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
begin
  return query
  select
    asset.id,
    asset.public_id,
    asset.kind,
    asset.mime_type,
    asset.byte_size,
    asset.width,
    asset.height,
    asset.duration_ms,
    asset.storage_bucket,
    asset.storage_path,
    asset.alt_text
  from public.media_assets as asset
  where asset.id = p_media_asset_id
    and asset.status = 'ready'
    and asset.deleted_at is null
    and (
      asset.owner_account_id = v_account_id
      or exists(
        select 1
        from public.media_references as reference
        where reference.media_asset_id = asset.id
          and reference.deleted_at is null
          and private.can_view_deck(v_account_id, reference.deck_id)
      )
      or exists(
        select 1 from public.decks as deck
        where deck.cover_asset_id = asset.id
          and private.can_view_deck(v_account_id, deck.id)
      )
      or exists(
        select 1
        from public.audio_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.media_asset_id = asset.id
          and prompt.deleted_at is null
          and note.deleted_at is null
          and private.can_view_deck(v_account_id, note.deck_id)
      )
      or exists(
        select 1
        from public.pronunciation_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.reference_asset_id = asset.id
          and prompt.deleted_at is null
          and note.deleted_at is null
          and private.can_view_deck(v_account_id, note.deck_id)
      )
      or exists(
        select 1
        from public.drawing_reference_layers as layer
        join public.notes as note on note.id = layer.note_id
        where layer.media_asset_id = asset.id
          and layer.deleted_at is null
          and note.deleted_at is null
          and private.can_view_deck(v_account_id, note.deck_id)
      )
    );
end;
$function$;

create or replace function public.current_bulk_tag_notes(
  p_deck_id uuid,
  p_note_ids uuid[],
  p_expected_versions bigint[],
  p_add_tags text[],
  p_remove_tags text[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_note public.notes;
  v_tag public.tags;
  v_tag_name text;
  v_normalized text;
  v_index integer;
  v_response jsonb;
  v_deck_result public.decks;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note.bulk_tag');
  if v_receipt.idempotency_key is not null then
    return v_receipt.response;
  end if;
  if coalesce(pg_catalog.cardinality(p_note_ids), 0) not between 1 and 100
    or pg_catalog.cardinality(p_note_ids) <> pg_catalog.cardinality(p_expected_versions)
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_note_ids) as id)
      <> pg_catalog.cardinality(p_note_ids)
    or coalesce(pg_catalog.cardinality(p_add_tags), 0) > 100
    or coalesce(pg_catalog.cardinality(p_remove_tags), 0) > 100 then
    raise exception using errcode = '22023', message = 'bulk tag input is invalid';
  end if;
  foreach v_tag_name in array coalesce(p_add_tags, '{}'::text[])
  loop
    if v_tag_name is null
      or pg_catalog.char_length(pg_catalog.btrim(v_tag_name)) not between 1 and 100 then
      raise exception using errcode = '22023', message = 'bulk tag name is invalid';
    end if;
  end loop;
  foreach v_tag_name in array coalesce(p_remove_tags, '{}'::text[])
  loop
    if v_tag_name is null
      or pg_catalog.char_length(pg_catalog.btrim(v_tag_name)) not between 1 and 100 then
      raise exception using errcode = '22023', message = 'bulk tag name is invalid';
    end if;
  end loop;

  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or v_deck.status <> 'active'
    or not private.can_edit_deck(v_account_id, p_deck_id) then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  perform 1 from public.notes as note
  where note.id = any(p_note_ids)
  order by note.id
  for update;
  if (
    select pg_catalog.count(*)
    from public.notes as note
    where note.id = any(p_note_ids)
      and note.deck_id = p_deck_id
      and note.deleted_at is null
  ) <> pg_catalog.cardinality(p_note_ids) then
    raise exception using errcode = '42501', message = 'one or more notes are unavailable';
  end if;
  for v_index in 1..pg_catalog.cardinality(p_note_ids)
  loop
    select * into strict v_note from public.notes where id = p_note_ids[v_index];
    if v_note.version <> p_expected_versions[v_index] then
      perform private.raise_content_conflict(
        'note', v_note.id, p_expected_versions[v_index], v_note.version
      );
    end if;
  end loop;

  for v_index in 1..pg_catalog.cardinality(p_note_ids)
  loop
    select * into strict v_note from public.notes where id = p_note_ids[v_index];
    perform private.record_note_revision(
      v_note.id, v_account_id, 'note_bulk_tagged', extensions.gen_random_uuid()
    );
    foreach v_tag_name in array coalesce(p_remove_tags, '{}'::text[])
    loop
      v_normalized := pg_catalog.lower(
        pg_catalog.regexp_replace(pg_catalog.btrim(v_tag_name), '[[:space:]]+', ' ', 'g')
      );
      update public.note_tags as note_tag
      set deleted_at = pg_catalog.now()
      from public.tags as tag
      where note_tag.note_id = v_note.id
        and note_tag.tag_id = tag.id
        and note_tag.deleted_at is null
        and tag.deck_id = p_deck_id
        and tag.normalized_name = v_normalized
        and tag.deleted_at is null;
    end loop;
    foreach v_tag_name in array coalesce(p_add_tags, '{}'::text[])
    loop
      v_tag_name := pg_catalog.btrim(v_tag_name);
      v_normalized := pg_catalog.lower(
        pg_catalog.regexp_replace(v_tag_name, '[[:space:]]+', ' ', 'g')
      );
      insert into public.tags (deck_id, name, normalized_name)
      values (p_deck_id, v_tag_name, v_normalized)
      on conflict (deck_id, normalized_name) where deleted_at is null do update
      set name = excluded.name
      returning * into v_tag;
      insert into public.note_tags (note_id, tag_id, created_by, deleted_at)
      values (v_note.id, v_tag.id, v_account_id, null)
      on conflict (note_id, tag_id) do update set deleted_at = null;
    end loop;
    update public.notes
    set version = version + 1, updated_by = v_account_id
    where id = v_note.id
    returning * into v_note;
    insert into public.content_change_impacts (
      deck_id, note_id, from_note_version, to_note_version,
      classification, affected_generation_keys, created_by
    ) values (
      p_deck_id, v_note.id, v_note.version - 1, v_note.version,
      'cosmetic', '{}'::text[], v_account_id
    );
  end loop;

  v_deck_result := private.bump_deck_content_version(
    p_deck_id,
    v_account_id,
    'notes_bulk_tagged',
    'Updated tags on ' || pg_catalog.cardinality(p_note_ids)::text || ' notes',
    p_idempotency_key
  );
  select pg_catalog.jsonb_build_object(
    'noteVersions', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', note.id, 'version', note.version)
      order by selected.ordinality
    ), '[]'::jsonb),
    'deckVersion', v_deck_result.version,
    'contentVersion', v_deck_result.current_version
  ) into v_response
  from pg_catalog.unnest(p_note_ids) with ordinality as selected(id, ordinality)
  join public.notes as note on note.id = selected.id;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.notes_bulk_tagged',
    'deck', p_deck_id, p_idempotency_key,
    pg_catalog.jsonb_build_object('noteCount', pg_catalog.cardinality(p_note_ids))
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note.bulk_tag', 'deck', p_deck_id, v_response
  );
  return v_response;
end;
$function$;

create or replace function public.current_bulk_move_notes(
  p_source_deck_id uuid,
  p_target_deck_id uuid,
  p_note_ids uuid[],
  p_expected_versions bigint[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_source public.decks;
  v_target public.decks;
  v_note public.notes;
  v_source_tag public.tags;
  v_target_tag public.tags;
  v_index integer;
  v_source_result public.decks;
  v_target_result public.decks;
  v_response jsonb;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note.bulk_move');
  if v_receipt.idempotency_key is not null then
    return v_receipt.response;
  end if;
  if p_source_deck_id = p_target_deck_id
    or coalesce(pg_catalog.cardinality(p_note_ids), 0) not between 1 and 100
    or pg_catalog.cardinality(p_note_ids) <> pg_catalog.cardinality(p_expected_versions)
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_note_ids) as id)
      <> pg_catalog.cardinality(p_note_ids) then
    raise exception using errcode = '22023', message = 'bulk move input is invalid';
  end if;

  perform 1 from public.decks as deck
  where deck.id in (p_source_deck_id, p_target_deck_id)
  order by deck.id
  for update;
  select * into v_source from public.decks where id = p_source_deck_id;
  select * into v_target from public.decks where id = p_target_deck_id;
  if v_source.id is null or v_target.id is null
    or v_source.status <> 'active' or v_target.status <> 'active'
    or v_source.owner_account_id <> v_target.owner_account_id
    or not private.can_edit_deck(v_account_id, p_source_deck_id)
    or not private.can_edit_deck(v_account_id, p_target_deck_id) then
    raise exception using errcode = '42501', message = 'source or target deck is unavailable';
  end if;

  perform 1 from public.notes as note
  where note.id = any(p_note_ids)
  order by note.id
  for update;
  if (
    select pg_catalog.count(*)
    from public.notes as note
    join public.note_types as note_type on note_type.id = note.note_type_id
    where note.id = any(p_note_ids)
      and note.deck_id = p_source_deck_id
      and note.deleted_at is null
      and (note_type.is_system or note_type.owner_account_id = v_target.owner_account_id)
  ) <> pg_catalog.cardinality(p_note_ids) then
    raise exception using errcode = '42501', message = 'one or more notes are unavailable';
  end if;
  for v_index in 1..pg_catalog.cardinality(p_note_ids)
  loop
    select * into strict v_note from public.notes where id = p_note_ids[v_index];
    if v_note.version <> p_expected_versions[v_index] then
      perform private.raise_content_conflict(
        'note', v_note.id, p_expected_versions[v_index], v_note.version
      );
    end if;
  end loop;

  for v_index in 1..pg_catalog.cardinality(p_note_ids)
  loop
    select * into strict v_note from public.notes where id = p_note_ids[v_index];
    perform private.record_note_revision(
      v_note.id, v_account_id, 'note_moved', extensions.gen_random_uuid()
    );
    for v_source_tag in
      select tag.*
      from public.note_tags as note_tag
      join public.tags as tag on tag.id = note_tag.tag_id
      where note_tag.note_id = v_note.id
        and note_tag.deleted_at is null
        and tag.deleted_at is null
      order by tag.normalized_name, tag.id
    loop
      insert into public.tags (deck_id, name, normalized_name, color)
      values (
        p_target_deck_id,
        v_source_tag.name,
        v_source_tag.normalized_name,
        v_source_tag.color
      )
      on conflict (deck_id, normalized_name) where deleted_at is null do update
      set name = excluded.name
      returning * into v_target_tag;
      update public.note_tags
      set deleted_at = pg_catalog.now()
      where note_id = v_note.id and tag_id = v_source_tag.id and deleted_at is null;
      insert into public.note_tags (note_id, tag_id, created_by, deleted_at)
      values (v_note.id, v_target_tag.id, v_account_id, null)
      on conflict (note_id, tag_id) do update set deleted_at = null;
    end loop;
    update public.notes
    set deck_id = p_target_deck_id,
        version = version + 1,
        updated_by = v_account_id
    where id = v_note.id
    returning * into v_note;
    update public.media_references
    set deck_id = p_target_deck_id, version = version + 1
    where note_id = v_note.id and deleted_at is null;
    insert into public.content_change_impacts (
      deck_id, note_id, from_note_version, to_note_version,
      classification, affected_generation_keys, created_by
    ) values (
      p_target_deck_id, v_note.id, v_note.version - 1, v_note.version,
      'structural', coalesce((
        select pg_catalog.array_agg(card.generation_key order by card.ordinal, card.id)
        from public.cards as card
        where card.note_id = v_note.id and card.active and card.deleted_at is null
      ), '{}'::text[]), v_account_id
    );
  end loop;

  v_source_result := private.bump_deck_content_version(
    p_source_deck_id,
    v_account_id,
    'notes_moved_out',
    'Moved ' || pg_catalog.cardinality(p_note_ids)::text || ' notes to another deck',
    extensions.gen_random_uuid()
  );
  v_target_result := private.bump_deck_content_version(
    p_target_deck_id,
    v_account_id,
    'notes_moved_in',
    'Received ' || pg_catalog.cardinality(p_note_ids)::text || ' moved notes',
    p_idempotency_key
  );
  select pg_catalog.jsonb_build_object(
    'noteVersions', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', note.id, 'version', note.version)
      order by selected.ordinality
    ), '[]'::jsonb),
    'sourceDeckVersion', v_source_result.version,
    'sourceContentVersion', v_source_result.current_version,
    'targetDeckVersion', v_target_result.version,
    'targetContentVersion', v_target_result.current_version
  ) into v_response
  from pg_catalog.unnest(p_note_ids) with ordinality as selected(id, ordinality)
  join public.notes as note on note.id = selected.id;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.notes_bulk_moved',
    'deck', p_target_deck_id, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'sourceDeckId', p_source_deck_id,
      'targetDeckId', p_target_deck_id,
      'noteCount', pg_catalog.cardinality(p_note_ids)
    )
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note.bulk_move', 'deck', p_target_deck_id, v_response
  );
  return v_response;
end;
$function$;

create or replace function public.current_get_library_counts()
returns table (
  active_decks bigint,
  archived_decks bigint,
  notes bigint,
  cards bigint,
  folders bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
begin
  return query
  select
    (select pg_catalog.count(*)
      from public.decks as deck
      where deck.status = 'active' and private.can_view_deck(v_account_id, deck.id)),
    (select pg_catalog.count(*)
      from public.decks as deck
      where deck.status = 'archived' and private.can_view_deck(v_account_id, deck.id)),
    (select pg_catalog.count(*)
      from public.notes as note
      join public.decks as deck on deck.id = note.deck_id
      where note.deleted_at is null
        and deck.status <> 'deleted'
        and private.can_view_deck(v_account_id, deck.id)),
    (select pg_catalog.count(*)
      from public.cards as card
      join public.notes as note on note.id = card.note_id
      join public.decks as deck on deck.id = note.deck_id
      where card.active and card.deleted_at is null and note.deleted_at is null
        and deck.status <> 'deleted'
        and private.can_view_deck(v_account_id, deck.id)),
    (select pg_catalog.count(*)
      from public.folders as folder
      where folder.owner_account_id = v_account_id and folder.status = 'active');
end;
$function$;

-- The public snapshot deliberately uses derived card identities and recursively
-- maps attached draft media IDs to opaque media public IDs.
create or replace function private.public_media_asset_is_attached(
  p_media_asset_id uuid,
  p_deck_public_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.decks as deck
    where deck.public_id = p_deck_public_id
      and (
        deck.cover_asset_id = p_media_asset_id
        or exists(
          select 1 from public.media_references as reference
          where reference.deck_id = deck.id
            and reference.media_asset_id = p_media_asset_id
            and reference.deleted_at is null
        )
        or exists(
          select 1
          from public.audio_prompts as prompt
          join public.notes as note on note.id = prompt.note_id
          where note.deck_id = deck.id and note.deleted_at is null
            and prompt.deleted_at is null and prompt.media_asset_id = p_media_asset_id
        )
        or exists(
          select 1
          from public.pronunciation_prompts as prompt
          join public.notes as note on note.id = prompt.note_id
          where note.deck_id = deck.id and note.deleted_at is null
            and prompt.deleted_at is null and prompt.reference_asset_id = p_media_asset_id
        )
        or exists(
          select 1
          from public.drawing_reference_layers as layer
          join public.notes as note on note.id = layer.note_id
          where note.deck_id = deck.id and note.deleted_at is null
            and layer.deleted_at is null and layer.media_asset_id = p_media_asset_id
        )
      )
  );
$function$;

create or replace function private.publicize_card_json(
  p_value jsonb,
  p_deck_public_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_candidate uuid;
  v_public_id uuid;
  v_text text;
begin
  if p_value is null then
    return 'null'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    return coalesce((
      select pg_catalog.jsonb_object_agg(
        entry.key,
        private.publicize_card_json(entry.value, p_deck_public_id)
      )
      from pg_catalog.jsonb_each(p_value) as entry(key, value)
    ), '{}'::jsonb);
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    return coalesce((
      select pg_catalog.jsonb_agg(
        private.publicize_card_json(item.value, p_deck_public_id)
        order by item.ordinality
      )
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as item(value, ordinality)
    ), '[]'::jsonb);
  elsif pg_catalog.jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
    if v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_candidate := v_text::uuid;
      if private.public_media_asset_is_attached(v_candidate, p_deck_public_id) then
        select asset.public_id into v_public_id
        from public.media_assets as asset
        where asset.id = v_candidate and asset.status = 'ready' and asset.deleted_at is null;
        if v_public_id is not null then
          return pg_catalog.to_jsonb(v_public_id::text);
        end if;
      end if;
    end if;
  end if;
  return p_value;
end;
$function$;

create or replace function private.template_uses_field(p_source text, p_field text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(p_source, '') ~ (
    '\{\{[^}]*\m'
    || pg_catalog.regexp_replace(p_field, '([\\.\[\]{}()*+?^$|])', '\\\1', 'g')
    || '\M[^}]*\}\}'
  );
$function$;

create or replace function private.filter_public_fields(
  p_fields jsonb,
  p_front_template text,
  p_back_template text
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from pg_catalog.jsonb_each(coalesce(p_fields, '{}'::jsonb)) as entry(key, value)
  where private.template_uses_field(p_front_template, entry.key)
    or private.template_uses_field(p_back_template, entry.key);
$function$;

create or replace function private.filter_custom_card_payload(
  p_payload jsonb,
  p_template_key text,
  p_front_template text,
  p_back_template text
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_authoring jsonb;
  v_filtered jsonb;
  v_templates jsonb;
begin
  v_authoring := case
    when p_payload ? 'authoringData' then p_payload -> 'authoringData'
    else p_payload
  end;
  if coalesce(v_authoring ->> 'kind', '') <> 'custom' then
    return p_payload;
  end if;
  select coalesce(pg_catalog.jsonb_agg(template.value - 'generationCondition'), '[]'::jsonb)
  into v_templates
  from pg_catalog.jsonb_array_elements(coalesce(v_authoring -> 'templates', '[]'::jsonb))
    as template(value)
  where template.value ->> 'semanticKey' = p_template_key;
  if pg_catalog.jsonb_array_length(v_templates) <> 1 then
    raise exception using errcode = '22023', message = 'published custom template is unavailable';
  end if;
  v_filtered := pg_catalog.jsonb_set(
    v_authoring,
    '{fields}',
    private.filter_public_fields(
      coalesce(v_authoring -> 'fields', '{}'::jsonb),
      p_front_template,
      p_back_template
    )
  );
  v_filtered := pg_catalog.jsonb_set(v_filtered, '{templates}', v_templates);
  if p_payload ? 'authoringData' then
    return pg_catalog.jsonb_set(p_payload, '{authoringData}', v_filtered);
  end if;
  return v_filtered;
end;
$function$;

create or replace function private.derive_public_card_id(
  p_deck_public_id uuid,
  p_internal_card_id uuid
)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_hex text;
begin
  v_hex := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'lumen:published-card:v1:' || p_deck_public_id::text || ':' || p_internal_card_id::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_hex := pg_catalog.substr(v_hex, 1, 12) || '5' || pg_catalog.substr(v_hex, 14, 3)
    || '8' || pg_catalog.substr(v_hex, 18, 15);
  return (
    pg_catalog.substr(v_hex, 1, 8) || '-' ||
    pg_catalog.substr(v_hex, 9, 4) || '-' ||
    pg_catalog.substr(v_hex, 13, 4) || '-' ||
    pg_catalog.substr(v_hex, 17, 4) || '-' ||
    pg_catalog.substr(v_hex, 21, 12)
  )::uuid;
end;
$function$;

create or replace function private.freeze_safe_card_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.card_public_id := private.derive_public_card_id(new.deck_public_id, new.card_public_id);
  new.field_values := private.publicize_card_json(
    private.filter_public_fields(new.field_values, new.front_template, new.back_template),
    new.deck_public_id
  );
  new.card_payload := private.publicize_card_json(
    private.filter_custom_card_payload(
      new.card_payload,
      new.template_key,
      new.front_template,
      new.back_template
    ),
    new.deck_public_id
  );
  new.source_references := private.publicize_card_json(
    new.source_references,
    new.deck_public_id
  );
  new.content_hash := private.content_hash(pg_catalog.jsonb_build_object(
    'cardPublicId', new.card_public_id,
    'ordinal', new.ordinal,
    'cardKind', new.card_kind,
    'generationKey', new.generation_key,
    'templateKey', new.template_key,
    'frontTemplate', new.front_template,
    'backTemplate', new.back_template,
    'stylingCss', new.styling_css,
    'fieldValues', new.field_values,
    'cardPayload', new.card_payload,
    'sourceReferences', new.source_references
  ));
  return new;
end;
$function$;

create or replace function private.freeze_safe_deck_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.content_hash := private.content_hash(pg_catalog.jsonb_build_object(
    'publicId', new.public_id,
    'slug', new.slug,
    'visibility', new.visibility,
    'title', new.title,
    'descriptionDoc', new.description_doc,
    'creatorHandle', new.creator_handle,
    'creatorDisplayName', new.creator_display_name,
    'license', new.license,
    'theme', new.theme,
    'languageFront', new.language_front,
    'languageBack', new.language_back,
    'coverMediaPublicId', new.cover_media_public_id,
    'publishedVersion', new.published_version,
    'cardCount', new.card_count,
    'cardKinds', new.card_kinds
  ));
  return new;
end;
$function$;

drop trigger if exists deck_publications_freeze_safe_projection on public.deck_publications;
create trigger deck_publications_freeze_safe_projection
before insert or update on public.deck_publications
for each row execute function private.freeze_safe_deck_publication();

drop trigger if exists card_publications_freeze_safe_projection on public.card_publications;
create trigger card_publications_freeze_safe_projection
before insert or update on public.card_publications
for each row execute function private.freeze_safe_card_publication();

-- Rebuild the public media API without a bucket or path. Exact path resolution
-- remains a server-only function used solely to mint short-lived signed URLs.
revoke all on public.published_media from public, anon, authenticated, service_role;
drop view public.published_media;
create view public.published_media
with (security_invoker = true, security_barrier = true)
as
select
  media.deck_public_id,
  media.media_public_id,
  media.kind,
  media.mime_type,
  media.byte_size,
  media.width,
  media.height,
  media.duration_ms,
  media.alt_text,
  media.published_at
from public.media_publications as media
join public.deck_publications as deck on deck.public_id = media.deck_public_id
where deck.visibility = 'public';

drop function public.get_public_deck_media(uuid);
create function public.get_public_deck_media(p_public_id uuid)
returns table (
  media_public_id uuid,
  kind public.media_kind,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  alt_text text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    media.media_public_id,
    media.kind,
    media.mime_type,
    media.byte_size,
    media.width,
    media.height,
    media.duration_ms,
    media.alt_text,
    media.published_at
  from public.media_publications as media
  where media.deck_public_id = p_public_id
    and exists(
      select 1 from public.deck_publications as publication
      where publication.public_id = p_public_id
        and publication.visibility in ('public', 'unlisted')
    )
  order by media.media_public_id;
$function$;

create or replace function public.admin_get_public_deck_media_storage(p_public_id uuid)
returns table (
  media_public_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select media.media_public_id, media.storage_bucket, media.storage_path
  from public.media_publications as media
  where media.deck_public_id = p_public_id
    and exists(
      select 1 from public.deck_publications as publication
      where publication.public_id = p_public_id
        and publication.visibility in ('public', 'unlisted')
    )
  order by media.media_public_id;
$function$;

-- Column grants make the frozen tables safe even if a caller bypasses the
-- convenience views. Unlisted rows remain reachable only through exact RPCs.
revoke all on public.deck_publications, public.card_publications, public.media_publications
from public, anon, authenticated, service_role;
grant select (
  public_id, slug, visibility, title, description_doc, description_plain,
  creator_handle, creator_display_name, license, theme, language_front,
  language_back, cover_media_public_id, published_version, card_count,
  card_kinds, content_hash, published_at, updated_at
) on public.deck_publications to anon, authenticated;
grant select (
  deck_public_id, card_public_id, ordinal, card_kind, generation_key,
  template_key, front_template, back_template, styling_css, field_values,
  card_payload, source_references, content_hash, published_at
) on public.card_publications to anon, authenticated;
grant select (
  deck_public_id, media_public_id, kind, mime_type, byte_size, width, height,
  duration_ms, alt_text, published_at
) on public.media_publications to anon, authenticated;
revoke all on public.published_media from public, anon, authenticated, service_role;
grant select on public.published_media to anon, authenticated;

revoke all on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_get_media_asset(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_bulk_move_notes(
  uuid, uuid, uuid[], bigint[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_get_library_counts()
from public, anon, authenticated, service_role;
revoke all on function public.get_public_deck_media(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_get_public_deck_media_storage(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) to authenticated;
grant execute on function public.current_get_media_asset(uuid) to authenticated;
grant execute on function public.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) to authenticated;
grant execute on function public.current_bulk_move_notes(
  uuid, uuid, uuid[], bigint[], uuid
) to authenticated;
grant execute on function public.current_get_library_counts() to authenticated;
grant execute on function public.get_public_deck_media(uuid) to anon, authenticated;
grant execute on function public.admin_get_public_deck_media_storage(uuid) to service_role;

revoke all on function private.public_media_asset_is_attached(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.publicize_card_json(jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.template_uses_field(text, text)
from public, anon, authenticated, service_role;
revoke all on function private.filter_public_fields(jsonb, text, text)
from public, anon, authenticated, service_role;
revoke all on function private.filter_custom_card_payload(jsonb, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function private.derive_public_card_id(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.freeze_safe_card_publication()
from public, anon, authenticated, service_role;
revoke all on function private.freeze_safe_deck_publication()
from public, anon, authenticated, service_role;

comment on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) is 'Atomic actor-derived note upsert and exact note-media reconciliation.';
comment on function public.current_bulk_move_notes(uuid, uuid, uuid[], bigint[], uuid)
is 'Moves at most 100 notes between editable decks owned by the same account while preserving note/card identities.';
comment on function public.admin_get_public_deck_media_storage(uuid)
is 'Service-role-only exact locator used to mint short-lived signed URLs; never exposed to browsers.';

commit;
