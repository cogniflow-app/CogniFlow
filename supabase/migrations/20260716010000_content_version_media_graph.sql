-- Make explicit media references part of the immutable deck-version contract
-- and restore that graph atomically with authored content. This migration is
-- additive because migrations through 07000 are already applied and 08000 /
-- 09000 are owned by separate final-audit fixes.

begin;

create or replace function private.capture_deck_content(p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'notes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', note.id,
          'noteTypeId', note.note_type_id,
          'createdBy', note.created_by,
          'version', note.version,
          'sortText', note.sort_text,
          'contentHash', note.content_hash,
          'sourceReference', note.source_reference,
          'sourceReferences', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', source.id,
                'semanticKey', source.semantic_key,
                'citationDoc', source.citation_doc,
                'title', source.title,
                'author', source.author,
                'url', source.url,
                'position', source.position
              ) order by source.position, source.id
            )
            from public.source_references as source
            where source.note_id = note.id and source.deleted_at is null
          ), '[]'::jsonb),
          'metadata', note.metadata,
          'cardPayload', note.card_payload,
          'createdAt', note.created_at,
          'fields', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', field_value.id,
                'fieldId', field_value.field_id,
                'valueDoc', field_value.value_doc,
                'plainText', field_value.plain_text,
                'normalizedText', field_value.normalized_text,
                'position', field_value.position,
                'version', field_value.version
              ) order by field_value.position, field_value.id
            )
            from public.note_field_values as field_value
            where field_value.note_id = note.id and field_value.deleted_at is null
          ), '[]'::jsonb),
          'tagNames', coalesce((
            select pg_catalog.jsonb_agg(tag.name order by tag.normalized_name)
            from public.note_tags as note_tag
            join public.tags as tag on tag.id = note_tag.tag_id
            where note_tag.note_id = note.id
              and note_tag.deleted_at is null
              and tag.deleted_at is null
          ), '[]'::jsonb)
        ) order by note.created_at, note.id
      )
      from public.notes as note
      where note.deck_id = p_deck_id and note.deleted_at is null
    ), '[]'::jsonb),
    'mediaReferences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', reference.id,
          'mediaAssetId', reference.media_asset_id,
          'noteId', reference.note_id,
          'fieldValueId', reference.field_value_id,
          'referenceType', reference.reference_type,
          'ownerId', reference.owner_id,
          'purpose', reference.purpose,
          'position', reference.position,
          'altText', reference.alt_text,
          'createdBy', reference.created_by,
          'createdAt', reference.created_at
        ) order by reference.id
      )
      from public.media_references as reference
      where reference.deck_id = p_deck_id
        and reference.deleted_at is null
        and (
          reference.note_id is null
          or exists(
            select 1
            from public.notes as referenced_note
            where referenced_note.id = reference.note_id
              and referenced_note.deck_id = p_deck_id
              and referenced_note.deleted_at is null
          )
        )
    ), '[]'::jsonb)
  );
$function$;

-- Remember the exact row created by the current content mutation. An ID
-- context is safe across xid epochs and also survives pgTAP/PLpgSQL successful
-- subtransactions, whose inserted-row xmin is a child xid rather than the
-- top-level pg_current_xact_id(). The setting is transaction-local.
do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.create_deck_version(uuid,uuid,text,text,uuid,bigint)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'  return v_version;',
    E'  perform pg_catalog.set_config(\n    ''lumen.created_deck_version_id'',\n    v_version.id::text,\n    true\n  );\n  return v_version;'
  );
  if v_rewritten = v_definition then
    raise exception 'created deck-version context rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

-- Record the exact receipt completed by this command. This supplements typed
-- xmin equality for successful PL/pgSQL subtransactions without weakening the
-- concurrent-waiter replay distinction; callers clear the context first.
do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.record_content_receipt(uuid,uuid,text,text,uuid,jsonb)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'    where receipt.account_id = p_account_id\n      and receipt.idempotency_key = p_idempotency_key;\n    return;',
    E'    where receipt.account_id = p_account_id\n      and receipt.idempotency_key = p_idempotency_key;\n    perform pg_catalog.set_config(\n      ''lumen.created_content_receipt'',\n      p_account_id::text || '':'' || p_idempotency_key::text || '':'' || p_operation,\n      true\n    );\n    return;'
  );
  if v_rewritten = v_definition then
    raise exception 'pending content receipt context rewrite did not match';
  end if;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'    v_response_fingerprint,\n    pg_catalog.now()\n  );\nend;',
    E'    v_response_fingerprint,\n    pg_catalog.now()\n  );\n  perform pg_catalog.set_config(\n    ''lumen.created_content_receipt'',\n    p_account_id::text || '':'' || p_idempotency_key::text || '':'' || p_operation,\n    true\n  );\nend;'
  );
  if v_rewritten = v_definition then
    raise exception 'inserted content receipt context rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

-- Deck creation inserts its empty row before the first version exists. Once
-- that schema-two version has been captured, align the canonical row to the
-- same exact capture without another version bump.
do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_create_deck(text,jsonb,uuid,public.deck_visibility,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'  perform private.create_deck_version(\n    v_deck.id, v_account_id, ''deck_created'', ''Deck created'', p_idempotency_key\n  );',
    E'  perform private.create_deck_version(\n    v_deck.id, v_account_id, ''deck_created'', ''Deck created'', p_idempotency_key\n  );\n  update public.decks as deck\n  set content_hash = private.content_hash(private.capture_deck_content(deck.id))\n  where deck.id = v_deck.id\n  returning deck.* into v_deck;'
  );
  if v_rewritten = v_definition then
    raise exception 'create-deck schema-two hash finalization rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

-- Deck versions remain append-only after their creating transaction. The one
-- narrow exception finalizes a row inserted by the current transaction after
-- explicit links have been reconciled. The trigger independently proves that
-- the replacement is the exact current capture and that no other column moved.
create or replace function private.guard_content_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_finalize_id uuid;
  v_subject uuid;
begin
  begin
    v_finalize_id := nullif(
      pg_catalog.current_setting('lumen.deck_version_snapshot_finalize', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    v_finalize_id := null;
  end;

  if tg_op = 'UPDATE' and tg_table_name = 'deck_versions' then
    if v_finalize_id = old.id
      and new.id = old.id
      and new.deck_id = old.deck_id
      and new.version_number = old.version_number
      and new.created_by = old.created_by
      and new.change_kind = old.change_kind
      and new.summary = old.summary
      and new.deck_snapshot = old.deck_snapshot
      and new.restored_from_version is not distinct from old.restored_from_version
      and new.idempotency_key = old.idempotency_key
      and new.created_at = old.created_at
      and new.content_snapshot = private.capture_deck_content(old.deck_id)
      and new.content_hash = private.content_hash(new.content_snapshot) then
      return new;
    end if;
  end if;

  begin
    v_subject := nullif(
      pg_catalog.current_setting('lumen.account_deletion_subject', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    v_subject := null;
  end;

  if tg_op = 'UPDATE'
    and v_subject is not null
    and new.deck_id = old.deck_id
    and exists(
      select 1 from public.decks as deck
      where deck.id = old.deck_id and deck.owner_account_id = v_subject
    ) then
    if tg_table_name = 'note_revisions' then
      if new.id = old.id
        and new.note_id = old.note_id
        and new.deck_id = old.deck_id
        and new.note_version = old.note_version
        and new.created_by = old.created_by
        and new.change_kind = old.change_kind
        and new.idempotency_key = old.idempotency_key
        and new.created_at = old.created_at then
        return new;
      end if;
    elsif tg_table_name = 'deck_versions' then
      if new.id = old.id
        and new.deck_id = old.deck_id
        and new.version_number = old.version_number
        and new.created_by = old.created_by
        and new.change_kind = old.change_kind
        and new.restored_from_version is not distinct from old.restored_from_version
        and new.idempotency_key = old.idempotency_key
        and new.created_at = old.created_at then
        return new;
      end if;
    end if;
  end if;

  raise exception using
    errcode = '55000',
    message = pg_catalog.format('%I is append-only', tg_table_name);
end;
$function$;

create or replace function private.finalize_current_deck_version_snapshot(
  p_deck_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_created_version_id uuid;
  v_hash text;
  v_previous_context text;
  v_snapshot jsonb;
  v_version_id uuid;
begin
  begin
    v_created_version_id := nullif(
      pg_catalog.current_setting('lumen.created_deck_version_id', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    v_created_version_id := null;
  end;
  if v_created_version_id is null then
    return;
  end if;

  select deck_version.id
  into v_version_id
  from public.decks as deck
  join public.deck_versions as deck_version
    on deck_version.deck_id = deck.id
    and deck_version.version_number = deck.current_version
  where deck.id = p_deck_id
    and deck_version.id = v_created_version_id
  for update of deck_version;

  if v_version_id is null then
    return;
  end if;

  v_snapshot := private.capture_deck_content(p_deck_id);
  v_hash := private.content_hash(v_snapshot);
  v_previous_context := pg_catalog.current_setting(
    'lumen.deck_version_snapshot_finalize',
    true
  );
  perform pg_catalog.set_config(
    'lumen.deck_version_snapshot_finalize',
    v_version_id::text,
    true
  );

  update public.deck_versions as deck_version
  set content_snapshot = v_snapshot,
      content_hash = v_hash
  where deck_version.id = v_version_id;

  perform pg_catalog.set_config(
    'lumen.deck_version_snapshot_finalize',
    coalesce(v_previous_context, ''),
    true
  );

  update public.decks as deck
  set content_hash = v_hash
  where deck.id = p_deck_id
    and deck.current_version = (
      select deck_version.version_number
      from public.deck_versions as deck_version
      where deck_version.id = v_version_id
    );
end;
$function$;

revoke all on function private.finalize_current_deck_version_snapshot(uuid)
from public, anon, authenticated, service_role;

-- Link reconciliation occurs after the note implementation has inserted its
-- version row. Finalize that row after every link state/metadata change; the
-- helper is a no-op unless the row was inserted by this same transaction.
create or replace function private.adjust_media_reference_count()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    perform private.adjust_embedded_media_asset_usage(new.media_asset_id, 1);
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      perform private.adjust_embedded_media_asset_usage(old.media_asset_id, -1);
    elsif old.deleted_at is not null and new.deleted_at is null then
      perform private.adjust_embedded_media_asset_usage(new.media_asset_id, 1);
    end if;
  end if;

  perform private.finalize_current_deck_version_snapshot(
    case when tg_op = 'INSERT' then new.deck_id else coalesce(new.deck_id, old.deck_id) end
  );
  return new;
end;
$function$;

drop trigger media_references_adjust_count on public.media_references;
create trigger media_references_adjust_count
after insert or update on public.media_references
for each row execute function private.adjust_media_reference_count();

revoke all on function private.adjust_media_reference_count()
from public, anon, authenticated, service_role;

create or replace function private.collect_deck_media_asset_ids(p_deck_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  with usage_ids as (
    select reference.media_asset_id
    from public.media_references as reference
    where reference.deck_id = p_deck_id and reference.deleted_at is null
    union
    select deck.cover_asset_id
    from public.decks as deck
    where deck.id = p_deck_id
      and deck.cover_asset_id is not null
      and deck.status <> 'deleted'
    union
    select prompt.media_asset_id
    from public.audio_prompts as prompt
    join public.notes as note on note.id = prompt.note_id
    where note.deck_id = p_deck_id
      and note.deleted_at is null
      and prompt.deleted_at is null
      and prompt.media_asset_id is not null
    union
    select prompt.reference_asset_id
    from public.pronunciation_prompts as prompt
    join public.notes as note on note.id = prompt.note_id
    where note.deck_id = p_deck_id
      and note.deleted_at is null
      and prompt.deleted_at is null
      and prompt.reference_asset_id is not null
    union
    select layer.media_asset_id
    from public.drawing_reference_layers as layer
    join public.notes as note on note.id = layer.note_id
    where note.deck_id = p_deck_id
      and note.deleted_at is null
      and layer.deleted_at is null
      and layer.media_asset_id is not null
  )
  select coalesce(
    pg_catalog.array_agg(usage.media_asset_id order by usage.media_asset_id),
    '{}'::uuid[]
  )
  from usage_ids as usage;
$function$;

create or replace function private.reconcile_media_reference_counts(
  p_media_asset_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if coalesce(pg_catalog.cardinality(p_media_asset_ids), 0) = 0 then
    return;
  end if;

  perform 1
  from public.media_assets as asset
  where asset.id = any(p_media_asset_ids)
  order by asset.id
  for update;

  if exists(
    with usage_rows as (
      select reference.media_asset_id
      from public.media_references as reference
      where reference.deleted_at is null
      union all
      select deck.cover_asset_id
      from public.decks as deck
      where deck.cover_asset_id is not null and deck.status <> 'deleted'
      union all
      select prompt.media_asset_id
      from public.audio_prompts as prompt
      join public.notes as note on note.id = prompt.note_id
      where prompt.media_asset_id is not null
        and prompt.deleted_at is null
        and note.deleted_at is null
      union all
      select prompt.reference_asset_id
      from public.pronunciation_prompts as prompt
      join public.notes as note on note.id = prompt.note_id
      where prompt.reference_asset_id is not null
        and prompt.deleted_at is null
        and note.deleted_at is null
      union all
      select layer.media_asset_id
      from public.drawing_reference_layers as layer
      join public.notes as note on note.id = layer.note_id
      where layer.media_asset_id is not null
        and layer.deleted_at is null
        and note.deleted_at is null
    ), expected_usage as (
      select usage.media_asset_id, pg_catalog.count(*)::integer as usage_count
      from usage_rows as usage
      where usage.media_asset_id = any(p_media_asset_ids)
      group by usage.media_asset_id
    )
    select 1
    from expected_usage as expected
    left join public.media_assets as asset on asset.id = expected.media_asset_id
    where expected.usage_count > 0
      and (
        asset.id is null
        or asset.deleted_at is not null
        or not asset.magic_verified
        or asset.status not in ('ready', 'deleting')
        or exists(
          select 1
          from private.content_media_deletion_jobs as job
          where job.media_asset_id = expected.media_asset_id
        )
      )
  ) then
    raise exception using errcode = '55000', message = 'media asset is unavailable';
  end if;

  with usage_rows as (
    select reference.media_asset_id
    from public.media_references as reference
    where reference.deleted_at is null
    union all
    select deck.cover_asset_id
    from public.decks as deck
    where deck.cover_asset_id is not null and deck.status <> 'deleted'
    union all
    select prompt.media_asset_id
    from public.audio_prompts as prompt
    join public.notes as note on note.id = prompt.note_id
    where prompt.media_asset_id is not null
      and prompt.deleted_at is null
      and note.deleted_at is null
    union all
    select prompt.reference_asset_id
    from public.pronunciation_prompts as prompt
    join public.notes as note on note.id = prompt.note_id
    where prompt.reference_asset_id is not null
      and prompt.deleted_at is null
      and note.deleted_at is null
    union all
    select layer.media_asset_id
    from public.drawing_reference_layers as layer
    join public.notes as note on note.id = layer.note_id
    where layer.media_asset_id is not null
      and layer.deleted_at is null
      and note.deleted_at is null
  ), expected_usage as (
    select usage.media_asset_id, pg_catalog.count(*)::integer as usage_count
    from usage_rows as usage
    where usage.media_asset_id = any(p_media_asset_ids)
    group by usage.media_asset_id
  )
  update public.media_assets as asset
  set reference_count = coalesce(expected.usage_count, 0),
      status = case
        when coalesce(expected.usage_count, 0) > 0 and asset.status = 'deleting'
          then 'ready'::public.media_status
        when coalesce(expected.usage_count, 0) = 0 and asset.status = 'ready'
          then 'deleting'::public.media_status
        else asset.status
      end,
      delete_after = case
        when coalesce(expected.usage_count, 0) > 0 then null
        when coalesce(expected.usage_count, 0) = 0
          and asset.status in ('ready', 'deleting')
          then coalesce(asset.delete_after, pg_catalog.now() + interval '7 days')
        else asset.delete_after
      end,
      version = asset.version + 1
  from (
    select candidate.id, usage.usage_count
    from public.media_assets as candidate
    left join expected_usage as usage on usage.media_asset_id = candidate.id
    where candidate.id = any(p_media_asset_ids)
  ) as expected
  where asset.id = expected.id
    and (
      asset.reference_count is distinct from coalesce(expected.usage_count, 0)
      or (
        coalesce(expected.usage_count, 0) > 0
        and (asset.status = 'deleting' or asset.delete_after is not null)
      )
      or (
        coalesce(expected.usage_count, 0) = 0
        and asset.status = 'ready'
      )
    );
end;
$function$;

revoke all on function private.collect_deck_media_asset_ids(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.reconcile_media_reference_counts(uuid[])
from public, anon, authenticated, service_role;

-- The browser-callable note RPC must not trust the route to construct its
-- attachment graph. Walk only the closed authoringData object, recognize exact
-- media identity keys (not text fragments or similarly named keys), carry the
-- kind asserted by each closed authoring shape, and preserve a stable path and
-- accessibility fallback for legacy snapshot reconstruction.
create or replace function private.collect_embedded_media_requirements(
  p_value jsonb,
  p_depth integer,
  p_context_kind public.media_kind,
  p_context_alt_text text,
  p_path text
)
returns table (
  media_asset_id uuid,
  expected_kind public.media_kind,
  alt_text text,
  media_path text
)
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_asset_text text;
  v_child record;
  v_child_alt_text text;
  v_child_kind public.media_kind;
  v_local_alt_text text;
  v_local_kind public.media_kind;
begin
  if p_depth > 64 then
    raise exception using
      errcode = '22023',
      message = 'note media links do not match authoring payload';
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    return;
  end if;

  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    if p_value ->> 'kind' = 'media' then
      if not (p_value ? 'assetId')
        or pg_catalog.jsonb_typeof(p_value -> 'mediaKind') <> 'string'
        or coalesce(p_value ->> 'mediaKind', '') not in ('image', 'audio')
        or pg_catalog.jsonb_typeof(p_value -> 'alt') <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_value ->> 'alt', '')))
          not between 1 and 2000 then
        raise exception using
          errcode = '22023',
          message = 'note media links do not match authoring payload';
      end if;
      v_local_kind := (p_value ->> 'mediaKind')::public.media_kind;
      v_local_alt_text := nullif(pg_catalog.btrim(coalesce(p_value ->> 'alt', '')), '');
    end if;

    if p_value ->> 'type' in ('image', 'audio')
      and (
        pg_catalog.jsonb_typeof(p_value -> 'attrs') <> 'object'
        or not ((p_value -> 'attrs') ? 'assetId')
      ) then
      raise exception using
        errcode = '22023',
        message = 'note media links do not match authoring payload';
    end if;

    for v_child in
      select entry.key, entry.value
      from pg_catalog.jsonb_each(p_value) as entry(key, value)
      order by entry.key
    loop
      if v_child.key in (
        'assetId', 'imageAssetId', 'referenceAssetId', 'annotationAssetId'
      ) then
        if pg_catalog.jsonb_typeof(v_child.value) <> 'string'
          or (v_child.value #>> '{}')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception using
            errcode = '22023',
            message = 'note media links do not match authoring payload';
        end if;
        v_asset_text := v_child.value #>> '{}';
        media_asset_id := v_asset_text::uuid;
        expected_kind := case v_child.key
          when 'imageAssetId' then 'image'::public.media_kind
          when 'annotationAssetId' then 'image'::public.media_kind
          when 'referenceAssetId' then 'audio'::public.media_kind
          else coalesce(v_local_kind, p_context_kind)
        end;
        alt_text := case v_child.key
          when 'imageAssetId' then nullif(
            pg_catalog.btrim(coalesce(p_value ->> 'imageAlt', '')),
            ''
          )
          when 'referenceAssetId' then nullif(
            pg_catalog.btrim(coalesce(
              p_value ->> 'text',
              p_value ->> 'transcript',
              ''
            )),
            ''
          )
          when 'annotationAssetId' then nullif(
            pg_catalog.btrim(
              coalesce(p_value ->> 'alt', p_context_alt_text, 'Image')
              || ' annotation'
            ),
            ''
          )
          else coalesce(
            v_local_alt_text,
            nullif(pg_catalog.btrim(coalesce(
              p_value ->> 'alt',
              p_value ->> 'imageAlt',
              p_value ->> 'transcript',
              p_context_alt_text,
              ''
            )), '')
          )
        end;
        media_path := p_path || '.' || v_child.key;
        return next;
      else
        v_child_kind := null;
        v_child_alt_text := null;
        if v_child.key = 'attrs' and p_value ->> 'type' in ('image', 'audio') then
          v_child_kind := (p_value ->> 'type')::public.media_kind;
          v_child_alt_text := nullif(pg_catalog.btrim(coalesce(
            v_child.value ->> 'alt',
            v_child.value ->> 'transcript',
            ''
          )), '');
        elsif v_child.key = 'audioPrompt' then
          v_child_kind := 'audio'::public.media_kind;
        elsif v_child.key = 'drawingLayers' then
          v_child_kind := 'image'::public.media_kind;
        end if;
        return query
        select requirement.media_asset_id,
          requirement.expected_kind,
          requirement.alt_text,
          requirement.media_path
        from private.collect_embedded_media_requirements(
          v_child.value,
          p_depth + 1,
          v_child_kind,
          v_child_alt_text,
          p_path || '.' || v_child.key
        ) as requirement;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    for v_child in
      select item.value, item.position
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as item(value, position)
      order by item.position
    loop
      return query
      select requirement.media_asset_id,
        requirement.expected_kind,
        requirement.alt_text,
        requirement.media_path
      from private.collect_embedded_media_requirements(
        v_child.value,
        p_depth + 1,
        p_context_kind,
        p_context_alt_text,
        p_path || '[' || v_child.position::text || ']'
      ) as requirement;
    end loop;
  end if;
end;
$function$;

create or replace function private.collect_embedded_media_asset_ids(
  p_value jsonb,
  p_depth integer
)
returns uuid[]
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.array_agg(
      distinct requirement.media_asset_id
      order by requirement.media_asset_id
    ),
    '{}'::uuid[]
  )
  from private.collect_embedded_media_requirements(
    p_value,
    p_depth,
    null,
    null,
    '$'
  ) as requirement;
$function$;

create or replace function private.assert_card_payload_media_links(
  p_card_payload jsonb,
  p_media_links jsonb,
  p_account_id uuid,
  p_deck_id uuid,
  p_note_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_embedded_ids uuid[];
  v_link_ids uuid[];
begin
  if p_account_id is null
    or p_deck_id is null
    or p_card_payload is null
    or pg_catalog.jsonb_typeof(p_card_payload) <> 'object'
    or pg_catalog.jsonb_typeof(p_card_payload -> 'authoringData') <> 'object'
    or p_media_links is null
    or pg_catalog.jsonb_typeof(p_media_links) <> 'array'
    or exists(
      select 1
      from pg_catalog.jsonb_array_elements(p_media_links) as link(value)
      where pg_catalog.jsonb_typeof(link.value) <> 'object'
        or pg_catalog.jsonb_typeof(link.value -> 'assetId') <> 'string'
        or coalesce(link.value ->> 'assetId', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'note media links do not match authoring payload';
  end if;

  v_embedded_ids := private.collect_embedded_media_asset_ids(
    p_card_payload -> 'authoringData',
    0
  );
  select coalesce(
    pg_catalog.array_agg(
      distinct (link.value ->> 'assetId')::uuid
      order by (link.value ->> 'assetId')::uuid
    ),
    '{}'::uuid[]
  )
  into v_link_ids
  from pg_catalog.jsonb_array_elements(p_media_links) as link(value);

  if v_embedded_ids is distinct from v_link_ids
    or pg_catalog.cardinality(v_link_ids)
      <> pg_catalog.jsonb_array_length(p_media_links)
    or exists(
      with requirements as materialized (
        select requirement.media_asset_id,
          requirement.expected_kind
        from private.collect_embedded_media_requirements(
          p_card_payload -> 'authoringData',
          0,
          null,
          null,
          '$'
        ) as requirement
      ), invalid_requirement as (
        select requirement.media_asset_id
        from requirements as requirement
        where requirement.expected_kind is not null
        group by requirement.media_asset_id
        having pg_catalog.count(distinct requirement.expected_kind) > 1
        union all
        select requirement.media_asset_id
        from requirements as requirement
        left join public.media_assets as asset
          on asset.id = requirement.media_asset_id
        where asset.id is null
          or not (
            asset.owner_account_id = p_account_id
            or (
              p_note_id is not null
              and exists(
                select 1
                from public.media_references as inherited_reference
                where inherited_reference.media_asset_id = requirement.media_asset_id
                  and inherited_reference.deck_id = p_deck_id
                  and inherited_reference.note_id = p_note_id
                  and inherited_reference.deleted_at is null
              )
            )
          )
          or asset.deleted_at is not null
          or not asset.magic_verified
          or asset.status not in ('ready', 'deleting')
          or (
            requirement.expected_kind is not null
            and asset.kind <> requirement.expected_kind
          )
          or exists(
            select 1
            from private.content_media_deletion_jobs as job
            where job.media_asset_id = requirement.media_asset_id
          )
      )
      select 1 from invalid_requirement
    ) then
    raise exception using
      errcode = '22023',
      message = 'note media links do not match authoring payload';
  end if;
end;
$function$;

revoke all on function private.collect_embedded_media_requirements(
  jsonb, integer, public.media_kind, text, text
) from public, anon, authenticated, service_role;
revoke all on function private.collect_embedded_media_asset_ids(jsonb, integer)
from public, anon, authenticated, service_role;
revoke all on function private.assert_card_payload_media_links(
  jsonb, jsonb, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;

create or replace function private.note_media_reconcile_context_allows(
  p_note_id uuid,
  p_media_asset_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_asset_ids uuid[];
  v_context_note_id uuid;
begin
  begin
    v_context_note_id := nullif(
      pg_catalog.current_setting('lumen.note_media_reconcile_note_id', true),
      ''
    )::uuid;
    v_asset_ids := coalesce(
      nullif(
        pg_catalog.current_setting('lumen.note_media_reconcile_asset_ids', true),
        ''
      )::uuid[],
      '{}'::uuid[]
    );
  exception when invalid_text_representation then
    return false;
  end;
  return v_context_note_id = p_note_id
    and p_media_asset_id = any(v_asset_ids);
end;
$function$;

revoke all on function private.note_media_reconcile_context_allows(uuid, uuid)
from public, anon, authenticated, service_role;

do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_upsert_note_definition_with_media(uuid,uuid,text,bigint,jsonb,jsonb,text[],jsonb,uuid,jsonb)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'begin\n  perform private.require_content_expected_version(p_expected_version);',
    E'begin\n  perform private.assert_card_payload_media_links(p_card_payload, p_media_links, v_account_id, p_deck_id, p_note_id);\n  perform private.require_content_expected_version(p_expected_version);'
  );
  if v_rewritten = v_definition then
    raise exception 'note media graph validation rewrite did not match';
  end if;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'  v_response := private.content_upsert_note_with_media_unchecked(',
    E'  perform pg_catalog.set_config(\n    ''lumen.note_media_reconcile_note_id'',\n    coalesce(p_note_id::text, ''''),\n    true\n  );\n  perform pg_catalog.set_config(\n    ''lumen.note_media_reconcile_asset_ids'',\n    (\n      select coalesce(\n        pg_catalog.array_agg(\n          (link.value ->> ''assetId'')::uuid\n          order by (link.value ->> ''assetId'')::uuid\n        ),\n        ''{}''::uuid[]\n      )::text\n      from pg_catalog.jsonb_array_elements(p_media_links) as link(value)\n    ),\n    true\n  );\n  v_response := private.content_upsert_note_with_media_unchecked('
  );
  if v_rewritten = v_definition then
    raise exception 'note media reconciliation context start rewrite did not match';
  end if;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'    extensions.gen_random_uuid()\n  );\n  v_note_id :=',
    E'    extensions.gen_random_uuid()\n  );\n  perform pg_catalog.set_config(\n    ''lumen.note_media_reconcile_note_id'',\n    '''',\n    true\n  );\n  perform pg_catalog.set_config(\n    ''lumen.note_media_reconcile_asset_ids'',\n    '''',\n    true\n  );\n  v_note_id :='
  );
  if v_rewritten = v_definition then
    raise exception 'note media reconciliation context end rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

create or replace function private.restore_context_contains_note_media(
  p_note_id uuid,
  p_media_asset_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_deck_id uuid;
  v_version_number bigint;
begin
  begin
    v_deck_id := nullif(
      pg_catalog.current_setting('lumen.restore_deck_id', true),
      ''
    )::uuid;
    v_version_number := nullif(
      pg_catalog.current_setting('lumen.restore_version_number', true),
      ''
    )::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      return false;
  end;
  if v_deck_id is null or v_version_number is null then
    return false;
  end if;
  return exists(
    select 1
    from public.deck_versions as deck_version
    cross join lateral pg_catalog.jsonb_array_elements(
      deck_version.content_snapshot -> 'notes'
    ) as snapshot_note(value)
    cross join lateral private.collect_embedded_media_requirements(
      snapshot_note.value -> 'cardPayload',
      0,
      null,
      null,
      '$'
    ) as requirement
    where deck_version.deck_id = v_deck_id
      and deck_version.version_number = v_version_number
      and snapshot_note.value ->> 'id' = p_note_id::text
      and requirement.media_asset_id = p_media_asset_id
      and exists(
        select 1
        from public.notes as note
        where note.id = p_note_id
          and note.deck_id = v_deck_id
          and note.deleted_at is null
      )
  );
end;
$function$;

revoke all on function private.restore_context_contains_note_media(uuid, uuid)
from public, anon, authenticated, service_role;

-- Specialized audio/pronunciation/drawing rows are persisted before the
-- explicit-link reconciler runs. Preserve collaborator-owned media only when
-- the same deck/note link is active or was retired by this command; arbitrary
-- old tombstones/foreign assets fail and child triggers retain the job fence.
do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.persist_specialized_card_payload(uuid,text,jsonb,uuid)'::regprocedure
  ) into strict v_definition;

  v_rewritten := pg_catalog.replace(
    v_definition,
    E'where asset.id = v_asset_id and asset.owner_account_id = p_actor_account_id\n        and asset.status = ''ready'' and asset.kind = ''audio''',
    E'where asset.id = v_asset_id\n        and (\n          asset.owner_account_id = p_actor_account_id\n          or exists(\n            select 1\n            from public.media_references as inherited_reference\n            join public.notes as inherited_note\n              on inherited_note.id = p_note_id\n             and inherited_note.deck_id = inherited_reference.deck_id\n             and inherited_note.deleted_at is null\n            where inherited_reference.media_asset_id = asset.id\n              and inherited_reference.note_id = p_note_id\n          )\n        )\n        and asset.status in (''ready'', ''deleting'')\n        and asset.kind = ''audio'''
  );
  if v_rewritten = v_definition then
    raise exception 'specialized audio/pronunciation ownership rewrite did not match';
  end if;
  v_definition := v_rewritten;

  v_rewritten := pg_catalog.replace(
    v_definition,
    E'where asset.id = v_asset_id and asset.owner_account_id = p_actor_account_id\n          and asset.status = ''ready'' and asset.kind = ''image''',
    E'where asset.id = v_asset_id\n          and (\n            asset.owner_account_id = p_actor_account_id\n            or exists(\n              select 1\n              from public.media_references as inherited_reference\n              join public.notes as inherited_note\n                on inherited_note.id = p_note_id\n               and inherited_note.deck_id = inherited_reference.deck_id\n               and inherited_note.deleted_at is null\n              where inherited_reference.media_asset_id = asset.id\n                and inherited_reference.note_id = p_note_id\n            )\n          )\n          and asset.status in (''ready'', ''deleting'')\n          and asset.kind = ''image'''
  );
  if v_rewritten = v_definition then
    raise exception 'specialized drawing ownership rewrite did not match';
  end if;
  v_definition := v_rewritten;

  v_rewritten := pg_catalog.replace(
    v_definition,
    E'              and inherited_reference.note_id = p_note_id\n          )',
    E'              and inherited_reference.note_id = p_note_id\n              and (\n                inherited_reference.deleted_at is null\n                or inherited_reference.xmin = pg_catalog.pg_current_xact_id()::xid\n                or private.restore_context_contains_note_media(\n                  p_note_id,\n                  asset.id\n                )\n              )\n          )'
  );
  if v_rewritten = v_definition then
    raise exception 'specialized audio current-link proof rewrite did not match';
  end if;
  v_definition := v_rewritten;

  v_rewritten := pg_catalog.replace(
    v_definition,
    E'                and inherited_reference.note_id = p_note_id\n            )',
    E'                and inherited_reference.note_id = p_note_id\n                and (\n                  inherited_reference.deleted_at is null\n                  or inherited_reference.xmin = pg_catalog.pg_current_xact_id()::xid\n                  or private.restore_context_contains_note_media(\n                    p_note_id,\n                    asset.id\n                  )\n                )\n            )'
  );
  if v_rewritten = v_definition then
    raise exception 'specialized drawing current-link proof rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

-- An editor may retain media already attached to the same note even when a
-- different collaborator owns the asset. The atomic reconciler releases a
-- moved purpose/position before re-linking it, so only active/current-command
-- tombstones are accepted; old tombstones/new notes remain owner-only.
do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_link_media(uuid,public.media_reference_type,uuid,public.media_reference_purpose,integer,text,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'where asset.id = p_media_asset_id and asset.owner_account_id = v_account_id\n    and asset.status in (''ready'', ''deleting'') for update;',
    E'where asset.id = p_media_asset_id\n    and (\n      asset.owner_account_id = v_account_id\n      or (\n        p_owner_type = ''note''\n        and exists(\n          select 1\n          from public.media_references as inherited_reference\n          join public.notes as inherited_note\n            on inherited_note.id = p_owner_id\n           and inherited_note.deck_id = inherited_reference.deck_id\n           and inherited_note.deleted_at is null\n          where inherited_reference.media_asset_id = asset.id\n            and inherited_reference.note_id = p_owner_id\n            and (\n              inherited_reference.deleted_at is null\n              or inherited_reference.xmin = pg_catalog.pg_current_xact_id()::xid\n              or private.note_media_reconcile_context_allows(\n                p_owner_id,\n                asset.id\n              )\n            )\n            and private.can_edit_deck(v_account_id, inherited_reference.deck_id)\n        )\n      )\n    )\n    and asset.status in (''ready'', ''deleting'') for update;'
  );
  if v_rewritten = v_definition then
    raise exception 'current_link_media inherited-note rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

create or replace function private.duplicate_note_embedded_media_references(
  p_source_deck_id uuid,
  p_source_note_id uuid,
  p_target_deck_id uuid,
  p_target_note_id uuid,
  p_actor_account_id uuid,
  p_card_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_alt_text text;
  v_asset public.media_assets;
  v_position integer := 0;
  v_requirement record;
begin
  if not exists(
    select 1
    from public.decks as source_deck
    join public.notes as source_note
      on source_note.id = p_source_note_id
     and source_note.deck_id = source_deck.id
     and source_note.deleted_at is null
    join public.decks as target_deck
      on target_deck.id = p_target_deck_id
     and target_deck.owner_account_id = p_actor_account_id
    join public.notes as target_note
      on target_note.id = p_target_note_id
     and target_note.deck_id = target_deck.id
     and target_note.deleted_at is null
    where source_deck.id = p_source_deck_id
      and source_deck.owner_account_id = p_actor_account_id
  ) or exists(
    select 1
    from private.collect_embedded_media_requirements(
      p_card_payload, 0, null, null, '$'
    ) as requirement
    where requirement.expected_kind is not null
    group by requirement.media_asset_id
    having pg_catalog.count(distinct requirement.expected_kind) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'source deck media cannot be duplicated';
  end if;

  for v_requirement in
    select requirement.media_asset_id,
      (pg_catalog.array_agg(
        requirement.expected_kind
        order by (requirement.expected_kind is null), requirement.media_path
      ))[1] as expected_kind,
      (pg_catalog.array_agg(
        requirement.alt_text
        order by (requirement.alt_text is null), requirement.media_path
      ))[1] as alt_text,
      pg_catalog.min(requirement.media_path) as media_path
    from private.collect_embedded_media_requirements(
      p_card_payload, 0, null, null, '$'
    ) as requirement
    group by requirement.media_asset_id
    order by pg_catalog.min(requirement.media_path), requirement.media_asset_id
  loop
    select asset.*
    into v_asset
    from public.media_assets as asset
    where asset.id = v_requirement.media_asset_id
    for update;
    if not found
      or v_asset.owner_account_id <> p_actor_account_id
      or v_asset.deleted_at is not null
      or not v_asset.magic_verified
      or v_asset.status not in ('ready', 'deleting')
      or (
        v_requirement.expected_kind is not null
        and v_asset.kind <> v_requirement.expected_kind
      )
      or exists(
        select 1
        from private.content_media_deletion_jobs as job
        where job.media_asset_id = v_requirement.media_asset_id
      ) then
      raise exception using
        errcode = '55000',
        message = 'source deck media cannot be duplicated';
    end if;
    v_alt_text := coalesce(
      v_requirement.alt_text,
      v_asset.alt_text,
      case when v_asset.kind = 'image' then 'Duplicated image' end
    );
    perform public.current_link_media(
      v_asset.id,
      'note'::public.media_reference_type,
      p_target_note_id,
      'prompt'::public.media_reference_purpose,
      v_position,
      case when v_alt_text is null then null
        else pg_catalog.left(v_alt_text, 1000)
      end,
      extensions.gen_random_uuid()
    );
    v_position := v_position + 1;
  end loop;
exception
  when sqlstate '22023' or invalid_text_representation then
    raise exception using
      errcode = '55000',
      message = 'source deck media cannot be duplicated';
end;
$function$;

revoke all on function private.duplicate_note_embedded_media_references(
  uuid, uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;

do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_duplicate_deck(uuid,text,uuid,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'    perform private.persist_specialized_card_payload(\n      v_new_note.id, v_note_type_code, v_source_note.card_payload, v_account_id\n    );',
    E'    perform private.persist_specialized_card_payload(\n      v_new_note.id, v_note_type_code, v_source_note.card_payload, v_account_id\n    );\n    perform private.duplicate_note_embedded_media_references(\n      p_source_deck_id, v_source_note.id, v_deck.id, v_new_note.id,\n      v_account_id, v_source_note.card_payload\n    );'
  );
  if v_rewritten = v_definition then
    raise exception 'duplicate-deck media graph rewrite did not match';
  end if;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'  if not found or not private.can_view_deck(v_account_id, p_source_deck_id)\n    or v_source.status = ''deleted'' then\n    raise exception using errcode = ''42501'', message = ''source deck is unavailable'';\n  end if;',
    E'  if not found or v_source.owner_account_id <> v_account_id\n    or v_source.status = ''deleted'' then\n    raise exception using\n      errcode = ''42501'',\n      message = ''only the source owner can duplicate a deck'';\n  end if;'
  );
  if v_rewritten = v_definition then
    raise exception 'duplicate-deck owner boundary rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

revoke all on function public.current_duplicate_deck(
  uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.current_duplicate_deck(
  uuid, text, uuid, uuid
) to authenticated;

-- Frozen/public JSON may contain public media IDs, but it must never retain an
-- internal media_assets.id. Map attached verified assets and fail closed for
-- every other internal identity, including legacy payloads without links.
create or replace function private.text_contains_internal_media_id(
  p_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from pg_catalog.regexp_matches(
      coalesce(p_value, ''),
      '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
      'gi'
    ) as candidate(value)
    join public.media_assets as asset
      on asset.id = (candidate.value)[1]::uuid
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
  v_asset public.media_assets;
  v_candidate uuid;
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
      select asset.*
      into v_asset
      from public.media_assets as asset
      where asset.id = v_candidate;
      if found then
        if v_asset.status = 'ready'
          and v_asset.deleted_at is null
          and v_asset.magic_verified
          and private.public_media_asset_is_attached(
            v_asset.id,
            p_deck_public_id
          ) then
          return pg_catalog.to_jsonb(v_asset.public_id::text);
        end if;
        raise exception using
          errcode = '55000',
          message = 'card publication contains an unavailable internal media identity';
      end if;
    end if;
    if private.text_contains_internal_media_id(v_text) then
      raise exception using
        errcode = '55000',
        message = 'card publication contains an unavailable internal media identity';
    end if;
  end if;
  return p_value;
end;
$function$;

-- Public searchable text is a deterministic derivative of the already
-- publicized rich document. Never freeze the separately supplied draft
-- description_plain value: it is an untrusted cache and can diverge from the
-- document or carry an internal asset identity.
create or replace function private.extract_public_rich_text_fragment(
  p_value jsonb,
  p_depth integer
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_child jsonb;
  v_result text := '';
  v_type text;
begin
  if p_depth > 64
    or p_value is null
    or pg_catalog.jsonb_typeof(p_value) <> 'object' then
    raise exception using
      errcode = '55000',
      message = 'public deck description is invalid';
  end if;

  v_type := p_value ->> 'type';
  if v_type is null then
    raise exception using
      errcode = '55000',
      message = 'public deck description is invalid';
  elsif v_type = 'text' then
    if pg_catalog.jsonb_typeof(p_value -> 'text') <> 'string' then
      raise exception using
        errcode = '55000',
        message = 'public deck description is invalid';
    end if;
    v_result := p_value ->> 'text';
  elsif v_type in ('hardBreak', 'horizontalRule') then
    v_result := E'\n';
  elsif v_type in ('inlineMath', 'mathBlock') then
    v_result := coalesce(p_value -> 'attrs' ->> 'latex', '');
  elsif v_type = 'image' then
    v_result := coalesce(p_value -> 'attrs' ->> 'alt', '');
  elsif v_type = 'audio' then
    v_result := coalesce(p_value -> 'attrs' ->> 'transcript', '');
  elsif v_type = 'externalVideo' then
    v_result := coalesce(p_value -> 'attrs' ->> 'title', '');
  elsif p_value ? 'content' then
    if pg_catalog.jsonb_typeof(p_value -> 'content') <> 'array' then
      raise exception using
        errcode = '55000',
        message = 'public deck description is invalid';
    end if;
    for v_child in
      select child.value
      from pg_catalog.jsonb_array_elements(p_value -> 'content')
        with ordinality as child(value, position)
      order by child.position
    loop
      v_result := v_result || private.extract_public_rich_text_fragment(
        v_child,
        p_depth + 1
      );
    end loop;
  end if;

  if v_type in (
    'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList',
    'listItem', 'taskItem', 'blockquote', 'callout', 'citation',
    'table', 'tableRow', 'codeBlock', 'mathBlock'
  ) then
    v_result := v_result || E'\n';
  end if;
  if private.text_contains_internal_media_id(v_result) then
    raise exception using
      errcode = '55000',
      message = 'public deck description contains an internal media identity';
  end if;
  return v_result;
end;
$function$;

create or replace function private.extract_public_description_plain(
  p_description_doc jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plain text;
begin
  if p_description_doc is null
    or pg_catalog.jsonb_typeof(p_description_doc) <> 'object'
    or p_description_doc ->> 'type' <> 'doc'
    or pg_catalog.jsonb_typeof(p_description_doc -> 'content') <> 'array' then
    raise exception using
      errcode = '55000',
      message = 'public deck description is invalid';
  end if;
  v_plain := private.extract_public_rich_text_fragment(
    p_description_doc,
    0
  );
  v_plain := pg_catalog.regexp_replace(
    v_plain,
    E'[ \t]+\n',
    E'\n',
    'g'
  );
  v_plain := pg_catalog.regexp_replace(
    v_plain,
    E'\n{3,}',
    E'\n\n',
    'g'
  );
  v_plain := pg_catalog.btrim(v_plain, E' \t\n\r\f\v');
  if pg_catalog.char_length(v_plain) > 20000 then
    raise exception using
      errcode = '55000',
      message = 'public deck description is too long';
  end if;
  return v_plain;
end;
$function$;

create or replace function private.public_description_plain_is_exact(
  p_description_doc jsonb,
  p_description_plain text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return p_description_plain is not distinct from
    private.extract_public_description_plain(p_description_doc);
exception when others then
  -- Migration remediation must fail closed for malformed legacy projections
  -- without allowing one bad row to abort withdrawal of every affected deck.
  return false;
end;
$function$;

do $block$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.freeze_safe_deck_publication()'::regprocedure
  ) into strict v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    E'begin\n  new.content_hash := private.content_hash(',
    E'begin\n  new.description_doc := private.publicize_card_json(\n    new.description_doc,\n    new.public_id\n  );\n  new.description_plain := private.extract_public_description_plain(\n    new.description_doc\n  );\n  new.content_hash := private.content_hash('
  );
  if v_rewritten = v_definition then
    raise exception 'deck publication media privacy rewrite did not match';
  end if;
  execute v_rewritten;
end;
$block$;

create or replace function private.card_json_contains_internal_media_id(
  p_value jsonb,
  p_depth integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_child jsonb;
  v_text text;
begin
  if p_depth > 64 then
    return true;
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    for v_child in
      select entry.value
      from pg_catalog.jsonb_each(p_value) as entry(key, value)
    loop
      if private.card_json_contains_internal_media_id(
        v_child,
        p_depth + 1
      ) then
        return true;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    for v_child in
      select item.value
      from pg_catalog.jsonb_array_elements(p_value) as item(value)
    loop
      if private.card_json_contains_internal_media_id(
        v_child,
        p_depth + 1
      ) then
        return true;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
    if private.text_contains_internal_media_id(v_text) then
      return true;
    end if;
  end if;
  return false;
end;
$function$;

create or replace function private.withdraw_internal_media_publications()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_withdrawn integer;
begin
  with affected as materialized (
    select publication.public_id as deck_public_id
    from public.deck_publications as publication
    where private.card_json_contains_internal_media_id(
      publication.description_doc,
      0
    )
      or private.text_contains_internal_media_id(
        publication.description_plain
      )
      or not private.public_description_plain_is_exact(
        publication.description_doc,
        publication.description_plain
      )
    union
    select publication.deck_public_id
    from public.card_publications as publication
    where private.card_json_contains_internal_media_id(
      publication.field_values,
      0
    )
      or private.card_json_contains_internal_media_id(
      publication.card_payload,
      0
    )
      or private.card_json_contains_internal_media_id(
      publication.source_references,
      0
    )
  ), withdrawn as (
    delete from public.deck_publications as publication
    using affected
    where publication.public_id = affected.deck_public_id
    returning publication.public_id
  )
  update public.decks as deck
  set visibility = 'private',
      published_version = null,
      published_at = null,
      version = deck.version + 1,
      updated_at = pg_catalog.now()
  where deck.public_id in (
    select withdrawn.public_id from withdrawn
  );
  get diagnostics v_withdrawn = row_count;
  return v_withdrawn;
end;
$function$;

revoke all on function private.publicize_card_json(jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.text_contains_internal_media_id(text)
from public, anon, authenticated, service_role;
revoke all on function private.extract_public_rich_text_fragment(jsonb, integer)
from public, anon, authenticated, service_role;
revoke all on function private.extract_public_description_plain(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.public_description_plain_is_exact(jsonb, text)
from public, anon, authenticated, service_role;
revoke all on function private.card_json_contains_internal_media_id(jsonb, integer)
from public, anon, authenticated, service_role;
revoke all on function private.withdraw_internal_media_publications()
from public, anon, authenticated, service_role;

select private.withdraw_internal_media_publications();

-- Schema-one versions predate explicit mediaReferences. Reconstruct only the
-- references proven by the immutable note payload: one note-owned prompt link
-- for every exact embedded media identity. Existing historical rows retain
-- their identity/position; otherwise the identity is a deterministic UUIDv5-
-- shaped digest of deck, note, and asset. Unattached legacy links cannot be
-- inferred safely and are deliberately omitted.
create or replace function private.upgrade_legacy_deck_media_snapshot(
  p_deck_id uuid,
  p_content_snapshot jsonb,
  p_actor_account_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_alt_text text;
  v_asset public.media_assets;
  v_created_at timestamptz;
  v_created_by uuid;
  v_deck_owner_id uuid;
  v_graph jsonb := '[]'::jsonb;
  v_hex text;
  v_note jsonb;
  v_note_id uuid;
  v_position integer;
  v_reference public.media_references;
  v_reference_id uuid;
  v_requirement record;
  v_target_position integer;
begin
  if p_content_snapshot is null
    or pg_catalog.jsonb_typeof(p_content_snapshot) <> 'object'
    or coalesce((p_content_snapshot ->> 'schemaVersion')::integer, 0) <> 1
    or pg_catalog.jsonb_typeof(p_content_snapshot -> 'notes') <> 'array'
    or pg_catalog.jsonb_array_length(p_content_snapshot -> 'notes') > 100000
    or not private.can_manage_deck(p_actor_account_id, p_deck_id) then
    raise exception using
      errcode = '55000',
      message = 'legacy deck version media graph is invalid';
  end if;
  select deck.owner_account_id
  into strict v_deck_owner_id
  from public.decks as deck
  where deck.id = p_deck_id;

  for v_note in
    select note.value
    from pg_catalog.jsonb_array_elements(p_content_snapshot -> 'notes')
      with ordinality as note(value, position)
    order by note.position
  loop
    if pg_catalog.jsonb_typeof(v_note) <> 'object'
      or coalesce(v_note ->> 'id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using
        errcode = '55000',
        message = 'legacy deck version media graph is invalid';
    end if;
    v_note_id := (v_note ->> 'id')::uuid;
    if not exists(
      select 1
      from public.notes as note
      where note.id = v_note_id
        and note.deck_id = p_deck_id
        and note.deleted_at is null
    ) then
      raise exception using
        errcode = '55000',
        message = 'legacy deck version media graph is invalid';
    end if;

    if exists(
      select 1
      from private.collect_embedded_media_requirements(
        v_note -> 'cardPayload',
        0,
        null,
        null,
        '$'
      ) as requirement
      where requirement.expected_kind is not null
      group by requirement.media_asset_id
      having pg_catalog.count(distinct requirement.expected_kind) > 1
    ) then
      raise exception using
        errcode = '55000',
        message = 'legacy deck version media graph is invalid';
    end if;

    v_position := 0;
    for v_requirement in
      select requirement.media_asset_id,
        (pg_catalog.array_agg(
          requirement.expected_kind
          order by (requirement.expected_kind is null), requirement.media_path
        ))[1] as expected_kind,
        (pg_catalog.array_agg(
          requirement.alt_text
          order by (requirement.alt_text is null), requirement.media_path
        ))[1] as alt_text,
        pg_catalog.min(requirement.media_path) as media_path
      from private.collect_embedded_media_requirements(
        v_note -> 'cardPayload',
        0,
        null,
        null,
        '$'
      ) as requirement
      group by requirement.media_asset_id
      order by pg_catalog.min(requirement.media_path), requirement.media_asset_id
    loop
      select asset.*
      into v_asset
      from public.media_assets as asset
      where asset.id = v_requirement.media_asset_id;
      if not found
        or v_asset.deleted_at is not null
        or not v_asset.magic_verified
        or v_asset.status not in ('ready', 'deleting')
        or not (
          v_asset.owner_account_id in (p_actor_account_id, v_deck_owner_id)
          or exists(
            select 1
            from public.media_references as historical_reference
            where historical_reference.deck_id = p_deck_id
              and historical_reference.note_id = v_note_id
              and historical_reference.media_asset_id = v_requirement.media_asset_id
          )
        )
        or (
          v_requirement.expected_kind is not null
          and v_asset.kind <> v_requirement.expected_kind
        )
        or exists(
          select 1
          from private.content_media_deletion_jobs as job
          where job.media_asset_id = v_requirement.media_asset_id
        ) then
        raise exception using
          errcode = '55000',
          message = 'media asset is unavailable';
      end if;

      select reference.*
      into v_reference
      from public.media_references as reference
      where reference.deck_id = p_deck_id
        and reference.note_id = v_note_id
        and reference.media_asset_id = v_requirement.media_asset_id
        and reference.reference_type = 'note'
        and reference.owner_id = v_note_id
        and reference.purpose = 'prompt'
      order by (reference.deleted_at is null) desc,
        reference.updated_at desc,
        reference.id
      limit 1;

      if found then
        v_reference_id := v_reference.id;
        v_target_position := v_reference.position;
        v_created_by := v_reference.created_by;
        v_created_at := v_reference.created_at;
        v_alt_text := coalesce(
          v_requirement.alt_text,
          v_reference.alt_text,
          v_asset.alt_text,
          case when v_asset.kind = 'image' then 'Restored image' end
        );
      else
        v_hex := pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              'lumen:legacy-deck-media:v1:'
              || p_deck_id::text || ':'
              || v_note_id::text || ':'
              || v_requirement.media_asset_id::text,
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        );
        v_hex := pg_catalog.substr(v_hex, 1, 12)
          || '5'
          || pg_catalog.substr(v_hex, 14, 3)
          || '8'
          || pg_catalog.substr(v_hex, 18, 15);
        v_reference_id := (
          pg_catalog.substr(v_hex, 1, 8) || '-'
          || pg_catalog.substr(v_hex, 9, 4) || '-'
          || pg_catalog.substr(v_hex, 13, 4) || '-'
          || pg_catalog.substr(v_hex, 17, 4) || '-'
          || pg_catalog.substr(v_hex, 21, 12)
        )::uuid;
        v_target_position := v_position;
        v_created_by := p_actor_account_id;
        if coalesce(v_note ->> 'createdBy', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists(
            select 1
            from public.profiles as profile
            where profile.id = (v_note ->> 'createdBy')::uuid
          ) then
          v_created_by := (v_note ->> 'createdBy')::uuid;
        end if;
        v_created_at := coalesce(
          nullif(v_note ->> 'createdAt', '')::timestamptz,
          v_asset.created_at
        );
        v_alt_text := coalesce(
          v_requirement.alt_text,
          v_asset.alt_text,
          case when v_asset.kind = 'image' then 'Restored image' end
        );
      end if;

      v_graph := v_graph || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_reference_id,
          'mediaAssetId', v_requirement.media_asset_id,
          'noteId', v_note_id,
          'fieldValueId', null,
          'referenceType', 'note',
          'ownerId', v_note_id,
          'purpose', 'prompt',
          'position', v_target_position,
          'altText', case when v_alt_text is null
            then null
            else pg_catalog.left(v_alt_text, 1000)
          end,
          'createdBy', v_created_by,
          'createdAt', v_created_at
        )
      );
      if pg_catalog.jsonb_array_length(v_graph) > 100000 then
        raise exception using
          errcode = '55000',
          message = 'legacy deck version media graph is invalid';
      end if;
      v_position := v_position + 1;
    end loop;
  end loop;

  return p_content_snapshot || pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'mediaReferences', v_graph
  );
exception
  when sqlstate '22023'
    or invalid_text_representation
    or datetime_field_overflow
    or numeric_value_out_of_range then
    raise exception using
      errcode = '55000',
      message = 'legacy deck version media graph is invalid';
end;
$function$;

revoke all on function private.upgrade_legacy_deck_media_snapshot(
  uuid, jsonb, uuid
) from public, anon, authenticated, service_role;

create or replace function private.restore_deck_media_references(
  p_deck_id uuid,
  p_content_snapshot jsonb,
  p_actor_account_id uuid
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_alt_text text;
  v_asset public.media_assets;
  v_created_at timestamptz;
  v_created_by uuid;
  v_field_value_id uuid;
  v_item jsonb;
  v_media_asset_id uuid;
  v_note_id uuid;
  v_owner_id uuid;
  v_position integer;
  v_purpose public.media_reference_purpose;
  v_reference public.media_references;
  v_reference_id uuid;
  v_reference_type public.media_reference_type;
  v_target_asset_ids uuid[] := '{}'::uuid[];
  v_target_reference_ids uuid[] := '{}'::uuid[];
begin
  if p_content_snapshot is null
    or pg_catalog.jsonb_typeof(p_content_snapshot) <> 'object'
    or coalesce((p_content_snapshot ->> 'schemaVersion')::integer, 0) <> 2
    or pg_catalog.jsonb_typeof(p_content_snapshot -> 'mediaReferences') <> 'array'
    or pg_catalog.jsonb_array_length(p_content_snapshot -> 'mediaReferences') > 100000 then
    raise exception using
      errcode = '55000',
      message = 'deck version media graph is unavailable';
  end if;

  if not private.can_manage_deck(p_actor_account_id, p_deck_id) then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;

  for v_item in
    select item.value
    from pg_catalog.jsonb_array_elements(
      p_content_snapshot -> 'mediaReferences'
    ) with ordinality as item(value, position)
    order by item.position
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(v_item) as key
        where key not in (
          'id', 'mediaAssetId', 'noteId', 'fieldValueId', 'referenceType',
          'ownerId', 'purpose', 'position', 'altText', 'createdBy', 'createdAt'
        )
      ) <> 0
      or coalesce(v_item ->> 'id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'mediaAssetId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'ownerId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'createdBy', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'referenceType', '') not in (
        'deck', 'note', 'note_field', 'image_occlusion', 'diagram_hotspot',
        'audio_prompt', 'pronunciation', 'drawing_layer'
      )
      or coalesce(v_item ->> 'purpose', '') not in (
        'cover', 'inline', 'attachment', 'prompt', 'answer', 'reference'
      )
      or coalesce(v_item ->> 'position', '') !~ '^[0-9]{1,6}$'
      or (v_item ->> 'position')::integer not between 0 and 999999
      or pg_catalog.jsonb_typeof(v_item -> 'createdAt') <> 'string'
      or (
        v_item -> 'altText' <> 'null'::jsonb
        and pg_catalog.jsonb_typeof(v_item -> 'altText') <> 'string'
      )
      or pg_catalog.char_length(coalesce(v_item ->> 'altText', '')) > 1000
      or (
        v_item -> 'noteId' <> 'null'::jsonb
        and coalesce(v_item ->> 'noteId', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        v_item -> 'fieldValueId' <> 'null'::jsonb
        and coalesce(v_item ->> 'fieldValueId', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) then
      raise exception using
        errcode = '55000',
        message = 'deck version media graph is invalid';
    end if;

    begin
      v_reference_id := (v_item ->> 'id')::uuid;
      v_media_asset_id := (v_item ->> 'mediaAssetId')::uuid;
      v_note_id := nullif(v_item ->> 'noteId', '')::uuid;
      v_field_value_id := nullif(v_item ->> 'fieldValueId', '')::uuid;
      v_reference_type := (v_item ->> 'referenceType')::public.media_reference_type;
      v_owner_id := (v_item ->> 'ownerId')::uuid;
      v_purpose := (v_item ->> 'purpose')::public.media_reference_purpose;
      v_position := (v_item ->> 'position')::integer;
      v_alt_text := v_item ->> 'altText';
      v_created_by := (v_item ->> 'createdBy')::uuid;
      v_created_at := (v_item ->> 'createdAt')::timestamptz;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception using
        errcode = '55000',
        message = 'deck version media graph is invalid';
    end;

    if v_reference_id = any(v_target_reference_ids) then
      raise exception using
        errcode = '55000',
        message = 'deck version media graph is invalid';
    end if;
    v_target_reference_ids := pg_catalog.array_append(
      v_target_reference_ids,
      v_reference_id
    );
    if not (v_media_asset_id = any(v_target_asset_ids)) then
      v_target_asset_ids := pg_catalog.array_append(
        v_target_asset_ids,
        v_media_asset_id
      );
    end if;

    select asset.*
    into v_asset
    from public.media_assets as asset
    where asset.id = v_media_asset_id
    for update;
    if not found
      or v_asset.deleted_at is not null
      or not v_asset.magic_verified
      or v_asset.status not in ('ready', 'deleting')
      or exists(
        select 1
        from private.content_media_deletion_jobs as job
        where job.media_asset_id = v_media_asset_id
      )
      or (
        v_asset.kind = 'image'
        and pg_catalog.btrim(coalesce(v_alt_text, v_asset.alt_text, '')) = ''
      ) then
      raise exception using errcode = '55000', message = 'media asset is unavailable';
    end if;

    if v_reference_type = 'deck' then
      if v_owner_id <> p_deck_id
        or v_note_id is not null
        or v_field_value_id is not null then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    elsif v_reference_type in ('note', 'audio_prompt', 'pronunciation') then
      if v_note_id is null
        or v_owner_id <> v_note_id
        or v_field_value_id is not null
        or not exists(
          select 1 from public.notes as note
          where note.id = v_note_id
            and note.deck_id = p_deck_id
            and note.deleted_at is null
        ) then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    elsif v_reference_type = 'note_field' then
      if v_note_id is null
        or v_field_value_id is null
        or v_owner_id <> v_field_value_id
        or not exists(
          select 1
          from public.note_field_values as field_value
          join public.notes as note on note.id = field_value.note_id
          where field_value.id = v_field_value_id
            and field_value.note_id = v_note_id
            and field_value.deleted_at is null
            and note.deck_id = p_deck_id
            and note.deleted_at is null
        ) then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    elsif v_reference_type = 'image_occlusion' then
      if v_note_id is null
        or v_field_value_id is not null
        or not exists(
          select 1
          from public.image_occlusions as child
          join public.notes as note on note.id = child.note_id
          where child.id = v_owner_id
            and child.note_id = v_note_id
            and child.deleted_at is null
            and note.deck_id = p_deck_id
            and note.deleted_at is null
        ) then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    elsif v_reference_type = 'diagram_hotspot' then
      if v_note_id is null
        or v_field_value_id is not null
        or not exists(
          select 1
          from public.diagram_hotspots as child
          join public.notes as note on note.id = child.note_id
          where child.id = v_owner_id
            and child.note_id = v_note_id
            and child.deleted_at is null
            and note.deck_id = p_deck_id
            and note.deleted_at is null
        ) then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    elsif v_reference_type = 'drawing_layer' then
      if v_note_id is null
        or v_field_value_id is not null
        or not exists(
          select 1
          from public.drawing_reference_layers as child
          join public.notes as note on note.id = child.note_id
          where child.id = v_owner_id
            and child.note_id = v_note_id
            and child.deleted_at is null
            and note.deck_id = p_deck_id
            and note.deleted_at is null
        ) then
        raise exception using
          errcode = '55000', message = 'deck version media graph is invalid';
      end if;
    end if;

    select reference.*
    into v_reference
    from public.media_references as reference
    where reference.id = v_reference_id;
    if found and (
      v_reference.media_asset_id <> v_media_asset_id
      or v_reference.reference_type <> v_reference_type
      or v_reference.owner_id <> v_owner_id
      or v_reference.purpose <> v_purpose
      or v_reference.position <> v_position
    ) then
      raise exception using
        errcode = '55000', message = 'deck version media graph conflicts with history';
    end if;
    if exists(
      select 1
      from public.media_references as conflicting
      where conflicting.id <> v_reference_id
        and conflicting.media_asset_id = v_media_asset_id
        and conflicting.reference_type = v_reference_type
        and conflicting.owner_id = v_owner_id
        and conflicting.purpose = v_purpose
        and conflicting.position = v_position
    ) then
      raise exception using
        errcode = '55000', message = 'deck version media graph conflicts with history';
    end if;

    insert into public.media_references (
      id, media_asset_id, deck_id, note_id, field_value_id, reference_type,
      owner_id, purpose, position, alt_text, created_by, created_at, deleted_at
    ) values (
      v_reference_id, v_media_asset_id, p_deck_id, v_note_id,
      v_field_value_id, v_reference_type, v_owner_id, v_purpose, v_position,
      v_alt_text, v_created_by, v_created_at, null
    ) on conflict (id) do update
    set deck_id = excluded.deck_id,
        note_id = excluded.note_id,
        field_value_id = excluded.field_value_id,
        alt_text = excluded.alt_text,
        version = public.media_references.version + 1,
        updated_at = pg_catalog.now(),
        deleted_at = null;
  end loop;

  update public.media_references as reference
  set deleted_at = pg_catalog.now(),
      version = reference.version + 1,
      updated_at = pg_catalog.now()
  where reference.deck_id = p_deck_id
    and reference.deleted_at is null
    and not (reference.id = any(v_target_reference_ids));

  if (
    select pg_catalog.count(*)
    from public.media_references as reference
    where reference.deck_id = p_deck_id and reference.deleted_at is null
  ) <> pg_catalog.cardinality(v_target_reference_ids) then
    raise exception using
      errcode = '55000', message = 'deck version media graph could not be restored';
  end if;

  return v_target_asset_ids;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using
      errcode = '55000', message = 'deck version media graph is invalid';
end;
$function$;

revoke all on function private.restore_deck_media_references(uuid, jsonb, uuid)
from public, anon, authenticated, service_role;

-- Preserve the complete 09000 public wrapper (including its payload-bound
-- private restore implementation) behind a non-executable alias, then add the
-- media graph as a post-restore step in the same transaction. The receipt row
-- xmin distinguishes the creating command from an exact replay after the base
-- function has validated the full 09000 command fingerprint.
alter function public.current_restore_deck_version(uuid, bigint, bigint, uuid)
set schema private;
alter function private.current_restore_deck_version(uuid, bigint, bigint, uuid)
rename to content_restore_deck_version_media_graph_base;

revoke all on function private.content_restore_deck_version_media_graph_base(
  uuid, bigint, bigint, uuid
) from public, anon, authenticated, service_role;

create function public.current_restore_deck_version(
  p_deck_id uuid,
  p_expected_version bigint,
  p_version_number bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_affected_asset_ids uuid[];
  v_deck public.decks;
  v_receipt_created_here boolean := false;
  v_receipt_preexisting boolean := false;
  v_restore_snapshot jsonb;
  v_target public.deck_versions;
  v_target_asset_ids uuid[];
begin
  v_affected_asset_ids := private.collect_deck_media_asset_ids(p_deck_id);
  perform pg_catalog.set_config('lumen.created_content_receipt', '', true);
  select exists(
    select 1
    from private.content_mutation_receipts as receipt
    where receipt.account_id = v_account_id
      and receipt.idempotency_key = p_idempotency_key
  ) into v_receipt_preexisting;

  if not v_receipt_preexisting then
    perform 1
    from public.decks as deck
    where deck.id = p_deck_id
      and deck.status = 'active'
      and private.can_manage_deck(v_account_id, deck.id)
    for update;
    if found then
      select deck_version.*
      into v_target
      from public.deck_versions as deck_version
      where deck_version.deck_id = p_deck_id
        and deck_version.version_number = p_version_number;
      if not found then
        raise exception using
          errcode = '22023',
          message = 'deck version is unavailable';
      end if;
      if pg_catalog.jsonb_typeof(v_target.content_snapshot -> 'notes') <> 'array' then
        raise exception using
          errcode = '55000',
          message = 'deck version note identity is invalid';
      end if;
      if exists(
          select 1
          from pg_catalog.jsonb_array_elements(
            v_target.content_snapshot -> 'notes'
          ) as note(value)
          where pg_catalog.jsonb_typeof(note.value) <> 'object'
            or coalesce(note.value ->> 'id', '')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ) then
        raise exception using
          errcode = '55000',
          message = 'deck version note identity is invalid';
      end if;
      if (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_array_elements(
            v_target.content_snapshot -> 'notes'
          ) as note(value)
        ) <> (
          select pg_catalog.count(distinct (note.value ->> 'id')::uuid)
          from pg_catalog.jsonb_array_elements(
            v_target.content_snapshot -> 'notes'
          ) as note(value)
        ) then
        raise exception using
          errcode = '55000',
          message = 'deck version note identity is invalid';
      end if;

      perform 1
      from public.notes as note
      where note.id in (
        select (snapshot_note.value ->> 'id')::uuid
        from pg_catalog.jsonb_array_elements(
          v_target.content_snapshot -> 'notes'
        ) as snapshot_note(value)
      )
      order by note.id
      for update;
      if exists(
        select 1
        from public.notes as note
        where note.deck_id <> p_deck_id
          and note.id in (
            select (snapshot_note.value ->> 'id')::uuid
            from pg_catalog.jsonb_array_elements(
              v_target.content_snapshot -> 'notes'
            ) as snapshot_note(value)
          )
      ) then
        raise exception using
          errcode = '55000',
          message = 'deck version note identity belongs to another deck';
      end if;
    end if;
  end if;
  if v_target.id is not null then
    perform pg_catalog.set_config(
      'lumen.restore_deck_id',
      p_deck_id::text,
      true
    );
    perform pg_catalog.set_config(
      'lumen.restore_version_number',
      p_version_number::text,
      true
    );
  end if;
  v_deck := private.content_restore_deck_version_media_graph_base(
    p_deck_id,
    p_expected_version,
    p_version_number,
    p_idempotency_key
  );
  perform pg_catalog.set_config('lumen.restore_deck_id', '', true);
  perform pg_catalog.set_config('lumen.restore_version_number', '', true);

  select not v_receipt_preexisting
    -- Use xid equality rather than epoch-losing text equality; xmin is xid
    -- while pg_current_xact_id() is xid8.
    and (
      receipt.xmin = pg_catalog.pg_current_xact_id()::xid
      or pg_catalog.current_setting(
        'lumen.created_content_receipt',
        true
      ) = v_account_id::text || ':' || p_idempotency_key::text
        || ':deck_version.restore'
    )
  into v_receipt_created_here
  from private.content_mutation_receipts as receipt
  where receipt.account_id = v_account_id
    and receipt.idempotency_key = p_idempotency_key
    and receipt.operation = 'deck_version.restore'
    and receipt.completed_at is not null;

  if not coalesce(v_receipt_created_here, false) then
    return v_deck;
  end if;

  select deck_version.*
  into strict v_target
  from public.deck_versions as deck_version
  where deck_version.deck_id = p_deck_id
    and deck_version.version_number = p_version_number;

  v_restore_snapshot := v_target.content_snapshot;
  if coalesce((v_restore_snapshot ->> 'schemaVersion')::integer, 0) = 1 then
    v_restore_snapshot := private.upgrade_legacy_deck_media_snapshot(
      p_deck_id,
      v_restore_snapshot,
      v_account_id
    );
  end if;
  v_target_asset_ids := private.restore_deck_media_references(
    p_deck_id,
    v_restore_snapshot,
    v_account_id
  );
  v_affected_asset_ids := coalesce(v_affected_asset_ids, '{}'::uuid[])
    || coalesce(v_target_asset_ids, '{}'::uuid[])
    || private.collect_deck_media_asset_ids(p_deck_id);
  perform private.reconcile_media_reference_counts(v_affected_asset_ids);
  perform private.finalize_current_deck_version_snapshot(p_deck_id);

  select deck.*
  into strict v_deck
  from public.decks as deck
  where deck.id = p_deck_id;
  return v_deck;
end;
$function$;

revoke all on function public.current_restore_deck_version(
  uuid, bigint, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.current_restore_deck_version(
  uuid, bigint, bigint, uuid
) to authenticated;

comment on function public.current_restore_deck_version(
  uuid, bigint, bigint, uuid
) is 'Payload-bound atomic restore of authored content and its exact explicit media-reference graph; the new head is finalized without a second version bump.';

commit;
