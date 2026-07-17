-- Close the remaining Phase 02 transaction and physical-media lifecycle gaps
-- without changing any previously applied migration.

begin;

-- The original publication filter treated any word inside a template tag as
-- a field reference. A custom field named after a DSL keyword (for example
-- `media` in `{{media Term}}` or `if` in `{{#if Definition}}`) could therefore
-- enter the frozen projection even though the template never referenced that
-- field. Match only the exact field positions accepted by the bounded DSL.
create or replace function private.template_uses_field(p_source text, p_field text)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_match text[];
  v_tag text;
begin
  if p_field is null or p_field !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$' then
    return false;
  end if;

  for v_match in
    select tag_match
    from pg_catalog.regexp_matches(
      coalesce(p_source, ''),
      '\{\{([^}]*)\}\}',
      'g'
    ) as tag_match
  loop
    v_tag := pg_catalog.regexp_replace(
      v_match[1],
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );

    if (
      v_tag = p_field
      and p_field not in ('front', 'FrontSide', 'item')
    )
      or v_tag = 'field:' || p_field
      or v_tag ~ ('^field[[:space:]]+' || p_field || '$')
      or v_tag ~ (
        '^(cloze|type|type_answer|hint|media|language):' || p_field || '$'
      )
      or v_tag ~ (
        '^(cloze|type|type_answer|hint|media|language)[[:space:]]+' || p_field || '$'
      )
      or v_tag ~ ('^#(if|each)[[:space:]]+' || p_field || '$') then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

-- Match the domain boundary: custom notes can carry 64 fields and template
-- names can contain 120 characters. This is additive because the original
-- Phase 02 migration may already be applied in a deployed database.
alter table public.card_templates
drop constraint card_templates_name_length;
alter table public.card_templates
add constraint card_templates_name_length check (
  pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120
);

create or replace function private.create_custom_note_type_definition(
  p_account_id uuid,
  p_definition jsonb,
  p_audit_key uuid
)
returns public.note_types
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_note_type public.note_types;
  v_note_type_id uuid := extensions.gen_random_uuid();
  v_field jsonb;
  v_template jsonb;
  v_generation_condition jsonb;
  v_generation_condition_text text;
  v_position integer := 0;
begin
  if p_account_id is null
    or p_definition is null
    or pg_catalog.jsonb_typeof(p_definition) <> 'object'
    or exists(
      select 1
      from pg_catalog.jsonb_object_keys(p_definition) as definition_key
      where definition_key not in ('displayName', 'description', 'fields', 'templates')
    )
    or not (p_definition ? 'fields')
    or not (p_definition ? 'templates')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_definition ->> 'displayName', '')))
      not between 1 and 100
    or pg_catalog.char_length(coalesce(p_definition ->> 'description', '')) > 1000
    or pg_catalog.jsonb_typeof(p_definition -> 'fields') <> 'array'
    or pg_catalog.jsonb_array_length(p_definition -> 'fields') not between 1 and 64
    or pg_catalog.jsonb_typeof(p_definition -> 'templates') <> 'array'
    or pg_catalog.jsonb_array_length(p_definition -> 'templates') not between 1 and 20 then
    raise exception using errcode = '22023', message = 'custom note type definition is invalid';
  end if;

  insert into public.note_types (
    id,
    owner_account_id,
    code,
    display_name,
    card_kind,
    description,
    is_system,
    template_policy
  ) values (
    v_note_type_id,
    p_account_id,
    'custom_' || pg_catalog.replace(v_note_type_id::text, '-', ''),
    pg_catalog.btrim(p_definition ->> 'displayName'),
    'custom',
    coalesce(p_definition ->> 'description', ''),
    false,
    pg_catalog.jsonb_build_object('definitionHash', private.content_hash(p_definition))
  ) returning * into v_note_type;

  for v_field in
    select field.value
    from pg_catalog.jsonb_array_elements(p_definition -> 'fields') as field(value)
  loop
    if pg_catalog.jsonb_typeof(v_field) <> 'object'
      or exists(
        select 1
        from pg_catalog.jsonb_object_keys(v_field) as field_key
        where field_key not in (
          'fieldKey', 'label', 'fieldType', 'position', 'required', 'language',
          'gradingSettings', 'displaySettings'
        )
      )
      or coalesce(v_field ->> 'fieldKey', '') !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
      or pg_catalog.char_length(pg_catalog.btrim(coalesce(v_field ->> 'label', '')))
        not between 1 and 100
      or coalesce(v_field ->> 'fieldType', 'rich_text') not in (
        'rich_text', 'plain_text', 'boolean', 'number', 'list', 'media'
      )
      or coalesce(v_field ->> 'position', v_position::text) !~ '^[0-9]{1,3}$'
      or coalesce((v_field ->> 'position')::integer, v_position) not between 0 and 999
      or (
        v_field ? 'required'
        and pg_catalog.jsonb_typeof(v_field -> 'required') <> 'boolean'
      )
      or (
        v_field ? 'language'
        and pg_catalog.jsonb_typeof(v_field -> 'language') <> 'null'
        and (
          pg_catalog.jsonb_typeof(v_field -> 'language') <> 'string'
          or pg_catalog.char_length(v_field ->> 'language') not between 2 and 35
        )
      )
      or pg_catalog.jsonb_typeof(coalesce(v_field -> 'gradingSettings', '{}'::jsonb)) <> 'object'
      or pg_catalog.jsonb_typeof(coalesce(v_field -> 'displaySettings', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '22023', message = 'custom note type field is invalid';
    end if;

    insert into public.note_type_fields (
      note_type_id,
      field_key,
      label,
      field_type,
      position,
      required,
      language,
      grading_settings,
      display_settings
    ) values (
      v_note_type.id,
      v_field ->> 'fieldKey',
      pg_catalog.btrim(v_field ->> 'label'),
      coalesce(v_field ->> 'fieldType', 'rich_text')::public.note_field_type,
      coalesce((v_field ->> 'position')::integer, v_position),
      coalesce((v_field ->> 'required')::boolean, false),
      case when pg_catalog.jsonb_typeof(v_field -> 'language') = 'string'
        then v_field ->> 'language' else null end,
      coalesce(v_field -> 'gradingSettings', '{}'::jsonb),
      coalesce(v_field -> 'displaySettings', '{}'::jsonb)
    );
    v_position := v_position + 1;
  end loop;

  v_position := 0;
  for v_template in
    select template.value
    from pg_catalog.jsonb_array_elements(p_definition -> 'templates') as template(value)
  loop
    if pg_catalog.jsonb_typeof(v_template) <> 'object'
      or exists(
        select 1
        from pg_catalog.jsonb_object_keys(v_template) as template_key
        where template_key not in (
          'templateKey', 'name', 'ordinal', 'generationCondition', 'frontTemplate',
          'backTemplate', 'stylingCss', 'answerFieldKey', 'schemaVersion'
        )
      )
      or coalesce(v_template ->> 'templateKey', '') !~ '^[a-z][a-z0-9_.:-]{0,79}$'
      or pg_catalog.char_length(pg_catalog.btrim(coalesce(v_template ->> 'name', '')))
        not between 1 and 120
      or not (v_template ? 'frontTemplate')
      or pg_catalog.jsonb_typeof(v_template -> 'frontTemplate') <> 'string'
      or not (v_template ? 'backTemplate')
      or pg_catalog.jsonb_typeof(v_template -> 'backTemplate') <> 'string'
      or coalesce(v_template ->> 'ordinal', v_position::text) !~ '^[0-9]{1,3}$'
      or coalesce((v_template ->> 'ordinal')::integer, v_position) not between 0 and 999
      or coalesce(v_template ->> 'schemaVersion', '1') !~ '^[1-9][0-9]{0,8}$'
      or (
        v_template ? 'stylingCss'
        and pg_catalog.jsonb_typeof(v_template -> 'stylingCss') not in ('null', 'string')
      )
      or not exists(
        select 1
        from public.note_type_fields as field
        where field.note_type_id = v_note_type.id
          and field.field_key = v_template ->> 'answerFieldKey'
          and field.deleted_at is null
      ) then
      raise exception using errcode = '22023', message = 'custom note type template is invalid';
    end if;

    v_generation_condition := v_template -> 'generationCondition';
    v_generation_condition_text := null;
    if v_generation_condition is not null
      and pg_catalog.jsonb_typeof(v_generation_condition) <> 'null' then
      if pg_catalog.jsonb_typeof(v_generation_condition) <> 'object'
        or exists(
          select 1
          from pg_catalog.jsonb_object_keys(v_generation_condition) as condition_key
          where condition_key not in ('field', 'when')
        )
        or coalesce(v_generation_condition ->> 'field', '')
          !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
        or v_generation_condition ->> 'when' not in ('nonempty', 'empty')
        or not exists(
          select 1
          from public.note_type_fields as field
          where field.note_type_id = v_note_type.id
            and field.field_key = v_generation_condition ->> 'field'
            and field.deleted_at is null
        ) then
        raise exception using errcode = '22023', message = 'custom template condition is invalid';
      end if;
      v_generation_condition_text := (v_generation_condition ->> 'when')
        || ':' || (v_generation_condition ->> 'field');
    end if;

    insert into public.card_templates (
      note_type_id,
      template_key,
      name,
      ordinal,
      generation_condition,
      front_template,
      back_template,
      styling_css,
      answer_field_key,
      card_kind,
      schema_version
    ) values (
      v_note_type.id,
      v_template ->> 'templateKey',
      pg_catalog.btrim(v_template ->> 'name'),
      coalesce((v_template ->> 'ordinal')::integer, v_position),
      v_generation_condition_text,
      v_template ->> 'frontTemplate',
      v_template ->> 'backTemplate',
      case when pg_catalog.jsonb_typeof(v_template -> 'stylingCss') = 'string'
        then v_template ->> 'stylingCss' else null end,
      v_template ->> 'answerFieldKey',
      'custom',
      coalesce((v_template ->> 'schemaVersion')::integer, 1)
    );
    v_position := v_position + 1;
  end loop;

  perform private.write_audit_event(
    'account',
    p_account_id,
    null,
    null,
    'content.note_type_created',
    'note_type',
    v_note_type.id,
    p_audit_key,
    pg_catalog.jsonb_build_object('definitionHash', private.content_hash(p_definition))
  );
  return v_note_type;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'custom note type definition is invalid';
end;
$function$;

revoke all on function private.create_custom_note_type_definition(uuid, jsonb, uuid)
from public, anon, authenticated, service_role;

create or replace function public.current_upsert_note_definition_with_media(
  p_deck_id uuid,
  p_note_id uuid,
  p_note_type_code text,
  p_expected_version bigint,
  p_fields jsonb,
  p_card_payload jsonb,
  p_tags text[],
  p_media_links jsonb,
  p_idempotency_key uuid,
  p_custom_note_type_definition jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_note public.notes;
  v_note_type public.note_types;
  v_definition_hash text;
  v_note_type_code text := p_note_type_code;
  v_kind text;
  v_authoring_payload jsonb;
  v_request_fingerprint text;
  v_response jsonb;
  v_note_id uuid;
begin
  perform private.require_content_expected_version(p_expected_version);
  v_request_fingerprint := private.content_hash(pg_catalog.jsonb_build_object(
    'deckId', p_deck_id,
    'noteId', p_note_id,
    'noteTypeCode', p_note_type_code,
    'expectedVersion', p_expected_version,
    'fields', p_fields,
    'cardPayload', p_card_payload,
    'tags', p_tags,
    'mediaLinks', p_media_links,
    'customNoteTypeDefinition', p_custom_note_type_definition
  ));
  v_receipt := private.get_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.upsert_with_media'
  );
  if v_receipt.idempotency_key is not null then
    if v_receipt.response ->> '__lumenRequestFingerprint'
      is distinct from v_request_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'content mutation replay does not match';
    end if;
    return v_receipt.response - '__lumenRequestFingerprint';
  end if;

  if p_card_payload is null
    or pg_catalog.jsonb_typeof(p_card_payload) <> 'object'
    or pg_catalog.jsonb_typeof(p_card_payload -> 'authoringData') <> 'object' then
    raise exception using errcode = '22023', message = 'note authoring payload is invalid';
  end if;
  v_authoring_payload := p_card_payload -> 'authoringData';
  v_kind := v_authoring_payload ->> 'kind';
  if v_kind = 'custom' then
    if p_custom_note_type_definition is null then
      raise exception using errcode = '22023', message = 'custom note type definition is required';
    elsif pg_catalog.jsonb_typeof(p_custom_note_type_definition) <> 'object' then
      raise exception using errcode = '22023', message = 'custom note type definition is invalid';
    end if;
    if not (p_custom_note_type_definition ? 'fields')
      or not (p_custom_note_type_definition ? 'templates')
      or pg_catalog.jsonb_typeof(p_custom_note_type_definition -> 'fields') <> 'array'
      or pg_catalog.jsonb_typeof(p_custom_note_type_definition -> 'templates') <> 'array'
      or pg_catalog.jsonb_typeof(v_authoring_payload -> 'fields') <> 'object'
      or pg_catalog.jsonb_typeof(v_authoring_payload -> 'templates') <> 'array' then
      raise exception using errcode = '22023', message = 'custom note type definition is invalid';
    end if;
    if (
      select pg_catalog.array_agg(field_key order by field_key)
      from pg_catalog.jsonb_object_keys(v_authoring_payload -> 'fields') as field_key
    ) is distinct from (
      select pg_catalog.array_agg(field.value ->> 'fieldKey' order by field.value ->> 'fieldKey')
      from pg_catalog.jsonb_array_elements(
        p_custom_note_type_definition -> 'fields'
      ) as field(value)
    )
    or (
      select pg_catalog.array_agg(template.value ->> 'semanticKey' order by template.value ->> 'semanticKey')
      from pg_catalog.jsonb_array_elements(v_authoring_payload -> 'templates') as template(value)
    ) is distinct from (
      select pg_catalog.array_agg(template.value ->> 'templateKey' order by template.value ->> 'templateKey')
      from pg_catalog.jsonb_array_elements(
        p_custom_note_type_definition -> 'templates'
      ) as template(value)
    )
    or exists(
      select 1
      from pg_catalog.jsonb_array_elements(v_authoring_payload -> 'templates') as authored(value)
      left join pg_catalog.jsonb_array_elements(
        p_custom_note_type_definition -> 'templates'
      ) as defined(value)
        on defined.value ->> 'templateKey' = authored.value ->> 'semanticKey'
      where defined.value is null
        or authored.value ->> 'name' is distinct from defined.value ->> 'name'
        or authored.value ->> 'frontTemplate'
          is distinct from defined.value ->> 'frontTemplate'
        or authored.value ->> 'backTemplate'
          is distinct from defined.value ->> 'backTemplate'
        or authored.value ->> 'stylingCss'
          is distinct from defined.value ->> 'stylingCss'
        or coalesce(authored.value -> 'generationCondition', 'null'::jsonb)
          is distinct from coalesce(defined.value -> 'generationCondition', 'null'::jsonb)
    ) then
      raise exception using
        errcode = '22023',
        message = 'custom note type definition does not match authoring payload';
    end if;

    perform 1
    from public.decks as deck
    where deck.id = p_deck_id
      and deck.status = 'active'
    for update;
    if not found or not private.can_edit_deck(v_account_id, p_deck_id) then
      raise exception using errcode = '42501', message = 'deck is unavailable';
    end if;

    v_definition_hash := private.content_hash(p_custom_note_type_definition);
    if p_note_id is not null then
      select note.* into v_note
      from public.notes as note
      where note.id = p_note_id
        and note.deck_id = p_deck_id
        and note.deleted_at is null
      for update;
      if found then
        select note_type.* into v_note_type
        from public.note_types as note_type
        where note_type.id = v_note.note_type_id
          and note_type.deleted_at is null;
      end if;
    end if;

    if v_note_type.id is null
      or v_note_type.card_kind <> 'custom'
      or v_note_type.template_policy ->> 'definitionHash' is distinct from v_definition_hash then
      v_note_type := private.create_custom_note_type_definition(
        v_account_id,
        p_custom_note_type_definition,
        extensions.gen_random_uuid()
      );
    end if;
    v_note_type_code := v_note_type.code;
  elsif p_custom_note_type_definition is not null
    or v_kind is null
    or v_note_type_code is distinct from v_kind
    or v_kind not in (
      'basic', 'basic_reversed', 'optional_reversed', 'bidirectional',
      'typed_answer', 'cloze', 'image_occlusion', 'multiple_choice',
      'select_all', 'true_false', 'ordering', 'list_answer', 'diagram',
      'audio_prompt', 'pronunciation', 'drawing'
    ) then
    raise exception using errcode = '22023', message = 'note type does not match authoring payload';
  end if;

  v_response := private.content_upsert_note_with_media_unchecked(
    p_deck_id,
    coalesce(p_note_id, p_idempotency_key),
    v_note_type_code,
    p_expected_version,
    p_fields,
    p_card_payload,
    p_tags,
    p_media_links,
    extensions.gen_random_uuid()
  );
  v_note_id := (v_response -> 'note' ->> 'id')::uuid;
  if v_note_id is null then
    raise exception using errcode = '55000', message = 'note mutation response is invalid';
  end if;
  perform private.record_content_receipt(
    v_account_id,
    p_idempotency_key,
    'note.upsert_with_media',
    'note',
    v_note_id,
    v_response || pg_catalog.jsonb_build_object(
      '__lumenRequestFingerprint', v_request_fingerprint
    )
  );
  return v_response;
end;
$function$;

revoke all on function public.current_upsert_note_definition_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.current_upsert_note_definition_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid, jsonb
) to authenticated;

revoke all on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) from public, anon, authenticated, service_role;

comment on function public.current_upsert_note_definition_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid, jsonb
) is 'Atomically resolves a copy-on-write custom definition, the note/card graph, and media references.';

create or replace function public.current_apply_deck_settings_and_publication(
  p_deck_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_action text,
  p_visibility public.deck_visibility,
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
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_expected_version bigint := p_expected_version;
  v_request_fingerprint text;
begin
  perform private.require_content_expected_version(p_expected_version);
  if p_action is null
    or p_action not in ('publish', 'unpublish')
    or p_patch is null
    or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'deck publication command is invalid';
  end if;
  if p_action = 'publish'
    and (p_visibility is null or p_visibility not in ('public', 'unlisted')) then
    raise exception using errcode = '22023', message = 'published visibility must be public or unlisted';
  end if;
  if p_action = 'unpublish'
    and (p_visibility is null or p_visibility <> 'private') then
    raise exception using errcode = '22023', message = 'unpublish visibility must be private';
  end if;

  v_request_fingerprint := private.content_hash(pg_catalog.jsonb_build_object(
    'deckId', p_deck_id,
    'expectedVersion', p_expected_version,
    'patch', p_patch,
    'action', p_action,
    'visibility', p_visibility
  ));

  v_receipt := private.get_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.' || p_action
  );
  if v_receipt.idempotency_key is not null then
    if v_receipt.response ->> '__lumenRequestFingerprint'
      is distinct from v_request_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'content mutation replay does not match';
    end if;
    select * into strict v_deck
    from public.decks as deck
    where deck.id = v_receipt.resource_id;
    return v_deck;
  end if;

  if exists(select 1 from pg_catalog.jsonb_object_keys(p_patch)) then
    v_deck := private.content_update_deck_unchecked(
      p_deck_id,
      v_expected_version,
      p_patch,
      extensions.gen_random_uuid()
    );
    v_expected_version := v_deck.version;
  end if;

  if p_action = 'publish' then
    v_deck := private.content_publish_deck_unchecked(
      p_deck_id,
      v_expected_version,
      p_visibility,
      extensions.gen_random_uuid()
    );
  else
    v_deck := private.content_unpublish_deck_unchecked(
      p_deck_id,
      v_expected_version,
      extensions.gen_random_uuid()
    );
  end if;
  perform private.record_content_receipt(
    v_account_id,
    p_idempotency_key,
    'deck.' || p_action,
    'deck',
    v_deck.id,
    pg_catalog.jsonb_build_object(
      '__lumenRequestFingerprint', v_request_fingerprint,
      'version', v_deck.version
    )
  );
  return v_deck;
end;
$function$;

revoke all on function public.current_apply_deck_settings_and_publication(
  uuid, bigint, jsonb, text, public.deck_visibility, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.current_apply_deck_settings_and_publication(
  uuid, bigint, jsonb, text, public.deck_visibility, uuid
) to authenticated;

comment on function public.current_apply_deck_settings_and_publication(
  uuid, bigint, jsonb, text, public.deck_visibility, uuid
) is 'Atomically applies optional deck settings and publishes or unpublishes the resulting deck version.';

-- A private durable queue separates logical eligibility from physical Storage
-- deletion. Storage locators remain service-only and retries are leased.
create table private.content_media_deletion_jobs (
  media_asset_id uuid primary key references public.media_assets (id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at timestamptz not null default pg_catalog.now(),
  lease_token uuid,
  lease_owner uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint content_media_deletion_jobs_status check (status in ('queued', 'leased', 'completed')),
  constraint content_media_deletion_jobs_attempts check (attempt_count >= 0),
  constraint content_media_deletion_jobs_locator_length check (
    pg_catalog.char_length(storage_bucket) between 1 and 100
    and pg_catalog.char_length(storage_path) between 1 and 500
  ),
  constraint content_media_deletion_jobs_error_length check (
    last_error is null or pg_catalog.char_length(last_error) <= 1000
  ),
  constraint content_media_deletion_jobs_lease_consistent check (
    (status = 'leased' and lease_token is not null and lease_owner is not null and lease_until is not null)
    or status <> 'leased'
  )
);

create index content_media_deletion_jobs_ready_idx
on private.content_media_deletion_jobs (available_at, media_asset_id)
where status = 'queued';
create index content_media_deletion_jobs_lease_idx
on private.content_media_deletion_jobs (lease_until, media_asset_id)
where status = 'leased';

alter table private.content_media_deletion_jobs enable row level security;
revoke all on table private.content_media_deletion_jobs
from public, anon, authenticated, service_role;

-- The validated application route owns the complete object write. A pending
-- row alone is not proof that bytes written directly with a browser credential
-- match the hash and magic bytes verified by that route, so remove all
-- authenticated Storage mutation policies before trusted finalization.
drop policy if exists content_media_insert on storage.objects;
drop policy if exists content_media_update on storage.objects;
drop policy if exists content_media_delete on storage.objects;
revoke all on function private.can_write_content_media_object(uuid, text, text)
from public, anon, authenticated, service_role;

-- A completed tombstone must not reserve its owner's content hash forever.
-- Keep one live row per owner/hash while preserving every deleted asset and
-- its completed deletion job as immutable history. A later upload receives a
-- new asset/public ID and therefore a new Storage path that a stale worker for
-- the old asset cannot remove.
alter table public.media_assets
drop constraint media_assets_owner_account_id_sha256_key;
create unique index media_assets_owner_live_sha256_idx
on public.media_assets (owner_account_id, sha256)
where deleted_at is null;

-- Registration is a reservation, not proof that bytes reached Storage.
-- Bound old reservations so a crashed/abandoned upload cannot consume quota
-- indefinitely. Quarantined bytes use the same cleanup path.
update public.media_assets as asset
set delete_after = coalesce(asset.delete_after, asset.created_at + interval '24 hours'),
    version = asset.version + 1
where asset.status in ('pending', 'quarantined')
  and asset.deleted_at is null
  and asset.delete_after is null;

create or replace function public.current_register_media_asset(
  p_sha256 text,
  p_mime_type text,
  p_kind public.media_kind,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_duration_ms integer,
  p_alt_text text,
  p_idempotency_key uuid
)
returns public.media_assets
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_receipt_asset public.media_assets;
  v_asset public.media_assets;
  v_extension text;
  v_public_id uuid;
  v_request_fingerprint text;
begin
  p_sha256 := pg_catalog.lower(pg_catalog.btrim(p_sha256));
  p_mime_type := pg_catalog.lower(pg_catalog.btrim(p_mime_type));
  if p_idempotency_key is null
    or p_kind is null
    or p_sha256 is null
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_mime_type is null
    or p_byte_size is null
    or p_byte_size <= 0
    or (p_kind = 'image' and (
      p_mime_type not in ('image/jpeg','image/png','image/webp')
      or p_byte_size > 5242880 or p_width is null or p_height is null
    ))
    or (p_kind = 'audio' and (
      p_mime_type not in ('audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm')
      or p_byte_size > 10485760
    )) then
    raise exception using errcode = '22023', message = 'media metadata is invalid';
  end if;

  v_request_fingerprint := private.content_hash(pg_catalog.jsonb_build_object(
    'sha256', p_sha256,
    'mimeType', p_mime_type,
    'kind', p_kind,
    'byteSize', p_byte_size,
    'width', p_width,
    'height', p_height,
    'durationMs', p_duration_ms,
    'altText', nullif(pg_catalog.btrim(coalesce(p_alt_text, '')), '')
  ));
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'media.register');
  if v_receipt.idempotency_key is not null then
    select asset.* into v_receipt_asset
    from public.media_assets as asset
    where asset.id = v_receipt.resource_id;
    if not found
      or (
        v_receipt.response ? '__lumenRequestFingerprint'
        and v_receipt.response ->> '__lumenRequestFingerprint'
          is distinct from v_request_fingerprint
      )
      or (
        not (v_receipt.response ? '__lumenRequestFingerprint')
        and (
          v_receipt_asset.owner_account_id is distinct from v_account_id
          or v_receipt_asset.sha256 is distinct from p_sha256
          or v_receipt_asset.kind is distinct from p_kind
          or v_receipt_asset.byte_size is distinct from p_byte_size
          or v_receipt_asset.mime_type is distinct from p_mime_type
        )
      ) then
      raise exception using errcode = '22023', message = 'media registration replay does not match';
    end if;
    if v_receipt_asset.deleted_at is not null then
      delete from private.content_mutation_receipts as receipt
      where receipt.account_id = v_account_id
        and receipt.idempotency_key = p_idempotency_key;
    else
      return v_receipt_asset;
    end if;
  end if;

  -- Different idempotency keys for the same bytes must serialize even when no
  -- live row exists yet; a row lock cannot protect that absence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text || ':' || p_sha256, 2)
  );

  select asset.* into v_asset
  from public.media_assets as asset
  where asset.owner_account_id = v_account_id
    and asset.sha256 = p_sha256
    and asset.deleted_at is null
  for update;
  if found then
    if v_asset.kind <> p_kind
      or v_asset.byte_size <> p_byte_size
      or v_asset.mime_type <> p_mime_type
      or v_asset.status in ('quarantined', 'deleted') then
      raise exception using errcode = '22023', message = 'media hash replay does not match';
    end if;
    if exists(
      select 1
      from private.content_media_deletion_jobs as job
      where job.media_asset_id = v_asset.id
    ) then
      raise exception using errcode = '55000', message = 'media asset deletion has begun';
    end if;

    update public.media_assets as asset
    set status = case
          when asset.status = 'deleting' and asset.magic_verified
            then 'ready'::public.media_status
          when asset.status = 'deleting'
            then 'pending'::public.media_status
          else asset.status
        end,
        delete_after = case
          when asset.status = 'pending'
            or (asset.status = 'deleting' and not asset.magic_verified)
            then pg_catalog.now() + interval '24 hours'
          when asset.reference_count = 0
            then pg_catalog.now() + interval '7 days'
          else null
        end,
        alt_text = coalesce(
          nullif(pg_catalog.btrim(coalesce(p_alt_text, '')), ''),
          asset.alt_text
        ),
        version = asset.version + 1
    where asset.id = v_asset.id
    returning asset.* into v_asset;

    perform private.record_content_receipt(
      v_account_id, p_idempotency_key, 'media.register', 'media_asset', v_asset.id,
      pg_catalog.jsonb_build_object(
        'version', v_asset.version,
        'deduplicated', true,
        '__lumenRequestFingerprint', v_request_fingerprint
      )
    );
    return v_asset;
  end if;

  if coalesce((
    select pg_catalog.sum(asset.byte_size)
    from public.media_assets as asset
    where asset.owner_account_id = v_account_id
      and asset.status not in ('quarantined', 'deleted')
      and asset.deleted_at is null
  ), 0) + p_byte_size > 52428800 then
    raise exception using errcode = '54000', message = 'media quota exceeded';
  end if;
  v_extension := case p_mime_type
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a'
    when 'audio/ogg' then 'ogg' when 'audio/wav' then 'wav'
    when 'audio/webm' then 'webm'
  end;
  v_public_id := extensions.gen_random_uuid();
  insert into public.media_assets (
    public_id, owner_account_id, sha256, kind, mime_type, byte_size, width, height,
    duration_ms, storage_path, alt_text, delete_after
  ) values (
    v_public_id, v_account_id, p_sha256, p_kind, p_mime_type, p_byte_size, p_width, p_height,
    p_duration_ms,
    v_public_id::text || '/' || pg_catalog.left(p_sha256, 2) || '/' || p_sha256 || '.' || v_extension,
    nullif(pg_catalog.btrim(coalesce(p_alt_text, '')), ''),
    pg_catalog.now() + interval '24 hours'
  ) returning * into v_asset;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.media_registered',
    'media_asset', v_asset.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('kind', v_asset.kind, 'byteSize', v_asset.byte_size)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'media.register', 'media_asset', v_asset.id,
    pg_catalog.jsonb_build_object(
      'version', v_asset.version,
      'deduplicated', false,
      '__lumenRequestFingerprint', v_request_fingerprint
    )
  );
  return v_asset;
end;
$function$;

create or replace function public.admin_finalize_media_asset(
  p_actor_account_id uuid,
  p_media_asset_id uuid,
  p_detected_sha256 text,
  p_detected_mime_type text,
  p_magic_verified boolean,
  p_idempotency_key uuid
)
returns public.media_assets
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets;
  v_verified boolean;
begin
  if p_actor_account_id is null
    or p_media_asset_id is null
    or p_idempotency_key is null
    or p_detected_sha256 is null
    or pg_catalog.lower(pg_catalog.btrim(p_detected_sha256)) !~ '^[a-f0-9]{64}$'
    or p_detected_mime_type is null
    or pg_catalog.char_length(pg_catalog.btrim(p_detected_mime_type)) not between 3 and 100
    or p_magic_verified is null then
    raise exception using errcode = '22023', message = 'media finalization input is invalid';
  end if;
  select asset.* into v_asset
  from public.media_assets as asset
  where asset.id = p_media_asset_id
    and asset.owner_account_id = p_actor_account_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'media asset is unavailable';
  end if;
  if exists(
    select 1
    from private.content_media_deletion_jobs as job
    where job.media_asset_id = v_asset.id
  ) then
    raise exception using errcode = '55000', message = 'media asset deletion has begun';
  end if;
  if v_asset.status = 'ready' then
    if v_asset.detected_mime_type <> pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type))
      or v_asset.sha256 <> pg_catalog.lower(pg_catalog.btrim(p_detected_sha256)) then
      raise exception using errcode = '22023', message = 'media finalization replay does not match';
    end if;
    if v_asset.reference_count = 0 then
      update public.media_assets as asset
      set delete_after = pg_catalog.now() + interval '7 days',
          version = asset.version + 1
      where asset.id = v_asset.id
      returning asset.* into v_asset;
    end if;
    return v_asset;
  end if;
  if v_asset.status <> 'pending' then
    raise exception using errcode = '55000', message = 'media asset is unavailable';
  end if;

  v_verified := coalesce(p_magic_verified, false)
    and v_asset.sha256 = pg_catalog.lower(pg_catalog.btrim(p_detected_sha256))
    and v_asset.mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type));
  update public.media_assets as asset
  set detected_mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type)),
      magic_verified = v_verified,
      status = case when v_verified
        then 'ready'::public.media_status else 'quarantined'::public.media_status end,
      delete_after = case when v_verified and asset.reference_count = 0
        then pg_catalog.now() + interval '7 days'
        when not v_verified then pg_catalog.now()
        else null end,
      version = asset.version + 1
  where asset.id = p_media_asset_id
  returning asset.* into v_asset;
  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    case when v_asset.status = 'ready' then 'content.media_verified' else 'content.media_quarantined' end,
    'media_asset', v_asset.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('status', v_asset.status)
  );
  return v_asset;
end;
$function$;

create or replace function public.admin_abandon_media_asset_upload(
  p_actor_account_id uuid,
  p_media_asset_id uuid,
  p_idempotency_key uuid
)
returns public.media_assets
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_receipt private.content_mutation_receipts;
  v_asset public.media_assets;
begin
  if p_actor_account_id is null
    or p_media_asset_id is null
    or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'media upload abandonment is invalid';
  end if;
  v_receipt := private.get_content_receipt(
    p_actor_account_id,
    p_idempotency_key,
    'media.register'
  );
  if v_receipt.idempotency_key is not null
    and v_receipt.resource_id is distinct from p_media_asset_id then
    raise exception using errcode = '22023', message = 'media upload abandonment does not match';
  end if;

  select asset.* into v_asset
  from public.media_assets as asset
  where asset.id = p_media_asset_id
    and asset.owner_account_id = p_actor_account_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'media asset is unavailable';
  end if;
  if v_asset.status = 'pending' then
    if v_asset.reference_count <> 0
      or exists(
        select 1 from public.media_references as reference
        where reference.media_asset_id = v_asset.id and reference.deleted_at is null
      )
      or exists(
        select 1 from public.decks as deck
        where deck.cover_asset_id = v_asset.id and deck.status <> 'deleted'
      )
      or exists(
        select 1 from public.audio_prompts as prompt
        where prompt.media_asset_id = v_asset.id and prompt.deleted_at is null
      )
      or exists(
        select 1 from public.pronunciation_prompts as prompt
        where prompt.reference_asset_id = v_asset.id and prompt.deleted_at is null
      )
      or exists(
        select 1 from public.drawing_reference_layers as layer
        where layer.media_asset_id = v_asset.id and layer.deleted_at is null
      )
      or exists(
        select 1 from public.media_publications as publication
        where publication.media_public_id = v_asset.public_id
      ) then
      raise exception using errcode = '55000', message = 'media upload is already in use';
    end if;
    update public.media_assets as asset
    set status = 'deleting',
        delete_after = pg_catalog.now(),
        version = asset.version + 1
    where asset.id = v_asset.id
    returning asset.* into v_asset;
    delete from private.content_mutation_receipts as receipt
    where receipt.account_id = p_actor_account_id
      and receipt.idempotency_key = p_idempotency_key
      and receipt.operation = 'media.register'
      and receipt.resource_id = p_media_asset_id;
  end if;
  return v_asset;
end;
$function$;

revoke all on function public.admin_abandon_media_asset_upload(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_abandon_media_asset_upload(uuid, uuid, uuid)
to service_role;
comment on function public.admin_abandon_media_asset_upload(uuid, uuid, uuid)
is 'Service-only compensation for a registered upload that did not complete; makes the unused locator immediately cleanup-eligible.';

create or replace function public.admin_claim_due_media_deletions(
  p_limit integer,
  p_worker_id uuid,
  p_lease_seconds integer default 300
)
returns table (
  media_asset_id uuid,
  storage_bucket text,
  storage_path text,
  lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets;
  v_token uuid;
begin
  if p_worker_id is null
    or p_limit is null
    or p_limit not between 1 and 100
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'media deletion claim is invalid';
  end if;

  for v_asset in
    select asset.*
    from public.media_assets as asset
    left join private.content_media_deletion_jobs as job
      on job.media_asset_id = asset.id
    where asset.status in ('pending', 'ready', 'quarantined', 'deleting')
      and asset.deleted_at is null
      and asset.reference_count = 0
      and asset.delete_after <= pg_catalog.now()
      and (
        job.media_asset_id is null
        or (job.status = 'queued' and job.available_at <= pg_catalog.now())
        or (job.status = 'leased' and job.lease_until <= pg_catalog.now())
      )
      and not exists(
        select 1 from public.media_references as reference
        where reference.media_asset_id = asset.id and reference.deleted_at is null
      )
      and not exists(
        select 1 from public.decks as deck
        where deck.cover_asset_id = asset.id and deck.status <> 'deleted'
      )
      and not exists(
        select 1 from public.audio_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.media_asset_id = asset.id
          and prompt.deleted_at is null and note.deleted_at is null
      )
      and not exists(
        select 1 from public.pronunciation_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.reference_asset_id = asset.id
          and prompt.deleted_at is null and note.deleted_at is null
      )
      and not exists(
        select 1 from public.drawing_reference_layers as layer
        join public.notes as note on note.id = layer.note_id
        where layer.media_asset_id = asset.id
          and layer.deleted_at is null and note.deleted_at is null
      )
      and not exists(
        select 1 from public.media_publications as publication
        where publication.media_public_id = asset.public_id
      )
    order by asset.delete_after, asset.id
    for update of asset skip locked
    limit p_limit
  loop
    if v_asset.status <> 'deleting' then
      update public.media_assets as asset
      set status = 'deleting',
          version = asset.version + 1
      where asset.id = v_asset.id
      returning asset.* into v_asset;
    end if;
    v_token := extensions.gen_random_uuid();
    insert into private.content_media_deletion_jobs as job (
      media_asset_id,
      storage_bucket,
      storage_path,
      status,
      attempt_count,
      available_at,
      lease_token,
      lease_owner,
      lease_until,
      last_error,
      updated_at,
      completed_at
    ) values (
      v_asset.id,
      v_asset.storage_bucket,
      v_asset.storage_path,
      'leased',
      1,
      pg_catalog.now(),
      v_token,
      p_worker_id,
      pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      null,
      pg_catalog.now(),
      null
    ) on conflict on constraint content_media_deletion_jobs_pkey do update
    set storage_bucket = excluded.storage_bucket,
        storage_path = excluded.storage_path,
        status = 'leased',
        attempt_count = job.attempt_count + 1,
        lease_token = excluded.lease_token,
        lease_owner = excluded.lease_owner,
        lease_until = excluded.lease_until,
        last_error = null,
        updated_at = excluded.updated_at,
        completed_at = null;

    media_asset_id := v_asset.id;
    storage_bucket := v_asset.storage_bucket;
    storage_path := v_asset.storage_path;
    lease_token := v_token;
    return next;
  end loop;
end;
$function$;

create or replace function public.admin_complete_media_deletion(
  p_media_asset_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets;
  v_job private.content_media_deletion_jobs;
  v_delay_seconds integer;
begin
  if p_media_asset_id is null
    or p_lease_token is null
    or p_succeeded is null
    or pg_catalog.char_length(coalesce(p_error, '')) > 1000 then
    raise exception using errcode = '22023', message = 'media deletion completion is invalid';
  end if;

  select * into v_asset
  from public.media_assets as asset
  where asset.id = p_media_asset_id
  for update;
  select * into v_job
  from private.content_media_deletion_jobs as job
  where job.media_asset_id = p_media_asset_id
  for update;
  if v_asset.id is null
    or v_job.media_asset_id is null
    or v_job.lease_token is distinct from p_lease_token then
    raise exception using errcode = '42501', message = 'media deletion lease is unavailable';
  end if;
  if v_job.status = 'completed' then
    return pg_catalog.jsonb_build_object('mediaAssetId', v_asset.id, 'status', 'completed');
  end if;
  if v_job.status <> 'leased' then
    return pg_catalog.jsonb_build_object('mediaAssetId', v_asset.id, 'status', v_job.status);
  end if;

  if p_succeeded then
    if v_asset.status <> 'deleting'
      or v_asset.reference_count <> 0
      or exists(
        select 1 from public.media_references as reference
        where reference.media_asset_id = v_asset.id and reference.deleted_at is null
      )
      or exists(
        select 1 from public.decks as deck
        where deck.cover_asset_id = v_asset.id and deck.status <> 'deleted'
      )
      or exists(
        select 1 from public.audio_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.media_asset_id = v_asset.id
          and prompt.deleted_at is null and note.deleted_at is null
      )
      or exists(
        select 1 from public.pronunciation_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where prompt.reference_asset_id = v_asset.id
          and prompt.deleted_at is null and note.deleted_at is null
      )
      or exists(
        select 1 from public.drawing_reference_layers as layer
        join public.notes as note on note.id = layer.note_id
        where layer.media_asset_id = v_asset.id
          and layer.deleted_at is null and note.deleted_at is null
      )
      or exists(
        select 1 from public.media_publications as publication
        where publication.media_public_id = v_asset.public_id
      ) then
      raise exception using errcode = '55000', message = 'media asset is no longer deletable';
    end if;
    update public.media_assets as asset
    set status = 'deleted',
        storage_bucket = 'deleted',
        storage_path = 'deleted/' || asset.id::text,
        delete_after = null,
        deleted_at = pg_catalog.now(),
        version = asset.version + 1
    where asset.id = p_media_asset_id;
    update private.content_media_deletion_jobs as job
    set status = 'completed',
        lease_owner = null,
        lease_until = null,
        last_error = null,
        updated_at = pg_catalog.now(),
        completed_at = pg_catalog.now()
    where job.media_asset_id = p_media_asset_id;
    delete from private.content_mutation_receipts as receipt
    where receipt.resource_type = 'media_asset'
      and receipt.resource_id = p_media_asset_id
      and receipt.operation = 'media.register';
    return pg_catalog.jsonb_build_object('mediaAssetId', p_media_asset_id, 'status', 'completed');
  end if;

  v_delay_seconds := least(86400, greatest(60, v_job.attempt_count * v_job.attempt_count * 60));
  update private.content_media_deletion_jobs as job
  set status = 'queued',
      available_at = pg_catalog.now() + pg_catalog.make_interval(secs => v_delay_seconds),
      lease_owner = null,
      lease_until = null,
      last_error = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_error, '')), 1000), ''),
      updated_at = pg_catalog.now()
  where job.media_asset_id = p_media_asset_id;
  return pg_catalog.jsonb_build_object('mediaAssetId', p_media_asset_id, 'status', 'queued');
end;
$function$;

revoke all on function public.admin_claim_due_media_deletions(integer, uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_media_deletion(uuid, uuid, boolean, text)
from public, anon, authenticated, service_role;
grant execute on function public.admin_claim_due_media_deletions(integer, uuid, integer)
to service_role;
grant execute on function public.admin_complete_media_deletion(uuid, uuid, boolean, text)
to service_role;

comment on function public.admin_claim_due_media_deletions(integer, uuid, integer)
is 'Service-only bounded lease of due abandoned, quarantined, or unreferenced private Storage objects; excludes every active usage and frozen public media.';
comment on function public.admin_complete_media_deletion(uuid, uuid, boolean, text)
is 'Service-only idempotent completion or bounded-backoff retry of a physical Storage deletion.';

-- A deletion job is an irreversible fence for this asset identity. Even a
-- queued/expired job can have an old Storage request still in flight, so only
-- a fresh post-tombstone asset/public path may be reused. The media row lock
-- serializes this check with the claim transaction.
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
declare
  v_asset public.media_assets;
begin
  if p_media_asset_id is null or p_delta = 0 then
    return;
  end if;

  if p_delta > 0 then
    select asset.* into v_asset
    from public.media_assets as asset
    where asset.id = p_media_asset_id
    for update;
    if not found
      or v_asset.deleted_at is not null
      or v_asset.status not in ('ready', 'deleting')
      or exists(
        select 1
        from private.content_media_deletion_jobs as job
        where job.media_asset_id = p_media_asset_id
      ) then
      raise exception using errcode = '55000', message = 'media asset is unavailable';
    end if;

    update public.media_assets as asset
    set reference_count = asset.reference_count + p_delta,
        status = case
          when asset.status = 'deleting' then 'ready'::public.media_status
          else asset.status
        end,
        delete_after = null,
        version = asset.version + 1
    where asset.id = p_media_asset_id
      and asset.deleted_at is null
      and asset.status in ('ready', 'deleting');
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

-- Explicit media references use the same lease fence as specialized card
-- children. Raising from this AFTER trigger rolls the reference write back if
-- a deletion worker already owns the object, even when that lease has expired
-- but has not yet been reclaimed or completed.
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
  return new;
end;
$function$;

revoke all on function private.adjust_embedded_media_asset_usage(uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function private.adjust_media_reference_count()
from public, anon, authenticated, service_role;

-- During the seven-day grace period, explicit links and deck covers may revive
-- an unclaimed deleting asset. Their AFTER usage triggers enforce the durable
-- job fence, so a claimed asset still rolls the whole mutation back.
do $block$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_link_media(uuid,public.media_reference_type,uuid,public.media_reference_purpose,integer,text,uuid)'::regprocedure
  ) into strict v_definition;
  v_updated_definition := pg_catalog.replace(
    v_definition,
    'and asset.status = ''ready'' for update;',
    'and asset.status in (''ready'', ''deleting'') for update;'
  );
  if v_updated_definition = v_definition then
    raise exception 'current_link_media ready-state guard changed unexpectedly';
  end if;
  execute v_updated_definition;

  select pg_catalog.pg_get_functiondef(
    'private.content_update_deck_unchecked(uuid,bigint,jsonb,uuid)'::regprocedure
  ) into strict v_definition;
  v_updated_definition := pg_catalog.replace(
    v_definition,
    'and asset.kind = ''image'' and asset.status = ''ready''',
    'and asset.kind = ''image'' and asset.status in (''ready'', ''deleting'')'
  );
  if v_updated_definition = v_definition then
    raise exception 'content_update_deck_unchecked ready-state guard changed unexpectedly';
  end if;
  execute v_updated_definition;
end;
$block$;

-- Keep the inherited public custom-type creator aligned with the 20-template
-- domain contract without editing its applied source migration.
do $block$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.current_create_note_type(text,text,jsonb,jsonb,uuid)'::regprocedure
  ) into strict v_definition;
  v_updated_definition := pg_catalog.replace(
    v_definition,
    'not between 1 and 32',
    'not between 1 and 20'
  );
  if v_updated_definition = v_definition then
    raise exception 'current_create_note_type template limit rewrite did not match';
  end if;
  execute v_updated_definition;
end;
$block$;

-- PL/pgSQL FOR loops declare their own index variable. Remove the redundant
-- outer declaration from the two inherited bulk implementations so database
-- lint can enforce shadowed-variable warnings without suppressions.
do $block$
declare
  v_definition text;
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'private.content_bulk_tag_notes_unchecked(uuid,uuid[],bigint[],text[],text[],uuid)'::regprocedure,
    'private.content_bulk_move_notes_unchecked(uuid,uuid,uuid[],bigint[],uuid)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::oid) into strict v_definition;
    v_definition := pg_catalog.replace(
      v_definition,
      E'  v_index integer;\n',
      ''
    );
    execute v_definition;
  end loop;
end;
$block$;

commit;
