-- Bind every browser-reachable content idempotency receipt to the complete
-- canonical command. A reused UUID may replay only the exact original input.

begin;

alter table private.content_mutation_receipts
add column request_fingerprint text,
add column completed_at timestamptz;

-- The additive atomic boundaries introduced in 080 already stored their
-- command fingerprint inside the private response. Preserve those bindings.
update private.content_mutation_receipts as receipt
set request_fingerprint = case
      when receipt.response ->> '__lumenRequestFingerprint' ~ '^[0-9a-f]{64}$'
        then receipt.response ->> '__lumenRequestFingerprint'
      else null
    end,
    completed_at = receipt.created_at;

alter table private.content_mutation_receipts
add constraint content_receipts_fingerprint_format check (
  request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'
),
add constraint content_receipts_completion_shape check (
  (
    completed_at is null
    and request_fingerprint is not null
    and resource_type = 'pending'
    and resource_id is null
    and response = '{}'::jsonb
  )
  or (
    completed_at is not null
    and resource_type <> 'pending'
  )
);

create or replace function private.get_bound_content_receipt(
  p_account_id uuid,
  p_idempotency_key uuid,
  p_operation text,
  p_request jsonb
)
returns private.content_mutation_receipts
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_fingerprint text;
  v_receipt private.content_mutation_receipts;
begin
  if p_request is null or pg_catalog.jsonb_typeof(p_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'content mutation command is invalid';
  end if;

  v_fingerprint := private.content_hash(p_request);
  -- The established lookup owns account/key serialization, operation matching,
  -- and the resource-level permission recheck for completed receipts.
  v_receipt := private.get_content_receipt(
    p_account_id,
    p_idempotency_key,
    p_operation
  );
  if v_receipt.idempotency_key is not null then
    if v_receipt.completed_at is null
      or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'content mutation replay does not match';
    end if;
    return v_receipt;
  end if;

  -- This row is transaction-local until the command commits. The advisory lock
  -- held by get_content_receipt makes a concurrent retry observe only the final
  -- completed row; an exception rolls the pending row back with all side effects.
  insert into private.content_mutation_receipts (
    account_id,
    idempotency_key,
    operation,
    resource_type,
    resource_id,
    response,
    request_fingerprint,
    completed_at
  ) values (
    p_account_id,
    p_idempotency_key,
    p_operation,
    'pending',
    null,
    '{}'::jsonb,
    v_fingerprint,
    null
  );
  return v_receipt;
end;
$function$;

create or replace function private.record_content_receipt(
  p_account_id uuid,
  p_idempotency_key uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_response jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_response_fingerprint text;
  v_receipt private.content_mutation_receipts;
begin
  if p_account_id is null
    or p_idempotency_key is null
    or p_operation is null
    or p_resource_type is null
    or p_resource_type = 'pending'
    or p_response is null
    or pg_catalog.jsonb_typeof(p_response) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'content mutation receipt is invalid';
  end if;

  v_response_fingerprint := nullif(
    p_response ->> '__lumenRequestFingerprint',
    ''
  );
  if v_response_fingerprint is not null
    and v_response_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'content mutation receipt fingerprint is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );
  select receipt.* into v_receipt
  from private.content_mutation_receipts as receipt
  where receipt.account_id = p_account_id
    and receipt.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_receipt.operation <> p_operation
      or v_receipt.completed_at is not null
      or v_receipt.resource_type <> 'pending'
      or v_receipt.request_fingerprint is null
      or (
        v_response_fingerprint is not null
        and v_receipt.request_fingerprint <> v_response_fingerprint
      ) then
      raise exception using
        errcode = '22023',
        message = 'content mutation replay does not match';
    end if;

    update private.content_mutation_receipts as receipt
    set resource_type = p_resource_type,
        resource_id = p_resource_id,
        response = p_response,
        completed_at = pg_catalog.now()
    where receipt.account_id = p_account_id
      and receipt.idempotency_key = p_idempotency_key;
    return;
  end if;

  -- Existing 080 atomic functions bind themselves in their private response.
  -- Trusted, non-browser component operations may remain unbound because their
  -- idempotency keys are generated inside an already-bound outer transaction.
  insert into private.content_mutation_receipts (
    account_id,
    idempotency_key,
    operation,
    resource_type,
    resource_id,
    response,
    request_fingerprint,
    completed_at
  ) values (
    p_account_id,
    p_idempotency_key,
    p_operation,
    p_resource_type,
    p_resource_id,
    p_response,
    v_response_fingerprint,
    pg_catalog.now()
  );
end;
$function$;

revoke all on function private.get_bound_content_receipt(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.record_content_receipt(uuid, uuid, text, text, uuid, jsonb)
from public, anon, authenticated, service_role;

-- Keep the already-reviewed implementations and replace only their receipt
-- lookup with a payload-bound lookup. Each JSON object names every command
-- argument except the actor (already scoped by the receipt key) and key itself.
do $block$
declare
  v_definition text;
  v_rewritten text;
  v_target record;
begin
  for v_target in
    select *
    from (
      values
        (
          'public.current_create_folder(text,uuid,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.create')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'folder.create',
    pg_catalog.jsonb_build_object('name', p_name, 'parentId', p_parent_id)
  )$new$
        ),
        (
          'private.content_update_folder_unchecked(uuid,bigint,text,uuid,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.update')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'folder.update',
    pg_catalog.jsonb_build_object(
      'folderId', p_folder_id,
      'expectedVersion', p_expected_version,
      'name', p_name,
      'parentId', p_parent_id
    )
  )$new$
        ),
        (
          'private.content_delete_folder_unchecked(uuid,bigint,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.delete')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'folder.delete',
    pg_catalog.jsonb_build_object(
      'folderId', p_folder_id,
      'expectedVersion', p_expected_version
    )
  )$new$
        ),
        (
          'public.current_create_note_type(text,text,jsonb,jsonb,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'note_type.create')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note_type.create',
    pg_catalog.jsonb_build_object(
      'displayName', p_display_name,
      'description', p_description,
      'fields', p_fields,
      'templates', p_templates
    )
  )$new$
        ),
        (
          'private.content_update_note_type_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'note_type.update')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note_type.update',
    pg_catalog.jsonb_build_object(
      'noteTypeId', p_note_type_id,
      'expectedVersion', p_expected_version,
      'patch', p_patch
    )
  )$new$
        ),
        (
          'public.current_create_deck(text,jsonb,uuid,public.deck_visibility,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.create')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.create',
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'descriptionDoc', p_description_doc,
      'folderId', p_folder_id,
      'visibility', p_visibility
    )
  )$new$
        ),
        (
          'private.content_update_deck_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.update')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.update',
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'expectedVersion', p_expected_version,
      'patch', p_patch
    )
  )$new$
        ),
        (
          'private.set_deck_lifecycle(text,uuid,bigint,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.' || p_operation)$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.' || p_operation,
    pg_catalog.jsonb_build_object(
      'operation', p_operation,
      'deckId', p_deck_id,
      'expectedVersion', p_expected_version
    )
  )$new$
        ),
        (
          'private.content_delete_note_unchecked(uuid,bigint,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'note.delete')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.delete',
    pg_catalog.jsonb_build_object(
      'noteId', p_note_id,
      'expectedVersion', p_expected_version
    )
  )$new$
        ),
        (
          'public.current_duplicate_deck(uuid,text,uuid,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.duplicate')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.duplicate',
    pg_catalog.jsonb_build_object(
      'sourceDeckId', p_source_deck_id,
      'title', p_title,
      'folderId', p_folder_id
    )
  )$new$
        ),
        (
          'public.current_register_media_asset(text,text,public.media_kind,bigint,integer,integer,integer,text,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'media.register')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'media.register',
    pg_catalog.jsonb_build_object(
      'sha256', p_sha256,
      'mimeType', p_mime_type,
      'kind', p_kind,
      'byteSize', p_byte_size,
      'width', p_width,
      'height', p_height,
      'durationMs', p_duration_ms,
      'altText', nullif(pg_catalog.btrim(coalesce(p_alt_text, '')), '')
    )
  )$new$
        ),
        (
          'private.content_bulk_tag_notes_unchecked(uuid,uuid[],bigint[],text[],text[],uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'note.bulk_tag')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.bulk_tag',
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'noteIds', p_note_ids,
      'expectedVersions', p_expected_versions,
      'addTags', p_add_tags,
      'removeTags', p_remove_tags
    )
  )$new$
        ),
        (
          'private.content_bulk_move_notes_unchecked(uuid,uuid,uuid[],bigint[],uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'note.bulk_move')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.bulk_move',
    pg_catalog.jsonb_build_object(
      'sourceDeckId', p_source_deck_id,
      'targetDeckId', p_target_deck_id,
      'noteIds', p_note_ids,
      'expectedVersions', p_expected_versions
    )
  )$new$
        ),
        (
          'private.content_publish_deck_unchecked(uuid,bigint,public.deck_visibility,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.publish')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.publish',
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'expectedVersion', p_expected_version,
      'visibility', p_visibility
    )
  )$new$
        ),
        (
          'private.content_unpublish_deck_unchecked(uuid,bigint,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.unpublish')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.unpublish',
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'expectedVersion', p_expected_version
    )
  )$new$
        ),
        (
          'private.content_restore_deck_version_unchecked(uuid,bigint,bigint,uuid)'::regprocedure,
          $old$private.get_content_receipt(v_account_id, p_idempotency_key, 'deck_version.restore')$old$,
          $new$private.get_bound_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck_version.restore',
    pg_catalog.jsonb_build_object(
      'deckId', p_deck_id,
      'expectedVersion', p_expected_version,
      'versionNumber', p_version_number
    )
  )$new$
        )
    ) as targets(procedure_oid, old_call, new_call)
  loop
    select pg_catalog.pg_get_functiondef(v_target.procedure_oid)
    into strict v_definition;
    v_rewritten := pg_catalog.replace(
      v_definition,
      v_target.old_call,
      v_target.new_call
    );
    if v_rewritten = v_definition then
      raise exception 'content receipt binding rewrite did not match %',
        v_target.procedure_oid::regprocedure;
    end if;
    execute v_rewritten;
  end loop;
end;
$block$;

comment on column private.content_mutation_receipts.request_fingerprint is
  'SHA-256 of the complete canonical mutation command; null only for pre-binding rows or trusted inner operations.';
comment on column private.content_mutation_receipts.completed_at is
  'Null only for an uncommitted payload-bound command in the transaction currently holding its account/key lock.';
comment on function private.get_bound_content_receipt(uuid, uuid, text, jsonb) is
  'Serializes, reauthorizes, and binds one content idempotency UUID to an exact canonical JSONB command.';

commit;
