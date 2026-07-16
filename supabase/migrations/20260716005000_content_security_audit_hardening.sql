-- Close adversarial mutation and media lifecycle gaps without rewriting the
-- already-applied Phase 02 migrations.

begin;

-- Serialize each account/key pair before looking up its receipt. This makes
-- concurrent retries observe the first committed result instead of racing the
-- unique constraint after both executions have performed side effects.
create or replace function private.content_receipt_replay_is_authorized(
  p_account_id uuid,
  p_receipt private.content_mutation_receipts
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_receipt.idempotency_key is null then
    return true;
  end if;

  if p_receipt.resource_type = 'folder' then
    return exists(
      select 1 from public.folders as folder
      where folder.id = p_receipt.resource_id
        and folder.owner_account_id = p_account_id
    );
  elsif p_receipt.resource_type = 'note_type' then
    return exists(
      select 1 from public.note_types as note_type
      where note_type.id = p_receipt.resource_id
        and (note_type.is_system or note_type.owner_account_id = p_account_id)
    );
  elsif p_receipt.resource_type = 'deck' then
    if p_receipt.operation in ('deck.update', 'note.bulk_tag', 'note.bulk_move') then
      return private.can_edit_deck(p_account_id, p_receipt.resource_id);
    elsif p_receipt.operation in (
      'deck.publish', 'deck.unpublish', 'deck_version.restore'
    ) then
      return private.can_manage_deck(p_account_id, p_receipt.resource_id);
    end if;
    return exists(
      select 1 from public.decks as deck
      where deck.id = p_receipt.resource_id
        and deck.owner_account_id = p_account_id
    );
  elsif p_receipt.resource_type = 'note' then
    return exists(
      select 1 from public.notes as note
      where note.id = p_receipt.resource_id
        and private.can_edit_deck(p_account_id, note.deck_id)
    );
  elsif p_receipt.resource_type = 'media_asset' then
    return exists(
      select 1 from public.media_assets as asset
      where asset.id = p_receipt.resource_id
        and asset.owner_account_id = p_account_id
    );
  elsif p_receipt.resource_type = 'media_reference' then
    return exists(
      select 1 from public.media_references as reference
      where reference.id = p_receipt.resource_id
        and (
          reference.created_by = p_account_id
          or private.can_edit_deck(p_account_id, reference.deck_id)
        )
    );
  end if;

  return false;
end;
$function$;

create or replace function private.get_content_receipt(
  p_account_id uuid,
  p_idempotency_key uuid,
  p_operation text
)
returns private.content_mutation_receipts
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_receipt private.content_mutation_receipts;
begin
  if p_account_id is null then
    raise exception using errcode = '42501', message = 'content actor is required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select * into v_receipt
  from private.content_mutation_receipts as receipt
  where receipt.account_id = p_account_id
    and receipt.idempotency_key = p_idempotency_key;

  if found and v_receipt.operation <> p_operation then
    raise exception using errcode = '22023', message = 'content mutation replay does not match';
  end if;
  if found and not private.content_receipt_replay_is_authorized(
    p_account_id,
    v_receipt
  ) then
    raise exception using
      errcode = '42501',
      message = 'content mutation replay is no longer authorized';
  end if;
  return v_receipt;
end;
$function$;

revoke all on function private.content_receipt_replay_is_authorized(
  uuid, private.content_mutation_receipts
) from public, anon, authenticated, service_role;
revoke all on function private.get_content_receipt(uuid, uuid, text)
from public, anon, authenticated, service_role;

-- A nullable optimistic version is never a wildcard. Creation still uses the
-- explicit version sentinel 0, while every update boundary must send a value.
create or replace function private.require_content_expected_version(
  p_expected_version bigint
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
begin
  if p_expected_version is null then
    raise exception using
      errcode = '22023',
      message = 'expected content version is required';
  end if;
end;
$function$;

create or replace function private.require_content_expected_versions(
  p_expected_versions bigint[]
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
begin
  if p_expected_versions is null
    or pg_catalog.array_position(p_expected_versions, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'expected content versions are required';
  end if;
end;
$function$;

revoke all on function private.require_content_expected_version(bigint)
from public, anon, authenticated, service_role;
revoke all on function private.require_content_expected_versions(bigint[])
from public, anon, authenticated, service_role;

-- Preserve the established implementations behind private, non-executable
-- aliases and place small validation wrappers at every public version boundary.
alter function public.current_update_folder(uuid, bigint, text, uuid, uuid)
set schema private;
alter function private.current_update_folder(uuid, bigint, text, uuid, uuid)
rename to content_update_folder_unchecked;

alter function public.current_delete_folder(uuid, bigint, uuid)
set schema private;
alter function private.current_delete_folder(uuid, bigint, uuid)
rename to content_delete_folder_unchecked;

alter function public.current_update_note_type(uuid, bigint, jsonb, uuid)
set schema private;
alter function private.current_update_note_type(uuid, bigint, jsonb, uuid)
rename to content_update_note_type_unchecked;

alter function public.current_update_deck(uuid, bigint, jsonb, uuid)
set schema private;
alter function private.current_update_deck(uuid, bigint, jsonb, uuid)
rename to content_update_deck_unchecked;

alter function public.current_delete_note(uuid, bigint, uuid)
set schema private;
alter function private.current_delete_note(uuid, bigint, uuid)
rename to content_delete_note_unchecked;

alter function public.current_publish_deck(uuid, bigint, public.deck_visibility, uuid)
set schema private;
alter function private.current_publish_deck(uuid, bigint, public.deck_visibility, uuid)
rename to content_publish_deck_unchecked;

alter function public.current_unpublish_deck(uuid, bigint, uuid)
set schema private;
alter function private.current_unpublish_deck(uuid, bigint, uuid)
rename to content_unpublish_deck_unchecked;

alter function public.current_restore_deck_version(uuid, bigint, bigint, uuid)
set schema private;
alter function private.current_restore_deck_version(uuid, bigint, bigint, uuid)
rename to content_restore_deck_version_unchecked;

alter function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) set schema private;
alter function private.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) rename to content_upsert_note_with_media_unchecked;

alter function public.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) set schema private;
alter function private.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) rename to content_bulk_tag_notes_unchecked;

alter function public.current_bulk_move_notes(uuid, uuid, uuid[], bigint[], uuid)
set schema private;
alter function private.current_bulk_move_notes(uuid, uuid, uuid[], bigint[], uuid)
rename to content_bulk_move_notes_unchecked;

revoke all on function private.content_update_folder_unchecked(
  uuid, bigint, text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_delete_folder_unchecked(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.content_update_note_type_unchecked(
  uuid, bigint, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_update_deck_unchecked(uuid, bigint, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.content_delete_note_unchecked(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.content_publish_deck_unchecked(
  uuid, bigint, public.deck_visibility, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_unpublish_deck_unchecked(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.content_restore_deck_version_unchecked(
  uuid, bigint, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_upsert_note_with_media_unchecked(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_bulk_tag_notes_unchecked(
  uuid, uuid[], bigint[], text[], text[], uuid
) from public, anon, authenticated, service_role;
revoke all on function private.content_bulk_move_notes_unchecked(
  uuid, uuid, uuid[], bigint[], uuid
) from public, anon, authenticated, service_role;

create function public.current_update_folder(
  p_folder_id uuid,
  p_expected_version bigint,
  p_name text,
  p_parent_id uuid,
  p_idempotency_key uuid
)
returns public.folders
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_update_folder_unchecked(
    p_folder_id, p_expected_version, p_name, p_parent_id, p_idempotency_key
  );
end;
$function$;

create function public.current_delete_folder(
  p_folder_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.folders
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_delete_folder_unchecked(
    p_folder_id, p_expected_version, p_idempotency_key
  );
end;
$function$;

create function public.current_update_note_type(
  p_note_type_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_idempotency_key uuid
)
returns public.note_types
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_update_note_type_unchecked(
    p_note_type_id, p_expected_version, p_patch, p_idempotency_key
  );
end;
$function$;

create function public.current_update_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_update_deck_unchecked(
    p_deck_id, p_expected_version, p_patch, p_idempotency_key
  );
end;
$function$;

create function public.current_delete_note(
  p_note_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note public.notes;
begin
  perform private.require_content_expected_version(p_expected_version);
  v_note := private.content_delete_note_unchecked(
    p_note_id, p_expected_version, p_idempotency_key
  );

  update public.media_references
  set deleted_at = pg_catalog.now(), version = version + 1
  where note_id = p_note_id and deleted_at is null;
  update public.audio_prompts
  set deleted_at = pg_catalog.now(), version = version + 1
  where note_id = p_note_id and deleted_at is null;
  update public.pronunciation_prompts
  set deleted_at = pg_catalog.now(), version = version + 1
  where note_id = p_note_id and deleted_at is null;
  update public.drawing_reference_layers
  set deleted_at = pg_catalog.now(), version = version + 1
  where note_id = p_note_id and deleted_at is null;

  return v_note;
end;
$function$;

create function public.current_publish_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_visibility public.deck_visibility,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_publish_deck_unchecked(
    p_deck_id, p_expected_version, p_visibility, p_idempotency_key
  );
end;
$function$;

create function public.current_unpublish_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_unpublish_deck_unchecked(
    p_deck_id, p_expected_version, p_idempotency_key
  );
end;
$function$;

create function public.current_restore_deck_version(
  p_deck_id uuid,
  p_expected_version bigint,
  p_version_number bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deck public.decks;
begin
  perform private.require_content_expected_version(p_expected_version);
  v_deck := private.content_restore_deck_version_unchecked(
    p_deck_id, p_expected_version, p_version_number, p_idempotency_key
  );

  update public.media_references as reference
  set deleted_at = pg_catalog.now(), version = reference.version + 1
  where reference.deck_id = p_deck_id
    and reference.note_id is not null
    and reference.deleted_at is null
    and exists(
      select 1 from public.notes as note
      where note.id = reference.note_id and note.deleted_at is not null
    );
  update public.audio_prompts as prompt
  set deleted_at = pg_catalog.now(), version = prompt.version + 1
  where prompt.deleted_at is null
    and exists(
      select 1 from public.notes as note
      where note.id = prompt.note_id
        and note.deck_id = p_deck_id
        and note.deleted_at is not null
    );
  update public.pronunciation_prompts as prompt
  set deleted_at = pg_catalog.now(), version = prompt.version + 1
  where prompt.deleted_at is null
    and exists(
      select 1 from public.notes as note
      where note.id = prompt.note_id
        and note.deck_id = p_deck_id
        and note.deleted_at is not null
    );
  update public.drawing_reference_layers as layer
  set deleted_at = pg_catalog.now(), version = layer.version + 1
  where layer.deleted_at is null
    and exists(
      select 1 from public.notes as note
      where note.id = layer.note_id
        and note.deck_id = p_deck_id
        and note.deleted_at is not null
    );

  return v_deck;
end;
$function$;

create function public.current_upsert_note_with_media(
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
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_upsert_note_with_media_unchecked(
    p_deck_id, p_note_id, p_note_type_code, p_expected_version,
    p_fields, p_card_payload, p_tags, p_media_links, p_idempotency_key
  );
end;
$function$;

create function public.current_bulk_tag_notes(
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
begin
  perform private.require_content_expected_versions(p_expected_versions);
  return private.content_bulk_tag_notes_unchecked(
    p_deck_id, p_note_ids, p_expected_versions,
    p_add_tags, p_remove_tags, p_idempotency_key
  );
end;
$function$;

create function public.current_bulk_move_notes(
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
begin
  perform private.require_content_expected_versions(p_expected_versions);
  return private.content_bulk_move_notes_unchecked(
    p_source_deck_id, p_target_deck_id, p_note_ids,
    p_expected_versions, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_archive_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.set_deck_lifecycle(
    'archive', p_deck_id, p_expected_version, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_restore_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.set_deck_lifecycle(
    'restore', p_deck_id, p_expected_version, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_delete_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.set_deck_lifecycle(
    'delete', p_deck_id, p_expected_version, p_idempotency_key
  );
end;
$function$;

-- The atomic note+media wrapper is the only browser note write boundary. The
-- component RPCs remain available to trusted definer code but not to clients.
revoke all on function public.current_upsert_note(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_link_media(
  uuid, public.media_reference_type, uuid, public.media_reference_purpose,
  integer, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_release_media_reference(uuid, uuid)
from public, anon, authenticated, service_role;

revoke all on function public.current_update_folder(uuid, bigint, text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_folder(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_update_note_type(uuid, bigint, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_update_deck(uuid, bigint, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_note(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_publish_deck(
  uuid, bigint, public.deck_visibility, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_unpublish_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_restore_deck_version(uuid, bigint, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_bulk_move_notes(uuid, uuid, uuid[], bigint[], uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_archive_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_restore_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.current_update_folder(uuid, bigint, text, uuid, uuid)
to authenticated;
grant execute on function public.current_delete_folder(uuid, bigint, uuid)
to authenticated;
grant execute on function public.current_update_note_type(uuid, bigint, jsonb, uuid)
to authenticated;
grant execute on function public.current_update_deck(uuid, bigint, jsonb, uuid)
to authenticated;
grant execute on function public.current_delete_note(uuid, bigint, uuid)
to authenticated;
grant execute on function public.current_publish_deck(
  uuid, bigint, public.deck_visibility, uuid
) to authenticated;
grant execute on function public.current_unpublish_deck(uuid, bigint, uuid)
to authenticated;
grant execute on function public.current_restore_deck_version(uuid, bigint, bigint, uuid)
to authenticated;
grant execute on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) to authenticated;
grant execute on function public.current_bulk_tag_notes(
  uuid, uuid[], bigint[], text[], text[], uuid
) to authenticated;
grant execute on function public.current_bulk_move_notes(uuid, uuid, uuid[], bigint[], uuid)
to authenticated;
grant execute on function public.current_archive_deck(uuid, bigint, uuid)
to authenticated;
grant execute on function public.current_restore_deck(uuid, bigint, uuid)
to authenticated;
grant execute on function public.current_delete_deck(uuid, bigint, uuid)
to authenticated;

-- Verified objects are immutable to browser credentials. Only a pending upload
-- may be replaced or deleted before the trusted verification/finalization step.
create or replace function private.can_write_content_media_object(
  p_account_id uuid,
  p_bucket_id text,
  p_object_name text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_bucket_id <> 'lumen-content-media'
    or not private.has_current_content_context(p_account_id) then
    return false;
  end if;

  -- Hold a row-share lock through the storage write. Finalization takes
  -- FOR UPDATE on this same row, so verification cannot race an already
  -- authorized pending-object replacement and commit first.
  perform 1
  from public.media_assets as asset
  where asset.owner_account_id = p_account_id
    and asset.storage_bucket = p_bucket_id
    and asset.storage_path = p_object_name
    and asset.status = 'pending'
    and asset.deleted_at is null
  for share;
  return found;
end;
$function$;

revoke all on function private.can_write_content_media_object(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.can_write_content_media_object(uuid, text, text)
to authenticated;

-- Count direct deck/specialized-card usage as first-class media references.
create or replace function private.adjust_embedded_media_asset_usage(
  p_media_asset_id uuid,
  p_delta integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_media_asset_id is null or p_delta = 0 then
    return;
  end if;

  if p_delta > 0 then
    update public.media_assets as asset
    set reference_count = asset.reference_count + p_delta,
        status = case
          when asset.status = 'deleting' then 'ready'::public.media_status
          else asset.status
        end,
        delete_after = null,
        version = asset.version + 1
    where asset.id = p_media_asset_id
      and asset.deleted_at is null;
  else
    update public.media_assets as asset
    set reference_count = greatest(asset.reference_count + p_delta, 0),
        status = case
          when greatest(asset.reference_count + p_delta, 0) = 0
            and asset.status = 'ready'
            then 'deleting'::public.media_status
          else asset.status
        end,
        delete_after = case
          when greatest(asset.reference_count + p_delta, 0) = 0
            and asset.status in ('ready', 'deleting')
            then coalesce(asset.delete_after, pg_catalog.now() + interval '7 days')
          else asset.delete_after
        end,
        version = asset.version + 1
    where asset.id = p_media_asset_id
      and asset.deleted_at is null;
  end if;
end;
$function$;

create or replace function private.track_embedded_media_asset_usage()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_old_asset_id uuid;
  v_new_asset_id uuid;
  v_old_active boolean := false;
  v_new_active boolean := false;
begin
  if tg_table_name = 'decks' then
    if tg_op <> 'INSERT' then
      v_old_asset_id := old.cover_asset_id;
      v_old_active := old.cover_asset_id is not null and old.status <> 'deleted';
    end if;
    if tg_op <> 'DELETE' then
      v_new_asset_id := new.cover_asset_id;
      v_new_active := new.cover_asset_id is not null and new.status <> 'deleted';
    end if;
  elsif tg_table_name = 'audio_prompts' then
    if tg_op <> 'INSERT' then
      v_old_asset_id := old.media_asset_id;
      v_old_active := old.media_asset_id is not null and old.deleted_at is null;
    end if;
    if tg_op <> 'DELETE' then
      v_new_asset_id := new.media_asset_id;
      v_new_active := new.media_asset_id is not null and new.deleted_at is null;
    end if;
  elsif tg_table_name = 'pronunciation_prompts' then
    if tg_op <> 'INSERT' then
      v_old_asset_id := old.reference_asset_id;
      v_old_active := old.reference_asset_id is not null and old.deleted_at is null;
    end if;
    if tg_op <> 'DELETE' then
      v_new_asset_id := new.reference_asset_id;
      v_new_active := new.reference_asset_id is not null and new.deleted_at is null;
    end if;
  elsif tg_table_name = 'drawing_reference_layers' then
    if tg_op <> 'INSERT' then
      v_old_asset_id := old.media_asset_id;
      v_old_active := old.media_asset_id is not null and old.deleted_at is null;
    end if;
    if tg_op <> 'DELETE' then
      v_new_asset_id := new.media_asset_id;
      v_new_active := new.media_asset_id is not null and new.deleted_at is null;
    end if;
  else
    raise exception using errcode = '22023', message = 'unsupported embedded media table';
  end if;

  if v_old_active and (
    not v_new_active or v_old_asset_id is distinct from v_new_asset_id
  ) then
    perform private.adjust_embedded_media_asset_usage(v_old_asset_id, -1);
  end if;
  if v_new_active and (
    not v_old_active or v_old_asset_id is distinct from v_new_asset_id
  ) then
    perform private.adjust_embedded_media_asset_usage(v_new_asset_id, 1);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.adjust_embedded_media_asset_usage(uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function private.track_embedded_media_asset_usage()
from public, anon, authenticated, service_role;

create trigger decks_track_embedded_media_asset_usage
after insert or update or delete on public.decks
for each row execute function private.track_embedded_media_asset_usage();

create trigger audio_prompts_track_embedded_media_asset_usage
after insert or update or delete on public.audio_prompts
for each row execute function private.track_embedded_media_asset_usage();

create trigger pronunciation_prompts_track_embedded_media_asset_usage
after insert or update or delete on public.pronunciation_prompts
for each row execute function private.track_embedded_media_asset_usage();

create trigger drawing_layers_track_embedded_media_asset_usage
after insert or update or delete on public.drawing_reference_layers
for each row execute function private.track_embedded_media_asset_usage();

-- Retire stale live links left by notes deleted before this migration, then
-- derive the authoritative count from every active usage source.
update public.media_references as reference
set deleted_at = pg_catalog.now(), version = reference.version + 1
where reference.note_id is not null
  and reference.deleted_at is null
  and exists(
    select 1 from public.notes as note
    where note.id = reference.note_id and note.deleted_at is not null
  );

update public.audio_prompts as prompt
set deleted_at = pg_catalog.now(), version = prompt.version + 1
where prompt.deleted_at is null
  and exists(
    select 1 from public.notes as note
    where note.id = prompt.note_id and note.deleted_at is not null
  );
update public.pronunciation_prompts as prompt
set deleted_at = pg_catalog.now(), version = prompt.version + 1
where prompt.deleted_at is null
  and exists(
    select 1 from public.notes as note
    where note.id = prompt.note_id and note.deleted_at is not null
  );
update public.drawing_reference_layers as layer
set deleted_at = pg_catalog.now(), version = layer.version + 1
where layer.deleted_at is null
  and exists(
    select 1 from public.notes as note
    where note.id = layer.note_id and note.deleted_at is not null
  );

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

comment on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) is 'Atomic browser note and media reconciliation boundary; NULL optimistic versions are rejected.';
comment on function private.can_write_content_media_object(uuid, text, text)
is 'Locks and authorizes authenticated storage writes only while the matching media asset remains pending.';

commit;
