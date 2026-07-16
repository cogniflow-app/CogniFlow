begin;

-- Phase 02 content-authoring schema. Scheduling state is deliberately absent:
-- generated cards are durable content identities, not review records.

create type public.deck_visibility as enum ('private', 'unlisted', 'public');
create type public.deck_status as enum ('active', 'archived', 'moderated', 'deleted');
create type public.deck_license as enum ('all_rights_reserved', 'cc_by', 'cc_by_sa', 'cc0');
create type public.deck_member_role as enum (
  'owner', 'manager', 'editor', 'suggester', 'viewer', 'study_only', 'host', 'assignment_manager'
);
create type public.folder_status as enum ('active', 'deleted');
create type public.note_field_type as enum (
  'rich_text', 'plain_text', 'boolean', 'number', 'list', 'media'
);
create type public.card_kind as enum (
  'basic', 'basic_reversed', 'optional_reversed', 'bidirectional',
  'custom', 'typed_answer', 'cloze', 'image_occlusion',
  'multiple_choice', 'select_all', 'true_false', 'ordering',
  'list_answer', 'diagram', 'audio_prompt', 'pronunciation', 'drawing'
);
create type public.content_change_classification as enum (
  'cosmetic', 'source', 'prompt', 'answer', 'structural'
);
create type public.content_change_resolution as enum (
  'pending', 'preserve', 'relearn', 'reset'
);
create type public.media_kind as enum ('image', 'audio');
create type public.media_status as enum ('pending', 'ready', 'quarantined', 'deleting', 'deleted');
create type public.media_reference_type as enum (
  'deck', 'note', 'note_field', 'image_occlusion', 'diagram_hotspot',
  'audio_prompt', 'pronunciation', 'drawing_layer'
);
create type public.media_reference_purpose as enum (
  'cover', 'inline', 'attachment', 'prompt', 'answer', 'reference'
);
create type public.geometry_kind as enum ('rectangle', 'ellipse', 'polygon');
create type public.occlusion_mode as enum (
  'hide_one_reveal_others', 'hide_all_reveal_one'
);
create type public.diagram_prompt_direction as enum (
  'hotspot_to_label', 'label_to_hotspot', 'bidirectional'
);

create or replace function private.is_safe_template_source(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select p_value is not null
    and pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8')) <= 65536
    and p_value !~* '<[[:space:]]*script'
    and p_value !~* 'on[a-z]+[[:space:]]*='
    and p_value !~* 'javascript[[:space:]]*:'
    and p_value !~* 'data[[:space:]]*:[^,]*text/html'
    and p_value !~* '\{\{[[:space:]]*[^}]*(__proto__|prototype|constructor)';
$function$;

create or replace function private.is_safe_scoped_css(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select p_value is null or (
    pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8')) <= 32768
    and p_value !~* '@[[:space:]]*(import|namespace|charset)'
    and p_value !~* 'url[[:space:]]*\('
    and p_value !~* '(javascript|expression|behavior)[[:space:]]*[:(]'
    and p_value !~* '(^|[},])[[:space:]]*(html|body|:root|\*)[[:space:]]*[,{]'
    and p_value !~* ':global[[:space:]]*\('
  );
$function$;

create or replace function private.is_normalized_geometry(
  p_kind public.geometry_kind,
  p_geometry jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_point jsonb;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
begin
  if p_geometry is null or pg_catalog.jsonb_typeof(p_geometry) <> 'object' then
    return false;
  end if;

  if p_kind = 'rectangle' then
    v_x := (p_geometry ->> 'x')::numeric;
    v_y := (p_geometry ->> 'y')::numeric;
    v_width := (p_geometry ->> 'width')::numeric;
    v_height := (p_geometry ->> 'height')::numeric;
    return v_x between 0 and 1 and v_y between 0 and 1
      and v_width > 0 and v_height > 0
      and v_x + v_width <= 1 and v_y + v_height <= 1;
  elsif p_kind = 'ellipse' then
    v_x := (p_geometry ->> 'centerX')::numeric;
    v_y := (p_geometry ->> 'centerY')::numeric;
    v_width := (p_geometry ->> 'radiusX')::numeric;
    v_height := (p_geometry ->> 'radiusY')::numeric;
    return v_width > 0 and v_height > 0
      and v_x - v_width >= 0 and v_x + v_width <= 1
      and v_y - v_height >= 0 and v_y + v_height <= 1;
  elsif p_kind = 'polygon' then
    if pg_catalog.jsonb_typeof(p_geometry -> 'points') <> 'array'
      or pg_catalog.jsonb_array_length(p_geometry -> 'points') not between 3 and 64 then
      return false;
    end if;
    for v_point in select value from pg_catalog.jsonb_array_elements(p_geometry -> 'points') loop
      if pg_catalog.jsonb_typeof(v_point) <> 'object'
        or (v_point ->> 'x')::numeric not between 0 and 1
        or (v_point ->> 'y')::numeric not between 0 and 1 then
        return false;
      end if;
    end loop;
    return true;
  end if;
  return false;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$function$;

revoke all on function private.is_safe_template_source(text) from public, anon, authenticated, service_role;
revoke all on function private.is_safe_scoped_css(text) from public, anon, authenticated, service_role;
revoke all on function private.is_normalized_geometry(public.geometry_kind, jsonb) from public, anon, authenticated, service_role;

create table public.folders (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_account_id uuid not null references public.profiles (id) on delete restrict,
  parent_id uuid references public.folders (id) on delete restrict,
  name text not null,
  position integer not null default 0,
  version bigint not null default 1,
  status public.folder_status not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint folders_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120),
  constraint folders_position_nonnegative check (position >= 0),
  constraint folders_version_positive check (version > 0),
  constraint folders_no_self_parent check (parent_id is null or parent_id <> id),
  constraint folders_deletion_consistent check (
    (status = 'deleted' and deleted_at is not null) or (status <> 'deleted' and deleted_at is null)
  )
);

create unique index folders_owner_sibling_name_idx
on public.folders (owner_account_id, parent_id, pg_catalog.lower(pg_catalog.btrim(name)))
nulls not distinct where status = 'active';
create index folders_owner_tree_idx on public.folders (owner_account_id, parent_id, position, name)
where status = 'active';
create index folders_owner_updated_idx on public.folders (owner_account_id, updated_at desc);

create table public.note_types (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_account_id uuid references public.profiles (id) on delete restrict,
  code text not null,
  display_name text not null,
  card_kind public.card_kind not null,
  description text not null default '',
  schema_version integer not null default 1,
  version bigint not null default 1,
  is_system boolean not null default false,
  template_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint note_types_code_format check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint note_types_display_name_length check (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 100
  ),
  constraint note_types_description_length check (pg_catalog.char_length(description) <= 1000),
  constraint note_types_schema_version_positive check (schema_version > 0 and version > 0),
  constraint note_types_policy_object check (pg_catalog.jsonb_typeof(template_policy) = 'object'),
  constraint note_types_system_owner check (
    (is_system and owner_account_id is null) or (not is_system and owner_account_id is not null)
  )
);

create unique index note_types_system_code_idx on public.note_types (code)
where is_system and deleted_at is null;
create unique index note_types_owner_code_idx on public.note_types (owner_account_id, code)
where not is_system and deleted_at is null;
create index note_types_owner_updated_idx on public.note_types (owner_account_id, updated_at desc)
where not is_system and deleted_at is null;

create table public.note_type_fields (
  id uuid primary key default extensions.gen_random_uuid(),
  note_type_id uuid not null references public.note_types (id) on delete restrict,
  field_key text not null,
  label text not null,
  field_type public.note_field_type not null default 'rich_text',
  position integer not null,
  required boolean not null default false,
  language text,
  grading_settings jsonb not null default '{}'::jsonb,
  display_settings jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint note_type_fields_key_format check (field_key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  constraint note_type_fields_label_length check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 100),
  constraint note_type_fields_position_nonnegative check (position >= 0),
  constraint note_type_fields_language_length check (language is null or pg_catalog.char_length(language) between 2 and 35),
  constraint note_type_fields_settings_objects check (
    pg_catalog.jsonb_typeof(grading_settings) = 'object'
    and pg_catalog.jsonb_typeof(display_settings) = 'object'
  ),
  unique (note_type_id, field_key),
  unique (note_type_id, position)
);
create index note_type_fields_type_position_idx
on public.note_type_fields (note_type_id, position) where deleted_at is null;

create table public.card_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  note_type_id uuid not null references public.note_types (id) on delete restrict,
  template_key text not null,
  name text not null,
  ordinal integer not null,
  generation_condition text,
  front_template text not null,
  back_template text not null,
  styling_css text,
  answer_field_key text,
  card_kind public.card_kind not null,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint card_templates_key_format check (template_key ~ '^[a-z][a-z0-9_.:-]{0,79}$'),
  constraint card_templates_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100),
  constraint card_templates_ordinal_nonnegative check (ordinal >= 0),
  constraint card_templates_condition_length check (
    generation_condition is null or pg_catalog.char_length(generation_condition) <= 500
  ),
  constraint card_templates_safe_front check (private.is_safe_template_source(front_template)),
  constraint card_templates_safe_back check (private.is_safe_template_source(back_template)),
  constraint card_templates_safe_css check (private.is_safe_scoped_css(styling_css)),
  constraint card_templates_schema_version_positive check (schema_version > 0 and version > 0),
  unique (note_type_id, template_key),
  unique (note_type_id, ordinal)
);
create index card_templates_type_ordinal_idx
on public.card_templates (note_type_id, ordinal) where deleted_at is null;

create table public.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  public_id uuid not null default extensions.gen_random_uuid() unique,
  owner_account_id uuid not null references public.profiles (id) on delete restrict,
  sha256 text not null,
  kind public.media_kind not null,
  mime_type text not null,
  detected_mime_type text,
  byte_size bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  storage_bucket text not null default 'lumen-content-media',
  storage_path text not null,
  status public.media_status not null default 'pending',
  magic_verified boolean not null default false,
  reference_count integer not null default 0,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  delete_after timestamptz,
  deleted_at timestamptz,
  constraint media_assets_sha256_format check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint media_assets_mime_length check (
    pg_catalog.char_length(mime_type) between 3 and 100
    and (detected_mime_type is null or pg_catalog.char_length(detected_mime_type) between 3 and 100)
  ),
  constraint media_assets_size_positive check (byte_size > 0),
  constraint media_assets_dimensions check (
    (width is null or width between 1 and 32768)
    and (height is null or height between 1 and 32768)
    and (duration_ms is null or duration_ms between 0 and 86400000)
  ),
  constraint media_assets_path_length check (
    pg_catalog.char_length(storage_bucket) between 1 and 100
    and pg_catalog.char_length(storage_path) between 1 and 500
  ),
  constraint media_assets_reference_count_nonnegative check (reference_count >= 0),
  constraint media_assets_alt_length check (alt_text is null or pg_catalog.char_length(alt_text) <= 1000),
  constraint media_assets_metadata_object check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  constraint media_assets_ready_verified check (status <> 'ready' or magic_verified),
  unique (owner_account_id, sha256)
);
create unique index media_assets_bucket_path_idx on public.media_assets (storage_bucket, storage_path)
where deleted_at is null;
create index media_assets_owner_status_created_idx
on public.media_assets (owner_account_id, status, created_at desc);
create index media_assets_deletion_queue_idx on public.media_assets (delete_after)
where delete_after is not null and deleted_at is null;

create table public.decks (
  id uuid primary key default extensions.gen_random_uuid(),
  public_id uuid not null default extensions.gen_random_uuid() unique,
  owner_account_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  slug text not null,
  description_doc jsonb not null default '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
  description_plain text not null default '',
  visibility public.deck_visibility not null default 'private',
  license public.deck_license not null default 'all_rights_reserved',
  language_front text,
  language_back text,
  cover_asset_id uuid references public.media_assets (id) on delete set null,
  default_note_type_id uuid not null references public.note_types (id) on delete restrict,
  source_deck_id uuid references public.decks (id) on delete set null,
  fork_mode text,
  version bigint not null default 1,
  current_version bigint not null default 1,
  published_version bigint,
  content_hash text not null,
  note_count integer not null default 0,
  card_count integer not null default 0,
  status public.deck_status not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint decks_title_length check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 180),
  constraint decks_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'),
  constraint decks_description_doc_object check (
    pg_catalog.jsonb_typeof(description_doc) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(description_doc::text, 'UTF8')) <= 262144
  ),
  constraint decks_description_plain_length check (pg_catalog.char_length(description_plain) <= 20000),
  constraint decks_language_lengths check (
    (language_front is null or pg_catalog.char_length(language_front) between 2 and 35)
    and (language_back is null or pg_catalog.char_length(language_back) between 2 and 35)
  ),
  constraint decks_fork_mode check (fork_mode is null or fork_mode in ('independent', 'linked')),
  constraint decks_versions_positive check (
    version > 0 and current_version > 0 and (published_version is null or published_version > 0)
  ),
  constraint decks_content_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint decks_counts_nonnegative check (note_count >= 0 and card_count >= 0),
  constraint decks_publication_consistent check (
    (published_version is null and published_at is null)
    or (published_version is not null and published_at is not null and visibility in ('public', 'unlisted'))
  ),
  constraint decks_archive_consistent check (
    (status = 'archived' and archived_at is not null) or (status <> 'archived')
  ),
  constraint decks_delete_consistent check (
    (status = 'deleted' and deleted_at is not null) or (status <> 'deleted' and deleted_at is null)
  )
);
create unique index decks_owner_slug_idx on public.decks (owner_account_id, slug)
where deleted_at is null;
create index decks_owner_status_updated_idx on public.decks (owner_account_id, status, updated_at desc);
create index decks_public_slug_idx on public.decks (slug)
where published_version is not null and status = 'active';
create index decks_public_id_active_idx on public.decks (public_id)
where published_version is not null and status = 'active';
create index decks_source_idx on public.decks (source_deck_id) where source_deck_id is not null;

create table public.deck_members (
  id uuid primary key default extensions.gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  account_id uuid not null references public.profiles (id) on delete restrict,
  role public.deck_member_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  unique (deck_id, account_id)
);
create index deck_members_account_active_idx on public.deck_members (account_id, deck_id, role)
where revoked_at is null;
create index deck_members_deck_active_idx on public.deck_members (deck_id, account_id, role)
where revoked_at is null;

create table public.folder_items (
  id uuid primary key default extensions.gen_random_uuid(),
  folder_id uuid not null references public.folders (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint folder_items_position_nonnegative check (position >= 0)
);
create unique index folder_items_active_deck_idx on public.folder_items (deck_id)
where deleted_at is null;
create index folder_items_folder_position_idx on public.folder_items (folder_id, position, deck_id)
where deleted_at is null;

create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  parent_tag_id uuid references public.tags (id) on delete restrict,
  name text not null,
  normalized_name text not null,
  color text,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint tags_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100),
  constraint tags_normalized_length check (pg_catalog.char_length(normalized_name) between 1 and 100),
  constraint tags_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tags_no_self_parent check (parent_tag_id is null or parent_tag_id <> id)
);
create unique index tags_deck_normalized_name_idx on public.tags (deck_id, normalized_name)
where deleted_at is null;
create index tags_deck_parent_name_idx on public.tags (deck_id, parent_tag_id, name)
where deleted_at is null;

create table public.notes (
  id uuid primary key default extensions.gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  note_type_id uuid not null references public.note_types (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  version bigint not null default 1,
  sort_text text not null default '',
  content_hash text not null,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  card_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint notes_version_positive check (version > 0),
  constraint notes_sort_text_length check (pg_catalog.char_length(sort_text) <= 10000),
  constraint notes_content_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint notes_source_reference_length check (
    source_reference is null or pg_catalog.char_length(source_reference) <= 2000
  ),
  constraint notes_metadata_object check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  constraint notes_payload_object check (
    pg_catalog.jsonb_typeof(card_payload) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(card_payload::text, 'UTF8')) <= 1048576
  )
);
create index notes_deck_updated_idx on public.notes (deck_id, updated_at desc) where deleted_at is null;
create index notes_deck_type_idx on public.notes (deck_id, note_type_id, id) where deleted_at is null;
create index notes_deck_sort_idx on public.notes (deck_id, sort_text, id) where deleted_at is null;
create index notes_content_hash_idx on public.notes (deck_id, content_hash) where deleted_at is null;
create index notes_sort_trgm_idx on public.notes using gin (sort_text extensions.gin_trgm_ops)
where deleted_at is null;

create table public.note_field_values (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  field_id uuid not null references public.note_type_fields (id) on delete restrict,
  value_doc jsonb not null,
  plain_text text not null default '',
  normalized_text text not null default '',
  position integer not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint note_field_values_doc_object check (
    pg_catalog.jsonb_typeof(value_doc) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(value_doc::text, 'UTF8')) <= 262144
  ),
  constraint note_field_values_plain_length check (pg_catalog.char_length(plain_text) <= 100000),
  constraint note_field_values_normalized_length check (pg_catalog.char_length(normalized_text) <= 100000),
  constraint note_field_values_position_nonnegative check (position >= 0),
  unique (note_id, field_id)
);
create index note_field_values_note_position_idx
on public.note_field_values (note_id, position) where deleted_at is null;
create index note_field_values_plain_trgm_idx
on public.note_field_values using gin (plain_text extensions.gin_trgm_ops) where deleted_at is null;

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete restrict,
  tag_id uuid not null references public.tags (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  primary key (note_id, tag_id)
);
create index note_tags_tag_note_idx on public.note_tags (tag_id, note_id) where deleted_at is null;

create table public.cards (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  template_id uuid not null references public.card_templates (id) on delete restrict,
  ordinal integer not null,
  card_kind public.card_kind not null,
  generation_key text not null,
  content_version bigint not null,
  version bigint not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deactivated_at timestamptz,
  deleted_at timestamptz,
  constraint cards_ordinal_nonnegative check (ordinal >= 0),
  constraint cards_generation_key_format check (
    generation_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
  ),
  constraint cards_versions_positive check (content_version > 0 and version > 0),
  constraint cards_active_consistent check (
    (active and deactivated_at is null and deleted_at is null) or not active
  ),
  unique (note_id, template_id, generation_key)
);
create index cards_note_active_ordinal_idx on public.cards (note_id, active, ordinal, id);
create index cards_active_kind_idx on public.cards (card_kind, id) where active and deleted_at is null;

create table public.card_choices (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  content_doc jsonb not null,
  plain_text text not null default '',
  is_correct boolean not null,
  feedback_doc jsonb,
  position integer not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint card_choices_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint card_choices_content_object check (pg_catalog.jsonb_typeof(content_doc) = 'object'),
  constraint card_choices_feedback_object check (feedback_doc is null or pg_catalog.jsonb_typeof(feedback_doc) = 'object'),
  constraint card_choices_position_nonnegative check (position >= 0),
  unique (note_id, semantic_key)
);
create index card_choices_note_position_idx on public.card_choices (note_id, position) where deleted_at is null;

create table public.cloze_definitions (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  ranges jsonb not null,
  hint text,
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint cloze_definitions_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint cloze_definitions_ranges check (
    pg_catalog.jsonb_typeof(ranges) = 'array'
    and pg_catalog.jsonb_array_length(ranges) between 1 and 128
  ),
  constraint cloze_definitions_hint_length check (hint is null or pg_catalog.char_length(hint) <= 1000),
  unique (note_id, semantic_key)
);
create index cloze_definitions_note_position_idx
on public.cloze_definitions (note_id, position) where deleted_at is null;

create table public.image_occlusions (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  group_key text not null,
  geometry_kind public.geometry_kind not null,
  geometry jsonb not null,
  mode public.occlusion_mode not null default 'hide_one_reveal_others',
  label text not null,
  alt_text text,
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint image_occlusions_key_format check (
    semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'
    and group_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'
  ),
  constraint image_occlusions_geometry check (private.is_normalized_geometry(geometry_kind, geometry)),
  constraint image_occlusions_label_length check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 500),
  constraint image_occlusions_alt_length check (alt_text is null or pg_catalog.char_length(alt_text) <= 1000),
  unique (note_id, semantic_key)
);
create index image_occlusions_note_group_idx
on public.image_occlusions (note_id, group_key, position) where deleted_at is null;

create table public.diagram_hotspots (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  geometry_kind public.geometry_kind not null,
  geometry jsonb not null,
  label text not null,
  aliases text[] not null default '{}'::text[],
  prompt_direction public.diagram_prompt_direction not null default 'hotspot_to_label',
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint diagram_hotspots_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint diagram_hotspots_geometry check (private.is_normalized_geometry(geometry_kind, geometry)),
  constraint diagram_hotspots_label_length check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 500),
  constraint diagram_hotspots_alias_count check (pg_catalog.cardinality(aliases) <= 50),
  unique (note_id, semantic_key)
);
create index diagram_hotspots_note_position_idx
on public.diagram_hotspots (note_id, position) where deleted_at is null;

create table public.ordering_items (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  content_doc jsonb not null,
  plain_text text not null default '',
  position integer not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint ordering_items_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint ordering_items_content_object check (pg_catalog.jsonb_typeof(content_doc) = 'object'),
  constraint ordering_items_position_nonnegative check (position >= 0),
  unique (note_id, semantic_key)
);
create index ordering_items_note_position_idx
on public.ordering_items (note_id, position) where deleted_at is null;

create table public.list_answer_items (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  answer text not null,
  aliases text[] not null default '{}'::text[],
  required boolean not null default true,
  position integer not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint list_answer_items_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint list_answer_items_answer_length check (pg_catalog.char_length(pg_catalog.btrim(answer)) between 1 and 1000),
  constraint list_answer_items_alias_count check (pg_catalog.cardinality(aliases) <= 100),
  constraint list_answer_items_position_nonnegative check (position >= 0),
  unique (note_id, semantic_key)
);
create index list_answer_items_note_position_idx
on public.list_answer_items (note_id, position) where deleted_at is null;

create table public.audio_prompts (
  note_id uuid primary key references public.notes (id) on delete restrict,
  media_asset_id uuid references public.media_assets (id) on delete restrict,
  transcript text not null default '',
  answer text not null default '',
  tts_language text,
  playback_rate numeric(4,2) not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint audio_prompts_transcript_length check (pg_catalog.char_length(transcript) <= 20000),
  constraint audio_prompts_answer_length check (pg_catalog.char_length(answer) <= 20000),
  constraint audio_prompts_language_length check (tts_language is null or pg_catalog.char_length(tts_language) between 2 and 35),
  constraint audio_prompts_rate_range check (playback_rate between 0.25 and 4)
);

create table public.pronunciation_prompts (
  note_id uuid primary key references public.notes (id) on delete restrict,
  text text not null,
  language text not null,
  reference_asset_id uuid references public.media_assets (id) on delete restrict,
  tts_allowed boolean not null default true,
  fallback_answer text,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint pronunciation_prompts_text_length check (pg_catalog.char_length(pg_catalog.btrim(text)) between 1 and 20000),
  constraint pronunciation_prompts_language_length check (pg_catalog.char_length(language) between 2 and 35),
  constraint pronunciation_prompts_fallback_length check (fallback_answer is null or pg_catalog.char_length(fallback_answer) <= 20000)
);

create table public.drawing_reference_layers (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  media_asset_id uuid references public.media_assets (id) on delete restrict,
  strokes jsonb,
  opacity numeric(4,3) not null default 1,
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint drawing_layers_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint drawing_layers_strokes check (
    strokes is null or (
      pg_catalog.jsonb_typeof(strokes) in ('array', 'object')
      and pg_catalog.octet_length(pg_catalog.convert_to(strokes::text, 'UTF8')) <= 524288
    )
  ),
  constraint drawing_layers_opacity_range check (opacity between 0 and 1),
  constraint drawing_layers_position_nonnegative check (position >= 0),
  constraint drawing_layers_content_present check (media_asset_id is not null or strokes is not null),
  unique (note_id, semantic_key)
);
create index drawing_layers_note_position_idx
on public.drawing_reference_layers (note_id, position) where deleted_at is null;

create table public.media_references (
  id uuid primary key default extensions.gen_random_uuid(),
  media_asset_id uuid not null references public.media_assets (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  note_id uuid references public.notes (id) on delete restrict,
  field_value_id uuid references public.note_field_values (id) on delete restrict,
  reference_type public.media_reference_type not null,
  owner_id uuid not null,
  purpose public.media_reference_purpose not null,
  position integer not null default 0,
  alt_text text,
  version bigint not null default 1,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint media_references_position_nonnegative check (position >= 0),
  constraint media_references_alt_length check (alt_text is null or pg_catalog.char_length(alt_text) <= 1000),
  unique (media_asset_id, reference_type, owner_id, purpose, position)
);
create index media_references_asset_active_idx
on public.media_references (media_asset_id, deck_id) where deleted_at is null;
create index media_references_deck_active_idx
on public.media_references (deck_id, note_id, position) where deleted_at is null;

create table public.source_references (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  semantic_key text not null,
  citation_doc jsonb not null,
  title text,
  author text,
  url text,
  position integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint source_references_key_format check (semantic_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  constraint source_references_doc_object check (pg_catalog.jsonb_typeof(citation_doc) = 'object'),
  constraint source_references_lengths check (
    (title is null or pg_catalog.char_length(title) <= 1000)
    and (author is null or pg_catalog.char_length(author) <= 1000)
    and (url is null or pg_catalog.char_length(url) <= 2000)
  ),
  constraint source_references_safe_url check (url is null or url ~* '^https?://'),
  unique (note_id, semantic_key)
);
create index source_references_note_position_idx
on public.source_references (note_id, position) where deleted_at is null;

create table public.note_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  note_version bigint not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  change_kind text not null,
  note_snapshot jsonb not null,
  fields_snapshot jsonb not null,
  card_payload_snapshot jsonb not null,
  content_hash text not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint note_revisions_change_kind_length check (pg_catalog.char_length(change_kind) between 1 and 60),
  constraint note_revisions_snapshots check (
    pg_catalog.jsonb_typeof(note_snapshot) = 'object'
    and pg_catalog.jsonb_typeof(fields_snapshot) = 'array'
    and pg_catalog.jsonb_typeof(card_payload_snapshot) = 'object'
  ),
  constraint note_revisions_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
  unique (note_id, note_version),
  unique (created_by, idempotency_key)
);
create index note_revisions_note_time_idx on public.note_revisions (note_id, created_at desc);
create index note_revisions_deck_time_idx on public.note_revisions (deck_id, created_at desc);

create table public.deck_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  version_number bigint not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  change_kind text not null,
  summary text not null default '',
  deck_snapshot jsonb not null,
  content_snapshot jsonb not null,
  content_hash text not null,
  restored_from_version bigint,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint deck_versions_change_kind_length check (pg_catalog.char_length(change_kind) between 1 and 60),
  constraint deck_versions_summary_length check (pg_catalog.char_length(summary) <= 1000),
  constraint deck_versions_snapshots check (
    pg_catalog.jsonb_typeof(deck_snapshot) = 'object'
    and pg_catalog.jsonb_typeof(content_snapshot) = 'object'
  ),
  constraint deck_versions_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
  unique (deck_id, version_number),
  unique (created_by, idempotency_key)
);
create index deck_versions_deck_version_idx on public.deck_versions (deck_id, version_number desc);

create table public.content_change_impacts (
  id uuid primary key default extensions.gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  note_id uuid not null references public.notes (id) on delete restrict,
  from_note_version bigint not null,
  to_note_version bigint not null,
  classification public.content_change_classification not null,
  affected_generation_keys text[] not null default '{}'::text[],
  resolution public.content_change_resolution not null default 'pending',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  constraint content_impacts_version_order check (to_note_version > from_note_version),
  constraint content_impacts_key_count check (pg_catalog.cardinality(affected_generation_keys) <= 5000)
);
create index content_impacts_deck_pending_idx
on public.content_change_impacts (deck_id, created_at desc) where resolution = 'pending';
create index content_impacts_note_time_idx on public.content_change_impacts (note_id, created_at desc);

create table private.content_mutation_receipts (
  account_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key uuid not null,
  operation text not null,
  resource_type text not null,
  resource_id uuid,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, idempotency_key),
  constraint content_receipts_operation_length check (pg_catalog.char_length(operation) between 1 and 80),
  constraint content_receipts_resource_length check (pg_catalog.char_length(resource_type) between 1 and 80),
  constraint content_receipts_response_object check (pg_catalog.jsonb_typeof(response) = 'object')
);
create index content_receipts_created_idx on private.content_mutation_receipts (created_at);

-- Frozen, deliberately minimal publication tables. Draft content, membership,
-- revisions, owner UUIDs, hashes, and internal deck/note identifiers never enter
-- these rows.
create table public.deck_publications (
  public_id uuid primary key,
  slug text not null unique,
  visibility public.deck_visibility not null,
  title text not null,
  description_doc jsonb not null,
  description_plain text not null,
  creator_handle text not null,
  creator_display_name text not null,
  license public.deck_license not null,
  language_front text,
  language_back text,
  cover_media_public_id uuid,
  published_version bigint not null,
  card_count integer not null,
  card_kinds public.card_kind[] not null default '{}'::public.card_kind[],
  content_hash text not null,
  published_at timestamptz not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint deck_publications_visibility check (visibility in ('public', 'unlisted')),
  constraint deck_publications_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'),
  constraint deck_publications_counts check (published_version > 0 and card_count >= 0),
  constraint deck_publications_hash_format check (content_hash ~ '^[a-f0-9]{64}$')
);
create index deck_publications_public_updated_idx
on public.deck_publications (updated_at desc, public_id) where visibility = 'public';
create index deck_publications_title_trgm_idx
on public.deck_publications using gin (title extensions.gin_trgm_ops) where visibility = 'public';

create table public.card_publications (
  deck_public_id uuid not null references public.deck_publications (public_id) on delete cascade,
  card_public_id uuid not null,
  ordinal integer not null,
  card_kind public.card_kind not null,
  generation_key text not null,
  template_key text not null,
  front_template text not null,
  back_template text not null,
  styling_css text,
  field_values jsonb not null,
  card_payload jsonb not null,
  content_hash text not null,
  published_at timestamptz not null,
  primary key (deck_public_id, card_public_id),
  constraint card_publications_ordinal_nonnegative check (ordinal >= 0),
  constraint card_publications_safe_front check (private.is_safe_template_source(front_template)),
  constraint card_publications_safe_back check (private.is_safe_template_source(back_template)),
  constraint card_publications_safe_css check (private.is_safe_scoped_css(styling_css)),
  constraint card_publications_fields_object check (pg_catalog.jsonb_typeof(field_values) = 'object'),
  constraint card_publications_payload_object check (pg_catalog.jsonb_typeof(card_payload) = 'object'),
  constraint card_publications_hash_format check (content_hash ~ '^[a-f0-9]{64}$')
);
create index card_publications_deck_ordinal_idx
on public.card_publications (deck_public_id, ordinal, card_public_id);

create table public.media_publications (
  deck_public_id uuid not null references public.deck_publications (public_id) on delete cascade,
  media_public_id uuid not null,
  kind public.media_kind not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  storage_bucket text not null,
  storage_path text not null,
  alt_text text,
  published_at timestamptz not null,
  primary key (deck_public_id, media_public_id)
);
create index media_publications_media_idx on public.media_publications (media_public_id, deck_public_id);

-- Deterministic system note-type codes are the cross-layer API. IDs are
-- intentionally opaque; callers resolve the default with code = 'basic'.
insert into public.note_types (id, code, display_name, card_kind, description, is_system) values
  ('02000000-0000-4000-8000-000000000001', 'basic', 'Basic', 'basic', 'Front to back recall.', true),
  ('02000000-0000-4000-8000-000000000002', 'basic_reversed', 'Basic + reversed', 'basic_reversed', 'Forward and reverse siblings.', true),
  ('02000000-0000-4000-8000-000000000003', 'optional_reversed', 'Optional reversed', 'optional_reversed', 'Reverse sibling controlled by AddReverse.', true),
  ('02000000-0000-4000-8000-000000000004', 'bidirectional', 'Bidirectional', 'bidirectional', 'Two equally authoritative directions.', true),
  ('02000000-0000-4000-8000-000000000005', 'custom_multi_field', 'Custom multi-field', 'custom', 'Safe multi-field template foundation.', true),
  ('02000000-0000-4000-8000-000000000006', 'typed_answer', 'Typed answer', 'typed_answer', 'Typed recall with an answer marker.', true),
  ('02000000-0000-4000-8000-000000000007', 'cloze', 'Cloze', 'cloze', 'One sibling per semantic cloze group.', true),
  ('02000000-0000-4000-8000-000000000008', 'image_occlusion', 'Image occlusion', 'image_occlusion', 'Normalized vector masks grouped into siblings.', true),
  ('02000000-0000-4000-8000-000000000009', 'multiple_choice', 'Multiple choice', 'multiple_choice', 'One or more choices with one correct answer.', true),
  ('02000000-0000-4000-8000-000000000010', 'select_all', 'Select all', 'select_all', 'Multiple correct choices with partial-credit metadata.', true),
  ('02000000-0000-4000-8000-000000000011', 'true_false', 'True / false', 'true_false', 'A binary claim with explanation.', true),
  ('02000000-0000-4000-8000-000000000012', 'ordering', 'Ordering', 'ordering', 'A deterministic ordered sequence.', true),
  ('02000000-0000-4000-8000-000000000013', 'list_answer', 'List answer', 'list_answer', 'Required and optional accepted list items.', true),
  ('02000000-0000-4000-8000-000000000014', 'diagram', 'Diagram', 'diagram', 'Normalized hotspots with a nonvisual fallback.', true),
  ('02000000-0000-4000-8000-000000000015', 'audio_prompt', 'Audio prompt', 'audio_prompt', 'Uploaded audio or local TTS prompt.', true),
  ('02000000-0000-4000-8000-000000000016', 'pronunciation', 'Pronunciation', 'pronunciation', 'Reference audio/TTS and self-review fallback.', true),
  ('02000000-0000-4000-8000-000000000017', 'drawing', 'Drawing', 'drawing', 'Vector drawing response with typed fallback.', true);

insert into public.note_type_fields (
  note_type_id, field_key, label, field_type, position, required
)
select note_type.id, field.field_key, field.label, field.field_type::public.note_field_type,
  field.position, field.required
from (values
  ('basic','Front','Front','rich_text',0,true), ('basic','Back','Back','rich_text',1,true),
  ('basic_reversed','Front','Front','rich_text',0,true), ('basic_reversed','Back','Back','rich_text',1,true),
  ('optional_reversed','Front','Front','rich_text',0,true), ('optional_reversed','Back','Back','rich_text',1,true),
  ('optional_reversed','AddReverse','Add reverse','boolean',2,false),
  ('bidirectional','SideA','Side A','rich_text',0,true), ('bidirectional','SideB','Side B','rich_text',1,true),
  ('custom_multi_field','Prompt','Prompt','rich_text',0,true), ('custom_multi_field','Answer','Answer','rich_text',1,true),
  ('custom_multi_field','Extra','Extra','rich_text',2,false),
  ('typed_answer','Prompt','Prompt','rich_text',0,true), ('typed_answer','Answer','Answer','plain_text',1,true),
  ('cloze','Text','Text','rich_text',0,true), ('cloze','Extra','Extra','rich_text',1,false),
  ('image_occlusion','Prompt','Prompt','rich_text',0,false), ('image_occlusion','ImageAlt','Image description','plain_text',1,true),
  ('image_occlusion','Extra','Extra','rich_text',2,false),
  ('multiple_choice','Prompt','Prompt','rich_text',0,true), ('multiple_choice','Explanation','Explanation','rich_text',1,false),
  ('select_all','Prompt','Prompt','rich_text',0,true), ('select_all','Explanation','Explanation','rich_text',1,false),
  ('true_false','Statement','Statement','rich_text',0,true), ('true_false','Explanation','Explanation','rich_text',1,false),
  ('ordering','Prompt','Prompt','rich_text',0,true), ('ordering','Explanation','Explanation','rich_text',1,false),
  ('list_answer','Prompt','Prompt','rich_text',0,true), ('list_answer','Explanation','Explanation','rich_text',1,false),
  ('diagram','Prompt','Prompt','rich_text',0,true), ('diagram','ImageAlt','Image description','plain_text',1,true),
  ('diagram','Extra','Extra','rich_text',2,false),
  ('audio_prompt','Prompt','Prompt','rich_text',0,false), ('audio_prompt','Answer','Answer','rich_text',1,true),
  ('audio_prompt','Transcript','Transcript','plain_text',2,true),
  ('pronunciation','Text','Text','plain_text',0,true), ('pronunciation','Translation','Translation','rich_text',1,false),
  ('pronunciation','Transcript','Transcript','plain_text',2,false),
  ('drawing','Prompt','Prompt','rich_text',0,true), ('drawing','Answer','Reference answer','rich_text',1,false),
  ('drawing','AlternativeText','Typed/nonvisual alternative','plain_text',2,true)
) as field(type_code, field_key, label, field_type, position, required)
join public.note_types as note_type on note_type.code = field.type_code and note_type.is_system;

insert into public.card_templates (
  note_type_id, template_key, name, ordinal, generation_condition,
  front_template, back_template, answer_field_key, card_kind
)
select note_type.id, template.template_key, template.name, template.ordinal,
  template.generation_condition, template.front_template, template.back_template,
  template.answer_field_key, template.card_kind::public.card_kind
from (values
  ('basic','forward','Front → back',0,null,'{{Front}}','{{FrontSide}}{{Back}}','Back','basic'),
  ('basic_reversed','forward','Front → back',0,null,'{{Front}}','{{FrontSide}}{{Back}}','Back','basic_reversed'),
  ('basic_reversed','reverse','Back → front',1,null,'{{Back}}','{{FrontSide}}{{Front}}','Front','basic_reversed'),
  ('optional_reversed','forward','Front → back',0,null,'{{Front}}','{{FrontSide}}{{Back}}','Back','optional_reversed'),
  ('optional_reversed','reverse','Back → front',1,'nonempty:AddReverse','{{Back}}','{{FrontSide}}{{Front}}','Front','optional_reversed'),
  ('bidirectional','a_to_b','Side A → B',0,null,'{{SideA}}','{{FrontSide}}{{SideB}}','SideB','bidirectional'),
  ('bidirectional','b_to_a','Side B → A',1,null,'{{SideB}}','{{FrontSide}}{{SideA}}','SideA','bidirectional'),
  ('custom_multi_field','default','Prompt → answer',0,null,'{{Prompt}}','{{FrontSide}}{{Answer}}{{#if Extra}}{{Extra}}{{/if}}','Answer','custom'),
  ('typed_answer','typed','Typed answer',0,null,'{{Prompt}}{{type_answer:Answer}}','{{FrontSide}}{{Answer}}','Answer','typed_answer'),
  ('cloze','cloze','Cloze',0,'dynamic:clozes','{{cloze:Text}}','{{FrontSide}}{{Text}}{{#if Extra}}{{Extra}}{{/if}}',null,'cloze'),
  ('image_occlusion','occlusion','Image occlusion',0,'dynamic:occlusion_groups','{{ImageAlt}}','{{FrontSide}}{{#if Extra}}{{Extra}}{{/if}}',null,'image_occlusion'),
  ('multiple_choice','choice','Multiple choice',0,null,'{{Prompt}}','{{FrontSide}}{{Explanation}}',null,'multiple_choice'),
  ('select_all','select_all','Select all',0,null,'{{Prompt}}','{{FrontSide}}{{Explanation}}',null,'select_all'),
  ('true_false','true_false','True / false',0,null,'{{Statement}}','{{FrontSide}}{{Explanation}}',null,'true_false'),
  ('ordering','ordering','Ordering',0,null,'{{Prompt}}','{{FrontSide}}{{Explanation}}',null,'ordering'),
  ('list_answer','list','List answer',0,null,'{{Prompt}}','{{FrontSide}}{{Explanation}}',null,'list_answer'),
  ('diagram','hotspot','Diagram hotspot',0,'dynamic:hotspots','{{Prompt}}{{ImageAlt}}','{{FrontSide}}{{#if Extra}}{{Extra}}{{/if}}',null,'diagram'),
  ('audio_prompt','audio','Audio prompt',0,null,'{{Prompt}}{{media:audio}}','{{FrontSide}}{{Answer}}','Answer','audio_prompt'),
  ('pronunciation','pronunciation','Pronunciation',0,null,'{{Text}}{{media:reference_audio}}','{{FrontSide}}{{Translation}}',null,'pronunciation'),
  ('drawing','drawing','Drawing',0,null,'{{Prompt}}','{{FrontSide}}{{Answer}}{{AlternativeText}}',null,'drawing')
) as template(
  type_code, template_key, name, ordinal, generation_condition,
  front_template, back_template, answer_field_key, card_kind
)
join public.note_types as note_type on note_type.code = template.type_code and note_type.is_system;

-- RLS is enabled in the same transaction that creates each exposed table.
do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'folders','note_types','note_type_fields','card_templates','media_assets','decks',
    'deck_members','folder_items','tags','notes','note_field_values','note_tags','cards',
    'card_choices','cloze_definitions','image_occlusions','diagram_hotspots','ordering_items',
    'list_answer_items','audio_prompts','pronunciation_prompts','drawing_reference_layers',
    'media_references','source_references','note_revisions','deck_versions',
    'content_change_impacts','deck_publications','card_publications','media_publications'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$block$;

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role;

comment on table public.cards is
  'Stable generated content identities. Schedules are introduced only in Phase 03.';
comment on table public.deck_publications is
  'Frozen, safe published deck projection. Contains no draft, member, owner UUID, or revision data.';
comment on table public.card_publications is
  'Frozen published-card projection populated only by the authorized publish transaction.';
comment on table public.content_change_impacts is
  'Scheduling-neutral edit impact metadata for a future learner preserve/relearn/reset decision.';
comment on table private.content_mutation_receipts is
  'Private idempotency ledger for authenticated content RPCs.';

commit;
