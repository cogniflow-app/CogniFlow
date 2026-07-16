begin;

alter table public.decks
add column theme text not null default 'neutral',
add constraint decks_theme_allowed check (theme in ('neutral', 'ocean', 'forest', 'contrast'));

alter table public.deck_publications
add column theme text not null default 'neutral',
add constraint deck_publications_theme_allowed check (
  theme in ('neutral', 'ocean', 'forest', 'contrast')
);

alter table public.cards drop constraint cards_generation_key_format;
alter table public.cards add constraint cards_generation_key_format check (
  generation_key ~ '^[A-Za-z0-9%][A-Za-z0-9%_.:-]+$'
  and pg_catalog.char_length(generation_key) between 1 and 320
);

alter table public.card_publications
add column source_references jsonb not null default '[]'::jsonb,
add constraint card_publications_source_references_array check (
  pg_catalog.jsonb_typeof(source_references) = 'array'
);

create or replace function private.prevent_folder_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.parent_id is null then
    return new;
  end if;

  if not exists(
    select 1 from public.folders as parent
    where parent.id = new.parent_id
      and parent.owner_account_id = new.owner_account_id
      and parent.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'folder parent is unavailable';
  end if;

  if exists(
    with recursive ancestors(id, parent_id) as (
      select folder.id, folder.parent_id
      from public.folders as folder
      where folder.id = new.parent_id
      union all
      select folder.id, folder.parent_id
      from public.folders as folder
      join ancestors on ancestors.parent_id = folder.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514', message = 'folder cycle is not allowed';
  end if;
  return new;
end;
$function$;

create trigger folders_prevent_cycle
before insert or update of parent_id, owner_account_id on public.folders
for each row execute function private.prevent_folder_cycle();

create or replace function private.prevent_tag_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.parent_tag_id is null then
    return new;
  end if;
  if not exists(
    select 1 from public.tags as parent
    where parent.id = new.parent_tag_id
      and parent.deck_id = new.deck_id
      and parent.deleted_at is null
  ) then
    raise exception using errcode = '23514', message = 'tag parent is unavailable';
  end if;
  if exists(
    with recursive ancestors(id, parent_tag_id) as (
      select tag.id, tag.parent_tag_id from public.tags as tag where tag.id = new.parent_tag_id
      union all
      select tag.id, tag.parent_tag_id
      from public.tags as tag join ancestors on ancestors.parent_tag_id = tag.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514', message = 'tag cycle is not allowed';
  end if;
  return new;
end;
$function$;

create trigger tags_prevent_cycle
before insert or update of parent_tag_id, deck_id on public.tags
for each row execute function private.prevent_tag_cycle();

revoke all on function private.prevent_folder_cycle() from public, anon, authenticated, service_role;
revoke all on function private.prevent_tag_cycle() from public, anon, authenticated, service_role;

-- Attach the shared timestamp trigger only to mutable rows with updated_at.
do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'folders','note_types','note_type_fields','card_templates','media_assets','decks',
    'deck_members','folder_items','tags','notes','note_field_values','cards','card_choices',
    'cloze_definitions','image_occlusions','diagram_hotspots','ordering_items',
    'list_answer_items','audio_prompts','pronunciation_prompts','drawing_reference_layers',
    'media_references','source_references'
  ] loop
    execute pg_catalog.format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      v_table || '_set_updated_at', v_table
    );
  end loop;
end;
$block$;

create trigger note_revisions_append_only
before update or delete on public.note_revisions
for each row execute function private.reject_append_only_mutation();
create trigger deck_versions_append_only
before update or delete on public.deck_versions
for each row execute function private.reject_append_only_mutation();

create or replace function private.has_current_content_context(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_account_id is not null
    and p_account_id = auth.uid()
    and not private.is_managed_auth_session_locked(p_account_id)
    and not private.is_current_auth_session_revoked(p_account_id)
    and exists(
      select 1 from public.profiles as profile
      where profile.id = p_account_id
        and profile.auth_subject_id = p_account_id
        and profile.account_status in ('active', 'pending_deletion')
    );
$function$;

create or replace function private.can_view_deck(p_account_id uuid, p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_current_content_context(p_account_id)
    and exists(
      select 1
      from public.decks as deck
      where deck.id = p_deck_id
        and deck.status <> 'deleted'
        and (
          deck.owner_account_id = p_account_id
          or exists(
            select 1 from public.deck_members as member
            where member.deck_id = deck.id
              and member.account_id = p_account_id
              and member.revoked_at is null
          )
        )
    );
$function$;

create or replace function private.can_edit_deck(p_account_id uuid, p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_current_content_context(p_account_id) and exists(
    select 1 from public.decks as deck
    where deck.id = p_deck_id
      and deck.status <> 'deleted'
      and (
        deck.owner_account_id = p_account_id
        or exists(
          select 1 from public.deck_members as member
          where member.deck_id = deck.id
            and member.account_id = p_account_id
            and member.role in ('owner', 'manager', 'editor')
            and member.revoked_at is null
        )
      )
  );
$function$;

create or replace function private.can_manage_deck(p_account_id uuid, p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_current_content_context(p_account_id) and exists(
    select 1 from public.decks as deck
    where deck.id = p_deck_id
      and deck.status <> 'deleted'
      and (
        deck.owner_account_id = p_account_id
        or exists(
          select 1 from public.deck_members as member
          where member.deck_id = deck.id
            and member.account_id = p_account_id
            and member.role in ('owner', 'manager')
            and member.revoked_at is null
        )
      )
  );
$function$;

create or replace function private.can_host_deck(p_account_id uuid, p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_current_content_context(p_account_id) and exists(
    select 1 from public.decks as deck
    where deck.id = p_deck_id
      and deck.status = 'active'
      and (
        deck.owner_account_id = p_account_id
        or exists(
          select 1 from public.deck_members as member
          where member.deck_id = deck.id
            and member.account_id = p_account_id
            and member.role in ('owner', 'manager', 'host')
            and member.revoked_at is null
        )
      )
  );
$function$;

create or replace function private.can_study_deck(
  p_account_id uuid,
  p_learner_profile_id uuid,
  p_deck_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_view_deck(p_account_id, p_deck_id)
    and private.can_access_learner_profile(p_account_id, p_learner_profile_id, 'study');
$function$;

create or replace function private.can_view_note_type(p_account_id uuid, p_note_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1 from public.note_types as note_type
    where note_type.id = p_note_type_id
      and note_type.deleted_at is null
      and (
        note_type.is_system
        or (
          private.has_current_content_context(p_account_id)
          and note_type.owner_account_id = p_account_id
        )
        or exists(
          select 1 from public.notes as note
          where note.note_type_id = note_type.id
            and note.deleted_at is null
            and private.can_view_deck(p_account_id, note.deck_id)
        )
      )
  );
$function$;

revoke all on function private.has_current_content_context(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_view_deck(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_edit_deck(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_manage_deck(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_host_deck(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_study_deck(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_view_note_type(uuid, uuid) from public, anon, authenticated, service_role;

-- Read-only RLS. All writes flow through actor-derived RPCs below.
create policy folders_select_owner on public.folders for select to authenticated using (
  owner_account_id = (select auth.uid())
  and private.has_current_content_context((select auth.uid()))
);
create policy note_types_select_authorized on public.note_types for select to authenticated using (
  private.can_view_note_type((select auth.uid()), id)
);
create policy note_type_fields_select_authorized on public.note_type_fields for select to authenticated using (
  private.can_view_note_type((select auth.uid()), note_type_id)
);
create policy card_templates_select_authorized on public.card_templates for select to authenticated using (
  private.can_view_note_type((select auth.uid()), note_type_id)
);
create policy media_assets_select_owner on public.media_assets for select to authenticated using (
  owner_account_id = (select auth.uid())
  and private.has_current_content_context((select auth.uid()))
);
create policy decks_select_authorized on public.decks for select to authenticated using (
  private.can_view_deck((select auth.uid()), id)
);
create policy deck_members_select_authorized on public.deck_members for select to authenticated using (
  private.has_current_content_context((select auth.uid()))
  and (
    account_id = (select auth.uid())
    or private.can_manage_deck((select auth.uid()), deck_id)
  )
);
create policy folder_items_select_owner on public.folder_items for select to authenticated using (
  exists(
    select 1 from public.folders as folder
    where folder.id = folder_id
      and folder.owner_account_id = (select auth.uid())
      and private.has_current_content_context((select auth.uid()))
  )
);
create policy tags_select_deck_viewer on public.tags for select to authenticated using (
  private.can_view_deck((select auth.uid()), deck_id)
);
create policy notes_select_deck_viewer on public.notes for select to authenticated using (
  private.can_view_deck((select auth.uid()), deck_id)
);
create policy note_field_values_select_deck_viewer on public.note_field_values for select to authenticated using (
  exists(
    select 1 from public.notes as note
    where note.id = note_id and private.can_view_deck((select auth.uid()), note.deck_id)
  )
);
create policy note_tags_select_deck_viewer on public.note_tags for select to authenticated using (
  exists(
    select 1 from public.notes as note
    where note.id = note_id and private.can_view_deck((select auth.uid()), note.deck_id)
  )
);
create policy cards_select_deck_viewer on public.cards for select to authenticated using (
  exists(
    select 1 from public.notes as note
    where note.id = note_id and private.can_view_deck((select auth.uid()), note.deck_id)
  )
);

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'card_choices','cloze_definitions','image_occlusions','diagram_hotspots',
    'ordering_items','list_answer_items','audio_prompts','pronunciation_prompts',
    'drawing_reference_layers','source_references'
  ] loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.notes as note where note.id = note_id and private.can_view_deck((select auth.uid()), note.deck_id)))',
      v_table || '_select_deck_viewer', v_table
    );
  end loop;
end;
$block$;

create policy media_references_select_deck_viewer on public.media_references for select to authenticated using (
  private.can_view_deck((select auth.uid()), deck_id)
);
create policy note_revisions_select_editor on public.note_revisions for select to authenticated using (
  private.can_edit_deck((select auth.uid()), deck_id)
);
create policy deck_versions_select_editor on public.deck_versions for select to authenticated using (
  private.can_edit_deck((select auth.uid()), deck_id)
);
create policy content_change_impacts_select_editor on public.content_change_impacts for select to authenticated using (
  private.can_edit_deck((select auth.uid()), deck_id)
);

create policy deck_publications_select_public
on public.deck_publications for select to anon, authenticated using (visibility = 'public');
create policy card_publications_select_public
on public.card_publications for select to anon, authenticated using (
  exists(
    select 1 from public.deck_publications as publication
    where publication.public_id = deck_public_id and publication.visibility = 'public'
  )
);
create policy media_publications_select_public
on public.media_publications for select to anon, authenticated using (
  exists(
    select 1 from public.deck_publications as publication
    where publication.public_id = deck_public_id and publication.visibility = 'public'
  )
);

grant execute on function private.has_current_content_context(uuid) to authenticated;
grant execute on function private.can_view_deck(uuid, uuid) to authenticated;
grant execute on function private.can_edit_deck(uuid, uuid) to authenticated;
grant execute on function private.can_manage_deck(uuid, uuid) to authenticated;
grant execute on function private.can_host_deck(uuid, uuid) to authenticated;
grant execute on function private.can_study_deck(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_view_note_type(uuid, uuid) to authenticated;

grant select on public.folders to authenticated;
grant select on public.note_types to authenticated;
grant select on public.note_type_fields to authenticated;
grant select on public.card_templates to authenticated;
grant select on public.decks to authenticated;
grant select on public.deck_members to authenticated;
grant select on public.folder_items to authenticated;
grant select on public.tags to authenticated;
grant select on public.notes to authenticated;
grant select on public.note_field_values to authenticated;
grant select on public.note_tags to authenticated;
grant select on public.cards to authenticated;
grant select on public.card_choices to authenticated;
grant select on public.cloze_definitions to authenticated;
grant select on public.image_occlusions to authenticated;
grant select on public.diagram_hotspots to authenticated;
grant select on public.ordering_items to authenticated;
grant select on public.list_answer_items to authenticated;
grant select on public.audio_prompts to authenticated;
grant select on public.pronunciation_prompts to authenticated;
grant select on public.drawing_reference_layers to authenticated;
grant select on public.media_references to authenticated;
grant select on public.source_references to authenticated;
grant select on public.note_revisions to authenticated;
grant select on public.deck_versions to authenticated;
grant select on public.content_change_impacts to authenticated;
grant select on public.media_assets to authenticated;
grant select on public.deck_publications, public.card_publications, public.media_publications to anon, authenticated;

-- The schema migration's deny-by-default pass also touches the preserved
-- Phase 01 tables. Reapply their exact, previously established read surface;
-- no Phase 01 mutation or service-role table privilege is broadened.
grant select on public.profiles to authenticated;
grant select on public.privacy_preferences to authenticated;
grant select on public.account_capabilities to authenticated;
grant select on public.learner_profiles to authenticated;
grant select on public.learner_profile_access to authenticated;
grant select on public.guardian_relationships to authenticated;
grant select on public.consent_records to authenticated;
grant select on public.devices to authenticated;
grant select (
  id, account_id, learner_profile_id, device_id, expires_at, created_at,
  last_used_at, revoked_at, revoke_reason, idempotency_key
) on public.profile_sessions to authenticated;
grant select on public.privacy_requests to authenticated;
grant select on public.data_export_jobs to authenticated;
grant select on public.deletion_jobs to authenticated;

create view public.published_decks
with (security_invoker = true, security_barrier = true)
as
select
  public_id, slug, title, description_doc, description_plain,
  creator_handle, creator_display_name, license, theme, language_front,
  language_back, cover_media_public_id, published_version, card_count,
  card_kinds, content_hash, published_at, updated_at
from public.deck_publications
where visibility = 'public';

create view public.published_cards
with (security_invoker = true, security_barrier = true)
as
select
  card.deck_public_id, card.card_public_id, card.ordinal, card.card_kind,
  card.generation_key, card.template_key, card.front_template,
  card.back_template, card.styling_css, card.field_values,
  card.card_payload, card.source_references, card.content_hash, card.published_at
from public.card_publications as card
join public.deck_publications as deck on deck.public_id = card.deck_public_id
where deck.visibility = 'public';

create view public.published_media
with (security_invoker = true, security_barrier = true)
as
select
  media.deck_public_id, media.media_public_id, media.kind, media.mime_type,
  media.byte_size, media.width, media.height, media.duration_ms,
  media.storage_bucket, media.storage_path, media.alt_text, media.published_at
from public.media_publications as media
join public.deck_publications as deck on deck.public_id = media.deck_public_id
where deck.visibility = 'public';

grant select on public.published_decks, public.published_cards, public.published_media to anon, authenticated;

-- Utility functions used only by the hardened public wrappers below.
create or replace function private.assert_active_content_actor()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
begin
  if not exists(
    select 1 from public.profiles as profile
    where profile.id = v_account_id
      and profile.account_status = 'active'
      and profile.onboarding_completed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'active content account is required';
  end if;
  return v_account_id;
end;
$function$;

create or replace function private.content_hash(p_value jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value::text, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

create or replace function private.slugify(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(
    nullif(
      pg_catalog.btrim(pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.btrim(p_value)), '[^a-z0-9]+', '-', 'g'
      ), '-'),
      ''
    ),
    'deck'
  );
$function$;

create or replace function private.raise_content_conflict(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_version bigint,
  p_actual_version bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '40001',
    message = 'content version conflict',
    detail = pg_catalog.jsonb_build_object(
      'code', 'version_conflict',
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'expectedVersion', p_expected_version,
      'actualVersion', p_actual_version
    )::text;
end;
$function$;

create or replace function private.get_content_receipt(
  p_account_id uuid,
  p_idempotency_key uuid,
  p_operation text
)
returns private.content_mutation_receipts
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_receipt private.content_mutation_receipts;
begin
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  select * into v_receipt
  from private.content_mutation_receipts as receipt
  where receipt.account_id = p_account_id
    and receipt.idempotency_key = p_idempotency_key;
  if found and v_receipt.operation <> p_operation then
    raise exception using errcode = '22023', message = 'content mutation replay does not match';
  end if;
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
language sql
volatile
security definer
set search_path = ''
as $function$
  insert into private.content_mutation_receipts (
    account_id, idempotency_key, operation, resource_type, resource_id, response
  ) values (
    p_account_id, p_idempotency_key, p_operation, p_resource_type, p_resource_id, p_response
  )
  on conflict (account_id, idempotency_key) do nothing;
$function$;

revoke all on function private.assert_active_content_actor() from public, anon, authenticated, service_role;
revoke all on function private.content_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.slugify(text) from public, anon, authenticated, service_role;
revoke all on function private.raise_content_conflict(text, uuid, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function private.get_content_receipt(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.record_content_receipt(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function private.record_note_revision(
  p_note_id uuid,
  p_actor_account_id uuid,
  p_change_kind text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_note public.notes;
  v_revision_id uuid;
begin
  select * into strict v_note from public.notes as note where note.id = p_note_id;
  insert into public.note_revisions (
    note_id, deck_id, note_version, created_by, change_kind,
    note_snapshot, fields_snapshot, card_payload_snapshot,
    content_hash, idempotency_key
  ) values (
    v_note.id,
    v_note.deck_id,
    v_note.version,
    p_actor_account_id,
    p_change_kind,
    pg_catalog.jsonb_build_object(
      'id', v_note.id,
      'noteTypeId', v_note.note_type_id,
      'version', v_note.version,
      'sortText', v_note.sort_text,
      'sourceReference', v_note.source_reference,
      'metadata', v_note.metadata,
      'createdAt', v_note.created_at,
      'deletedAt', v_note.deleted_at
    ),
    coalesce((
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
      where field_value.note_id = v_note.id and field_value.deleted_at is null
    ), '[]'::jsonb),
    v_note.card_payload,
    v_note.content_hash,
    p_idempotency_key
  ) returning id into v_revision_id;
  return v_revision_id;
end;
$function$;

create or replace function private.capture_deck_content(p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
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
    ), '[]'::jsonb)
  );
$function$;

create or replace function private.create_deck_version(
  p_deck_id uuid,
  p_actor_account_id uuid,
  p_change_kind text,
  p_summary text,
  p_idempotency_key uuid,
  p_restored_from_version bigint default null
)
returns public.deck_versions
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_deck public.decks;
  v_content jsonb;
  v_version public.deck_versions;
begin
  select * into strict v_deck from public.decks as deck where deck.id = p_deck_id;
  v_content := private.capture_deck_content(p_deck_id);
  insert into public.deck_versions (
    deck_id, version_number, created_by, change_kind, summary,
    deck_snapshot, content_snapshot, content_hash,
    restored_from_version, idempotency_key
  ) values (
    v_deck.id,
    v_deck.current_version,
    p_actor_account_id,
    p_change_kind,
    pg_catalog.left(coalesce(p_summary, ''), 1000),
    pg_catalog.jsonb_build_object(
      'title', v_deck.title,
      'slug', v_deck.slug,
      'descriptionDoc', v_deck.description_doc,
      'descriptionPlain', v_deck.description_plain,
      'license', v_deck.license,
      'theme', v_deck.theme,
      'languageFront', v_deck.language_front,
      'languageBack', v_deck.language_back,
      'coverAssetId', v_deck.cover_asset_id,
      'defaultNoteTypeId', v_deck.default_note_type_id,
      'contentVersion', v_deck.current_version
    ),
    v_content,
    private.content_hash(v_content),
    p_restored_from_version,
    p_idempotency_key
  ) returning * into v_version;
  return v_version;
end;
$function$;

create or replace function private.bump_deck_content_version(
  p_deck_id uuid,
  p_actor_account_id uuid,
  p_change_kind text,
  p_summary text,
  p_idempotency_key uuid,
  p_restored_from_version bigint default null
)
returns public.decks
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_content jsonb;
  v_deck public.decks;
begin
  v_content := private.capture_deck_content(p_deck_id);
  update public.decks as deck
  set version = deck.version + 1,
      current_version = deck.current_version + 1,
      note_count = (
        select pg_catalog.count(*)::integer from public.notes as note
        where note.deck_id = p_deck_id and note.deleted_at is null
      ),
      card_count = (
        select pg_catalog.count(*)::integer
        from public.cards as card
        join public.notes as note on note.id = card.note_id
        where note.deck_id = p_deck_id
          and note.deleted_at is null
          and card.active and card.deleted_at is null
      ),
      content_hash = private.content_hash(v_content)
  where deck.id = p_deck_id
  returning * into v_deck;
  perform private.create_deck_version(
    p_deck_id, p_actor_account_id, p_change_kind, p_summary,
    p_idempotency_key, p_restored_from_version
  );
  return v_deck;
end;
$function$;

create or replace function private.persist_specialized_card_payload(
  p_note_id uuid,
  p_note_type_code text,
  p_payload jsonb,
  p_actor_account_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_shape jsonb;
  v_kind public.geometry_kind;
  v_content jsonb;
  v_plain text;
  v_position integer;
  v_correct_count integer;
  v_item_count integer;
  v_asset_id uuid;
  v_stroke jsonb;
  v_point jsonb;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text, 'UTF8')) > 1048576 then
    raise exception using errcode = '22023', message = 'card payload must be a bounded object';
  end if;

  update public.card_choices set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.cloze_definitions set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.image_occlusions set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.diagram_hotspots set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.ordering_items set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.list_answer_items set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.audio_prompts set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.pronunciation_prompts set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.drawing_reference_layers set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;
  update public.source_references set deleted_at = pg_catalog.now() where note_id = p_note_id and deleted_at is null;

  if p_payload ? 'sourceReferences' then
    if pg_catalog.jsonb_typeof(p_payload -> 'sourceReferences') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'sourceReferences') > 100 then
      raise exception using errcode = '22023', message = 'source references must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'sourceReferences') loop
      insert into public.source_references (
        note_id, semantic_key, citation_doc, title, author, url, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey',
        coalesce(v_item -> 'citationDoc', '{}'::jsonb),
        v_item ->> 'title', v_item ->> 'author', v_item ->> 'url',
        coalesce((v_item ->> 'position')::integer, v_position), null
      ) on conflict (note_id, semantic_key) do update
      set citation_doc = excluded.citation_doc,
          title = excluded.title,
          author = excluded.author,
          url = excluded.url,
          position = excluded.position,
          version = public.source_references.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;

  if p_payload ? 'choices' then
    if pg_catalog.jsonb_typeof(p_payload -> 'choices') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'choices') > 100 then
      raise exception using errcode = '22023', message = 'choices must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'choices') loop
      v_content := v_item -> 'content';
      if pg_catalog.jsonb_typeof(v_content) = 'string' then
        v_plain := v_content #>> '{}';
        v_content := pg_catalog.jsonb_build_object(
          'schemaVersion', 1, 'type', 'doc', 'content',
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('type', 'paragraph', 'text', v_plain))
        );
      else
        v_plain := coalesce(v_item ->> 'plainText', v_content ->> 'plainText', '');
      end if;
      insert into public.card_choices (
        note_id, semantic_key, content_doc, plain_text, is_correct,
        feedback_doc, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_content, v_plain,
        coalesce((v_item ->> 'isCorrect')::boolean, false),
        v_item -> 'feedback', coalesce((v_item ->> 'position')::integer, v_position), null
      )
      on conflict (note_id, semantic_key) do update
      set content_doc = excluded.content_doc,
          plain_text = excluded.plain_text,
          is_correct = excluded.is_correct,
          feedback_doc = excluded.feedback_doc,
          position = excluded.position,
          version = public.card_choices.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;

  if p_note_type_code in ('multiple_choice', 'select_all') then
    select pg_catalog.count(*)::integer,
      pg_catalog.count(*) filter (where is_correct)::integer
    into v_item_count, v_correct_count
    from public.card_choices where note_id = p_note_id and deleted_at is null;
    if v_item_count < 2
      or v_correct_count < 1
      or (p_note_type_code = 'multiple_choice' and v_correct_count <> 1) then
      raise exception using errcode = '22023', message = 'choice correctness configuration is invalid';
    end if;
  end if;

  if p_payload ? 'clozes' then
    if pg_catalog.jsonb_typeof(p_payload -> 'clozes') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'clozes') > 256 then
      raise exception using errcode = '22023', message = 'clozes must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'clozes') loop
      if pg_catalog.jsonb_typeof(v_item -> 'ranges') <> 'array'
        or pg_catalog.jsonb_array_length(v_item -> 'ranges') not between 1 and 128
        or exists(
          select 1 from pg_catalog.jsonb_array_elements(v_item -> 'ranges') as range_value
          where pg_catalog.jsonb_typeof(range_value) <> 'object'
            or (range_value ->> 'from')::integer < 0
            or (range_value ->> 'to')::integer <= (range_value ->> 'from')::integer
        ) then
        raise exception using errcode = '22023', message = 'cloze ranges are invalid';
      end if;
      insert into public.cloze_definitions (
        note_id, semantic_key, ranges, hint, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_item -> 'ranges',
        v_item ->> 'hint', v_position, null
      ) on conflict (note_id, semantic_key) do update
      set ranges = excluded.ranges,
          hint = excluded.hint,
          position = excluded.position,
          version = public.cloze_definitions.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
  if p_note_type_code = 'cloze' and not exists(
    select 1 from public.cloze_definitions where note_id = p_note_id and deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'cloze notes require at least one semantic group';
  end if;

  if p_payload ? 'occlusions' then
    if pg_catalog.jsonb_typeof(p_payload -> 'occlusions') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'occlusions') > 1000 then
      raise exception using errcode = '22023', message = 'occlusions must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'occlusions') loop
      v_shape := v_item -> 'shape';
      v_kind := case coalesce(v_shape ->> 'type', v_shape ->> 'kind')
        when 'rect' then 'rectangle'::public.geometry_kind
        when 'rectangle' then 'rectangle'::public.geometry_kind
        when 'ellipse' then 'ellipse'::public.geometry_kind
        when 'polygon' then 'polygon'::public.geometry_kind
        else null
      end;
      if v_kind is null or not private.is_normalized_geometry(v_kind, v_shape) then
        raise exception using errcode = '22023', message = 'occlusion geometry is invalid';
      end if;
      insert into public.image_occlusions (
        note_id, semantic_key, group_key, geometry_kind, geometry,
        mode, label, alt_text, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', coalesce(v_item ->> 'groupKey', v_item ->> 'semanticKey'),
        v_kind, v_shape,
        coalesce(
          (coalesce(p_payload ->> 'mode', p_payload ->> 'occlusionMode'))::public.occlusion_mode,
          'hide_one_reveal_others'
        ),
        coalesce(v_item ->> 'label', 'Region ' || (v_position + 1)::text),
        v_item ->> 'altText', v_position, null
      ) on conflict (note_id, semantic_key) do update
      set group_key = excluded.group_key,
          geometry_kind = excluded.geometry_kind,
          geometry = excluded.geometry,
          mode = excluded.mode,
          label = excluded.label,
          alt_text = excluded.alt_text,
          position = excluded.position,
          version = public.image_occlusions.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
  if p_note_type_code = 'image_occlusion' and not exists(
    select 1 from public.image_occlusions where note_id = p_note_id and deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'image occlusion notes require at least one mask';
  end if;

  if p_payload ? 'hotspots' then
    if pg_catalog.jsonb_typeof(p_payload -> 'hotspots') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'hotspots') > 1000 then
      raise exception using errcode = '22023', message = 'hotspots must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'hotspots') loop
      v_shape := v_item -> 'shape';
      v_kind := case coalesce(v_shape ->> 'type', v_shape ->> 'kind')
        when 'rect' then 'rectangle'::public.geometry_kind
        when 'rectangle' then 'rectangle'::public.geometry_kind
        when 'ellipse' then 'ellipse'::public.geometry_kind
        when 'polygon' then 'polygon'::public.geometry_kind
        else null
      end;
      if v_kind is null or not private.is_normalized_geometry(v_kind, v_shape) then
        raise exception using errcode = '22023', message = 'hotspot geometry is invalid';
      end if;
      insert into public.diagram_hotspots (
        note_id, semantic_key, geometry_kind, geometry, label,
        aliases, prompt_direction, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_kind, v_shape,
        v_item ->> 'label',
        array(select pg_catalog.jsonb_array_elements_text(coalesce(v_item -> 'aliases', '[]'::jsonb))),
        case coalesce(v_item ->> 'promptDirection', 'region_to_label')
          when 'region_to_label' then 'hotspot_to_label'::public.diagram_prompt_direction
          when 'hotspot_to_label' then 'hotspot_to_label'::public.diagram_prompt_direction
          when 'label_to_region' then 'label_to_hotspot'::public.diagram_prompt_direction
          when 'label_to_hotspot' then 'label_to_hotspot'::public.diagram_prompt_direction
          when 'both' then 'bidirectional'::public.diagram_prompt_direction
          when 'bidirectional' then 'bidirectional'::public.diagram_prompt_direction
          else null
        end,
        v_position, null
      ) on conflict (note_id, semantic_key) do update
      set geometry_kind = excluded.geometry_kind,
          geometry = excluded.geometry,
          label = excluded.label,
          aliases = excluded.aliases,
          prompt_direction = excluded.prompt_direction,
          position = excluded.position,
          version = public.diagram_hotspots.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
  if p_note_type_code = 'diagram' and not exists(
    select 1 from public.diagram_hotspots where note_id = p_note_id and deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'diagram notes require at least one hotspot';
  end if;

  if p_payload ? 'orderingItems' then
    if pg_catalog.jsonb_typeof(p_payload -> 'orderingItems') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'orderingItems') > 500 then
      raise exception using errcode = '22023', message = 'ordering items must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'orderingItems') loop
      v_content := v_item -> 'content';
      v_plain := coalesce(v_item ->> 'plainText', v_content ->> 'plainText', '');
      insert into public.ordering_items (
        note_id, semantic_key, content_doc, plain_text, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_content, v_plain,
        coalesce((v_item ->> 'position')::integer, v_position), null
      ) on conflict (note_id, semantic_key) do update
      set content_doc = excluded.content_doc,
          plain_text = excluded.plain_text,
          position = excluded.position,
          version = public.ordering_items.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
  if p_note_type_code = 'ordering' and (
    select pg_catalog.count(*) from public.ordering_items where note_id = p_note_id and deleted_at is null
  ) < 2 then
    raise exception using errcode = '22023', message = 'ordering notes require at least two items';
  end if;

  if p_payload ? 'listItems' then
    if pg_catalog.jsonb_typeof(p_payload -> 'listItems') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'listItems') > 500 then
      raise exception using errcode = '22023', message = 'list items must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'listItems') loop
      insert into public.list_answer_items (
        note_id, semantic_key, answer, aliases, required, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_item ->> 'answer',
        array(select pg_catalog.jsonb_array_elements_text(coalesce(v_item -> 'aliases', '[]'::jsonb))),
        coalesce((v_item ->> 'required')::boolean, true),
        coalesce((v_item ->> 'position')::integer, v_position), null
      ) on conflict (note_id, semantic_key) do update
      set answer = excluded.answer,
          aliases = excluded.aliases,
          required = excluded.required,
          position = excluded.position,
          version = public.list_answer_items.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
  if p_note_type_code = 'list_answer' and not exists(
    select 1 from public.list_answer_items where note_id = p_note_id and deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'list-answer notes require at least one answer';
  end if;

  if p_payload ? 'audioPrompt' and pg_catalog.jsonb_typeof(p_payload -> 'audioPrompt') <> 'null' then
    v_item := p_payload -> 'audioPrompt';
    v_asset_id := nullif(v_item ->> 'assetId', '')::uuid;
    if v_asset_id is not null and not exists(
      select 1 from public.media_assets as asset
      where asset.id = v_asset_id and asset.owner_account_id = p_actor_account_id
        and asset.status = 'ready' and asset.kind = 'audio'
    ) then
      raise exception using errcode = '42501', message = 'audio asset is unavailable';
    end if;
    insert into public.audio_prompts (
      note_id, media_asset_id, transcript, answer, tts_language, deleted_at
    ) values (
      p_note_id, v_asset_id, coalesce(v_item ->> 'transcript', ''),
      coalesce(v_item ->> 'answer', ''), v_item ->> 'language', null
    ) on conflict (note_id) do update
    set media_asset_id = excluded.media_asset_id,
        transcript = excluded.transcript,
        answer = excluded.answer,
        tts_language = excluded.tts_language,
        version = public.audio_prompts.version + 1,
        deleted_at = null;
  end if;

  if p_payload ? 'pronunciationPrompt' and pg_catalog.jsonb_typeof(p_payload -> 'pronunciationPrompt') <> 'null' then
    v_item := p_payload -> 'pronunciationPrompt';
    v_asset_id := nullif(v_item ->> 'referenceAssetId', '')::uuid;
    if v_asset_id is not null and not exists(
      select 1 from public.media_assets as asset
      where asset.id = v_asset_id and asset.owner_account_id = p_actor_account_id
        and asset.status = 'ready' and asset.kind = 'audio'
    ) then
      raise exception using errcode = '42501', message = 'pronunciation asset is unavailable';
    end if;
    insert into public.pronunciation_prompts (
      note_id, text, language, reference_asset_id, tts_allowed, fallback_answer, deleted_at
    ) values (
      p_note_id, v_item ->> 'text', v_item ->> 'language', v_asset_id,
      coalesce((v_item ->> 'ttsAllowed')::boolean, true), v_item ->> 'fallbackAnswer', null
    ) on conflict (note_id) do update
    set text = excluded.text,
        language = excluded.language,
        reference_asset_id = excluded.reference_asset_id,
        tts_allowed = excluded.tts_allowed,
        fallback_answer = excluded.fallback_answer,
        version = public.pronunciation_prompts.version + 1,
        deleted_at = null;
  end if;

  if p_payload ? 'drawingLayers' then
    if pg_catalog.jsonb_typeof(p_payload -> 'drawingLayers') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'drawingLayers') > 100 then
      raise exception using errcode = '22023', message = 'drawing layers must be a bounded array';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'drawingLayers') loop
      v_asset_id := nullif(v_item ->> 'assetId', '')::uuid;
      if v_asset_id is not null and not exists(
        select 1 from public.media_assets as asset
        where asset.id = v_asset_id and asset.owner_account_id = p_actor_account_id
          and asset.status = 'ready' and asset.kind = 'image'
      ) then
        raise exception using errcode = '42501', message = 'drawing reference asset is unavailable';
      end if;
      if not (v_item ? 'strokes')
        or pg_catalog.jsonb_typeof(v_item -> 'strokes') <> 'array'
        or pg_catalog.jsonb_array_length(v_item -> 'strokes') > 1000 then
        raise exception using errcode = '22023', message = 'drawing strokes must be a bounded array';
      end if;
      if v_asset_id is null and pg_catalog.jsonb_array_length(v_item -> 'strokes') = 0 then
        raise exception using errcode = '22023', message = 'drawing layers require an asset or vector strokes';
      end if;
      for v_stroke in select value from pg_catalog.jsonb_array_elements(v_item -> 'strokes') loop
        if pg_catalog.jsonb_typeof(v_stroke) <> 'object'
          or coalesce(v_stroke ->> 'semanticKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
          or coalesce(v_stroke ->> 'color', '') !~ '^#[A-Fa-f0-9]{6}$'
          or pg_catalog.jsonb_typeof(v_stroke -> 'width') <> 'number'
          or (v_stroke ->> 'width')::numeric not between 0.25 and 64
          or pg_catalog.jsonb_typeof(v_stroke -> 'points') <> 'array'
          or pg_catalog.jsonb_array_length(v_stroke -> 'points') not between 1 and 20000 then
          raise exception using errcode = '22023', message = 'drawing stroke metadata is invalid';
        end if;
        for v_point in select value from pg_catalog.jsonb_array_elements(v_stroke -> 'points') loop
          if pg_catalog.jsonb_typeof(v_point) <> 'object'
            or pg_catalog.jsonb_typeof(v_point -> 'x') <> 'number'
            or pg_catalog.jsonb_typeof(v_point -> 'y') <> 'number'
            or (v_point ->> 'x')::numeric not between 0 and 1
            or (v_point ->> 'y')::numeric not between 0 and 1
            or (
              v_point ? 'pressure' and (
                pg_catalog.jsonb_typeof(v_point -> 'pressure') <> 'number'
                or (v_point ->> 'pressure')::numeric not between 0 and 1
              )
            )
            or (
              v_point ? 'timeOffsetMs' and (
                pg_catalog.jsonb_typeof(v_point -> 'timeOffsetMs') <> 'number'
                or (v_point ->> 'timeOffsetMs')::numeric not between 0 and 86400000
                or pg_catalog.trunc((v_point ->> 'timeOffsetMs')::numeric)
                  <> (v_point ->> 'timeOffsetMs')::numeric
              )
            ) then
            raise exception using errcode = '22023', message = 'drawing stroke points must use normalized coordinates';
          end if;
        end loop;
      end loop;
      insert into public.drawing_reference_layers (
        note_id, semantic_key, media_asset_id, strokes, opacity, position, deleted_at
      ) values (
        p_note_id, v_item ->> 'semanticKey', v_asset_id, v_item -> 'strokes',
        coalesce((v_item ->> 'opacity')::numeric, 1),
        coalesce((v_item ->> 'position')::integer, v_position), null
      ) on conflict (note_id, semantic_key) do update
      set media_asset_id = excluded.media_asset_id,
          strokes = excluded.strokes,
          opacity = excluded.opacity,
          position = excluded.position,
          version = public.drawing_reference_layers.version + 1,
          deleted_at = null;
      v_position := v_position + 1;
    end loop;
  end if;
end;
$function$;

create or replace function private.reconcile_generated_cards(
  p_note_id uuid,
  p_note_type_id uuid,
  p_note_version bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_template record;
  v_semantic record;
  v_generation_key text;
  v_desired text[] := '{}'::text[];
  v_ordinal integer := 0;
  v_condition_value text;
  v_condition_exists boolean;
  v_semantic_key text;
  v_direction text;
begin
  for v_template in
    select template.* from public.card_templates as template
    where template.note_type_id = p_note_type_id and template.deleted_at is null
    order by template.ordinal, template.id
  loop
    if v_template.generation_condition = 'dynamic:clozes' then
      for v_semantic in
        select semantic_key from public.cloze_definitions
        where note_id = p_note_id and deleted_at is null order by position, semantic_key
      loop
        v_generation_key := 'g1:' || v_template.card_kind::text || ':'
          || pg_catalog.replace(pg_catalog.replace(v_semantic.semantic_key, '%', '%25'), ':', '%3A');
        v_desired := pg_catalog.array_append(v_desired, v_generation_key);
        insert into public.cards (
          note_id, template_id, ordinal, card_kind, generation_key, content_version, active
        ) values (
          p_note_id, v_template.id, v_ordinal, v_template.card_kind,
          v_generation_key, p_note_version, true
        ) on conflict (note_id, template_id, generation_key) do update
        set ordinal = excluded.ordinal,
            card_kind = excluded.card_kind,
            content_version = excluded.content_version,
            version = public.cards.version + 1,
            active = true,
            deactivated_at = null,
            deleted_at = null;
        v_ordinal := v_ordinal + 1;
      end loop;
    elsif v_template.generation_condition = 'dynamic:occlusion_groups' then
      for v_semantic in
        select group_key as semantic_key, min(position) as first_position
        from public.image_occlusions
        where note_id = p_note_id and deleted_at is null
        group by group_key order by first_position, group_key
      loop
        v_generation_key := 'g1:' || v_template.card_kind::text || ':'
          || pg_catalog.replace(pg_catalog.replace(v_semantic.semantic_key, '%', '%25'), ':', '%3A');
        v_desired := pg_catalog.array_append(v_desired, v_generation_key);
        insert into public.cards (
          note_id, template_id, ordinal, card_kind, generation_key, content_version, active
        ) values (
          p_note_id, v_template.id, v_ordinal, v_template.card_kind,
          v_generation_key, p_note_version, true
        ) on conflict (note_id, template_id, generation_key) do update
        set ordinal = excluded.ordinal,
            content_version = excluded.content_version,
            version = public.cards.version + 1,
            active = true,
            deactivated_at = null,
            deleted_at = null;
        v_ordinal := v_ordinal + 1;
      end loop;
    elsif v_template.generation_condition = 'dynamic:hotspots' then
      for v_semantic in
        select semantic_key, prompt_direction from public.diagram_hotspots
        where note_id = p_note_id and deleted_at is null order by position, semantic_key
      loop
        foreach v_direction in array case v_semantic.prompt_direction
          when 'hotspot_to_label' then array['region_to_label']::text[]
          when 'label_to_hotspot' then array['label_to_region']::text[]
          else array['region_to_label','label_to_region']::text[]
        end loop
          v_semantic_key := v_semantic.semantic_key || ':' || v_direction;
          v_generation_key := 'g1:' || v_template.card_kind::text || ':'
            || pg_catalog.replace(pg_catalog.replace(v_semantic_key, '%', '%25'), ':', '%3A');
          v_desired := pg_catalog.array_append(v_desired, v_generation_key);
          insert into public.cards (
            note_id, template_id, ordinal, card_kind, generation_key, content_version, active
          ) values (
            p_note_id, v_template.id, v_ordinal, v_template.card_kind,
            v_generation_key, p_note_version, true
          ) on conflict (note_id, template_id, generation_key) do update
          set ordinal = excluded.ordinal,
              content_version = excluded.content_version,
              version = public.cards.version + 1,
              active = true,
              deactivated_at = null,
              deleted_at = null;
          v_ordinal := v_ordinal + 1;
        end loop;
      end loop;
    elsif v_template.generation_condition like 'nonempty:%'
      or v_template.generation_condition like 'empty:%' then
      v_condition_value := null;
      v_condition_exists := false;
      select field_value.normalized_text, true into v_condition_value, v_condition_exists
      from public.note_field_values as field_value
      join public.note_type_fields as field on field.id = field_value.field_id
      where field_value.note_id = p_note_id
        and field.field_key = case
          when v_template.generation_condition like 'nonempty:%'
            then pg_catalog.substr(v_template.generation_condition, 10)
          else pg_catalog.substr(v_template.generation_condition, 7)
        end
        and field_value.deleted_at is null;
      if coalesce(v_condition_exists, false) and (
        (
          v_template.generation_condition like 'nonempty:%'
          and case
            when v_template.card_kind = 'optional_reversed'
              then coalesce(pg_catalog.lower(pg_catalog.btrim(v_condition_value)), '')
                not in ('', 'false', '0', 'no', 'off')
            else coalesce(pg_catalog.btrim(v_condition_value), '') <> ''
          end
        )
        or (
          v_template.generation_condition like 'empty:%'
          and coalesce(pg_catalog.btrim(v_condition_value), '') = ''
        )
      ) then
        v_semantic_key := case v_template.card_kind
          when 'optional_reversed' then v_template.template_key
          else v_template.template_key
        end;
        v_generation_key := 'g1:' || v_template.card_kind::text || ':'
          || pg_catalog.replace(pg_catalog.replace(v_semantic_key, '%', '%25'), ':', '%3A');
        v_desired := pg_catalog.array_append(v_desired, v_generation_key);
        insert into public.cards (
          note_id, template_id, ordinal, card_kind, generation_key, content_version, active
        ) values (
          p_note_id, v_template.id, v_ordinal, v_template.card_kind,
          v_generation_key, p_note_version, true
        ) on conflict (note_id, template_id, generation_key) do update
        set ordinal = excluded.ordinal,
            content_version = excluded.content_version,
            version = public.cards.version + 1,
            active = true,
            deactivated_at = null,
            deleted_at = null;
        v_ordinal := v_ordinal + 1;
      end if;
    else
      v_semantic_key := case v_template.card_kind
        when 'basic' then 'forward'
        when 'basic_reversed' then v_template.template_key
        when 'optional_reversed' then v_template.template_key
        when 'bidirectional' then v_template.template_key
        when 'multiple_choice' then 'choice'
        when 'select_all' then 'choice'
        when 'true_false' then 'boolean'
        when 'ordering' then 'sequence'
        when 'list_answer' then 'list'
        when 'audio_prompt' then 'audio'
        when 'pronunciation' then 'pronunciation'
        when 'drawing' then 'drawing'
        else v_template.template_key
      end;
      v_generation_key := 'g1:' || v_template.card_kind::text || ':'
        || pg_catalog.replace(pg_catalog.replace(v_semantic_key, '%', '%25'), ':', '%3A');
      v_desired := pg_catalog.array_append(v_desired, v_generation_key);
      insert into public.cards (
        note_id, template_id, ordinal, card_kind, generation_key, content_version, active
      ) values (
        p_note_id, v_template.id, v_ordinal, v_template.card_kind,
        v_generation_key, p_note_version, true
      ) on conflict (note_id, template_id, generation_key) do update
      set ordinal = excluded.ordinal,
          card_kind = excluded.card_kind,
          content_version = excluded.content_version,
          version = public.cards.version + 1,
          active = true,
          deactivated_at = null,
          deleted_at = null;
      v_ordinal := v_ordinal + 1;
    end if;
  end loop;

  update public.cards as card
  set active = false,
      version = card.version + 1,
      deactivated_at = pg_catalog.now()
  where card.note_id = p_note_id
    and card.active
    and not (card.generation_key = any(v_desired));
end;
$function$;

revoke all on function private.record_note_revision(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.capture_deck_content(uuid) from public, anon, authenticated, service_role;
revoke all on function private.create_deck_version(uuid, uuid, text, text, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function private.bump_deck_content_version(uuid, uuid, text, text, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function private.persist_specialized_card_payload(uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_generated_cards(uuid, uuid, bigint) from public, anon, authenticated, service_role;

create or replace function public.current_create_folder(
  p_name text,
  p_parent_id uuid,
  p_idempotency_key uuid
)
returns public.folders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_folder public.folders;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.create');
  if v_receipt.idempotency_key is not null then
    select * into strict v_folder from public.folders where id = v_receipt.resource_id;
    return v_folder;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'folder name is invalid';
  end if;
  if p_parent_id is not null and not exists(
    select 1 from public.folders as parent
    where parent.id = p_parent_id and parent.owner_account_id = v_account_id
      and parent.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'folder parent is unavailable';
  end if;
  insert into public.folders (owner_account_id, parent_id, name)
  values (v_account_id, p_parent_id, pg_catalog.btrim(p_name))
  returning * into v_folder;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.folder_created',
    'folder', v_folder.id, p_idempotency_key, '{}'::jsonb
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'folder.create', 'folder', v_folder.id,
    pg_catalog.jsonb_build_object('version', v_folder.version)
  );
  return v_folder;
end;
$function$;

create or replace function public.current_update_folder(
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
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_folder public.folders;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.update');
  if v_receipt.idempotency_key is not null then
    select * into strict v_folder from public.folders where id = v_receipt.resource_id;
    return v_folder;
  end if;
  select * into v_folder from public.folders as folder
  where folder.id = p_folder_id and folder.owner_account_id = v_account_id
  for update;
  if not found or v_folder.status <> 'active' then
    raise exception using errcode = '42501', message = 'folder is unavailable';
  end if;
  if v_folder.version <> p_expected_version then
    perform private.raise_content_conflict('folder', p_folder_id, p_expected_version, v_folder.version);
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'folder name is invalid';
  end if;
  update public.folders
  set name = pg_catalog.btrim(p_name), parent_id = p_parent_id, version = version + 1
  where id = p_folder_id returning * into v_folder;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.folder_updated',
    'folder', v_folder.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_folder.version)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'folder.update', 'folder', v_folder.id,
    pg_catalog.jsonb_build_object('version', v_folder.version)
  );
  return v_folder;
end;
$function$;

create or replace function public.current_move_folder(
  p_folder_id uuid,
  p_expected_version bigint,
  p_parent_id uuid,
  p_idempotency_key uuid
)
returns public.folders
language sql
security definer
set search_path = ''
as $function$
  select public.current_update_folder(
    p_folder_id,
    p_expected_version,
    (select folder.name from public.folders as folder where folder.id = p_folder_id),
    p_parent_id,
    p_idempotency_key
  );
$function$;

create or replace function public.current_delete_folder(
  p_folder_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.folders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_folder public.folders;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'folder.delete');
  if v_receipt.idempotency_key is not null then
    select * into strict v_folder from public.folders where id = v_receipt.resource_id;
    return v_folder;
  end if;
  select * into v_folder from public.folders as folder
  where folder.id = p_folder_id and folder.owner_account_id = v_account_id
  for update;
  if not found or v_folder.status <> 'active' then
    raise exception using errcode = '42501', message = 'folder is unavailable';
  end if;
  if v_folder.version <> p_expected_version then
    perform private.raise_content_conflict('folder', p_folder_id, p_expected_version, v_folder.version);
  end if;
  update public.folders set parent_id = v_folder.parent_id, version = version + 1
  where parent_id = p_folder_id and status = 'active';
  update public.folder_items set deleted_at = pg_catalog.now(), version = version + 1
  where folder_id = p_folder_id and deleted_at is null;
  update public.folders
  set status = 'deleted', deleted_at = pg_catalog.now(), version = version + 1
  where id = p_folder_id returning * into v_folder;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.folder_deleted',
    'folder', v_folder.id, p_idempotency_key, '{}'::jsonb
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'folder.delete', 'folder', v_folder.id,
    pg_catalog.jsonb_build_object('version', v_folder.version)
  );
  return v_folder;
end;
$function$;

create or replace function public.current_create_note_type(
  p_display_name text,
  p_description text,
  p_fields jsonb,
  p_templates jsonb,
  p_idempotency_key uuid
)
returns public.note_types
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_note_type public.note_types;
  v_field jsonb;
  v_template jsonb;
  v_generation_condition jsonb;
  v_generation_condition_text text;
  v_code text;
  v_position integer := 0;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note_type.create');
  if v_receipt.idempotency_key is not null then
    select * into strict v_note_type from public.note_types where id = v_receipt.resource_id;
    return v_note_type;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 100
    or pg_catalog.jsonb_typeof(p_fields) <> 'array'
    or pg_catalog.jsonb_array_length(p_fields) not between 2 and 64
    or pg_catalog.jsonb_typeof(p_templates) <> 'array'
    or pg_catalog.jsonb_array_length(p_templates) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'custom note type input is invalid';
  end if;
  v_note_type.id := extensions.gen_random_uuid();
  v_code := 'custom_' || pg_catalog.replace(pg_catalog.left(v_note_type.id::text, 8), '-', '');
  insert into public.note_types (
    id, owner_account_id, code, display_name, card_kind, description, is_system
  ) values (
    v_note_type.id, v_account_id, v_code, pg_catalog.btrim(p_display_name),
    'custom', coalesce(p_description, ''), false
  ) returning * into v_note_type;
  for v_field in select value from pg_catalog.jsonb_array_elements(p_fields) loop
    insert into public.note_type_fields (
      note_type_id, field_key, label, field_type, position, required,
      language, grading_settings, display_settings
    ) values (
      v_note_type.id, v_field ->> 'fieldKey', v_field ->> 'label',
      coalesce((v_field ->> 'fieldType')::public.note_field_type, 'rich_text'),
      coalesce((v_field ->> 'position')::integer, v_position),
      coalesce((v_field ->> 'required')::boolean, false),
      v_field ->> 'language', coalesce(v_field -> 'gradingSettings', '{}'::jsonb),
      coalesce(v_field -> 'displaySettings', '{}'::jsonb)
    );
    v_position := v_position + 1;
  end loop;
  v_position := 0;
  for v_template in select value from pg_catalog.jsonb_array_elements(p_templates) loop
    v_generation_condition := v_template -> 'generationCondition';
    v_generation_condition_text := null;
    if v_generation_condition is not null
      and pg_catalog.jsonb_typeof(v_generation_condition) <> 'null' then
      if pg_catalog.jsonb_typeof(v_generation_condition) <> 'object'
        or coalesce(v_generation_condition ->> 'field', '') !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
        or v_generation_condition ->> 'when' not in ('nonempty', 'empty')
        or not exists(
          select 1 from public.note_type_fields as field
          where field.note_type_id = v_note_type.id
            and field.field_key = v_generation_condition ->> 'field'
            and field.deleted_at is null
        ) then
        raise exception using errcode = '22023', message = 'custom template generation condition is invalid';
      end if;
      v_generation_condition_text := (v_generation_condition ->> 'when')
        || ':' || (v_generation_condition ->> 'field');
    end if;
    insert into public.card_templates (
      note_type_id, template_key, name, ordinal, generation_condition,
      front_template, back_template, styling_css, answer_field_key,
      card_kind, schema_version
    ) values (
      v_note_type.id, v_template ->> 'templateKey', v_template ->> 'name',
      coalesce((v_template ->> 'ordinal')::integer, v_position),
      v_generation_condition_text, v_template ->> 'frontTemplate',
      v_template ->> 'backTemplate', v_template ->> 'stylingCss',
      v_template ->> 'answerFieldKey', 'custom',
      coalesce((v_template ->> 'schemaVersion')::integer, 1)
    );
    v_position := v_position + 1;
  end loop;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.note_type_created',
    'note_type', v_note_type.id, p_idempotency_key, '{}'::jsonb
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note_type.create', 'note_type', v_note_type.id,
    pg_catalog.jsonb_build_object('version', v_note_type.version, 'code', v_note_type.code)
  );
  return v_note_type;
end;
$function$;

create or replace function public.current_update_note_type(
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
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_note_type public.note_types;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note_type.update');
  if v_receipt.idempotency_key is not null then
    select * into strict v_note_type from public.note_types where id = v_receipt.resource_id;
    return v_note_type;
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
    or exists(
      select 1 from pg_catalog.jsonb_object_keys(p_patch) as patch_key
      where patch_key not in ('displayName', 'description')
    ) then
    raise exception using errcode = '22023', message = 'note type patch is invalid';
  end if;
  select * into v_note_type from public.note_types as note_type
  where note_type.id = p_note_type_id
    and note_type.owner_account_id = v_account_id
    and not note_type.is_system and note_type.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'note type is unavailable';
  end if;
  if v_note_type.version <> p_expected_version then
    perform private.raise_content_conflict('note_type', p_note_type_id, p_expected_version, v_note_type.version);
  end if;
  update public.note_types
  set display_name = case when p_patch ? 'displayName' then p_patch ->> 'displayName' else display_name end,
      description = case when p_patch ? 'description' then coalesce(p_patch ->> 'description', '') else description end,
      version = version + 1
  where id = p_note_type_id returning * into v_note_type;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.note_type_updated',
    'note_type', v_note_type.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_note_type.version)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note_type.update', 'note_type', v_note_type.id,
    pg_catalog.jsonb_build_object('version', v_note_type.version)
  );
  return v_note_type;
end;
$function$;

create or replace function public.current_create_deck(
  p_title text,
  p_description_doc jsonb,
  p_folder_id uuid,
  p_visibility public.deck_visibility,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_public_id uuid := extensions.gen_random_uuid();
  v_default_note_type_id uuid;
  v_description jsonb := coalesce(p_description_doc, '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb);
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.create');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 180
    or pg_catalog.jsonb_typeof(v_description) <> 'object'
    or p_visibility not in ('private', 'unlisted') then
    raise exception using errcode = '22023', message = 'deck input is invalid';
  end if;
  if p_folder_id is not null and not exists(
    select 1 from public.folders as folder
    where folder.id = p_folder_id and folder.owner_account_id = v_account_id
      and folder.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'folder is unavailable';
  end if;
  select id into strict v_default_note_type_id from public.note_types
  where code = 'basic' and is_system and deleted_at is null;
  insert into public.decks (
    public_id, owner_account_id, title, slug, description_doc,
    description_plain, visibility, default_note_type_id, content_hash
  ) values (
    v_public_id, v_account_id, pg_catalog.btrim(p_title),
    pg_catalog.left(private.slugify(p_title), 105) || '-' || pg_catalog.left(v_public_id::text, 8),
    v_description, coalesce(v_description ->> 'plainText', ''), p_visibility,
    v_default_note_type_id,
    private.content_hash(pg_catalog.jsonb_build_object('schemaVersion', 1, 'notes', '[]'::jsonb))
  ) returning * into v_deck;
  insert into public.deck_members (deck_id, account_id, role, granted_by)
  values (v_deck.id, v_account_id, 'owner', v_account_id);
  if p_folder_id is not null then
    insert into public.folder_items (folder_id, deck_id) values (p_folder_id, v_deck.id);
  end if;
  perform private.create_deck_version(
    v_deck.id, v_account_id, 'deck_created', 'Deck created', p_idempotency_key
  );
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_created',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('visibility', v_deck.visibility)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.create', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object('version', v_deck.version, 'publicId', v_deck.public_id)
  );
  return v_deck;
end;
$function$;

create or replace function public.current_update_deck(
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
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_cover_asset_id uuid;
  v_folder_id uuid;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.update');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
    or not exists(select 1 from pg_catalog.jsonb_object_keys(p_patch))
    or exists(
      select 1 from pg_catalog.jsonb_object_keys(p_patch) as patch_key
      where patch_key not in (
        'title','descriptionDoc','descriptionPlain','license','languageFront',
        'languageBack','coverAssetId','defaultNoteTypeId','folderId','theme'
      )
    ) then
    raise exception using errcode = '22023', message = 'deck patch is invalid';
  end if;
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or not private.can_edit_deck(v_account_id, p_deck_id) or v_deck.status <> 'active' then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  if v_deck.version <> p_expected_version then
    perform private.raise_content_conflict('deck', p_deck_id, p_expected_version, v_deck.version);
  end if;
  if p_patch ? 'coverAssetId' then
    v_cover_asset_id := nullif(p_patch ->> 'coverAssetId', '')::uuid;
    if v_cover_asset_id is not null and not exists(
      select 1 from public.media_assets as asset
      where asset.id = v_cover_asset_id and asset.owner_account_id = v_account_id
        and asset.kind = 'image' and asset.status = 'ready'
    ) then
      raise exception using errcode = '42501', message = 'cover asset is unavailable';
    end if;
  else
    v_cover_asset_id := v_deck.cover_asset_id;
  end if;
  if p_patch ? 'defaultNoteTypeId' and not private.can_view_note_type(
    v_account_id, (p_patch ->> 'defaultNoteTypeId')::uuid
  ) then
    raise exception using errcode = '42501', message = 'default note type is unavailable';
  end if;
  if p_patch ? 'folderId' then
    if v_deck.owner_account_id <> v_account_id then
      raise exception using errcode = '42501', message = 'only the deck owner can organize it in folders';
    end if;
    v_folder_id := nullif(p_patch ->> 'folderId', '')::uuid;
    if v_folder_id is not null and not exists(
      select 1 from public.folders as folder
      where folder.id = v_folder_id and folder.owner_account_id = v_account_id
        and folder.status = 'active'
    ) then
      raise exception using errcode = '42501', message = 'folder is unavailable';
    end if;
    update public.folder_items set deleted_at = pg_catalog.now(), version = version + 1
    where deck_id = p_deck_id and deleted_at is null;
    if v_folder_id is not null then
      insert into public.folder_items (folder_id, deck_id)
      values (v_folder_id, p_deck_id);
    end if;
  end if;
  update public.decks
  set title = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      description_doc = case when p_patch ? 'descriptionDoc' then p_patch -> 'descriptionDoc' else description_doc end,
      description_plain = case when p_patch ? 'descriptionPlain' then coalesce(p_patch ->> 'descriptionPlain', '') else description_plain end,
      license = case when p_patch ? 'license' then (p_patch ->> 'license')::public.deck_license else license end,
      theme = case when p_patch ? 'theme' then p_patch ->> 'theme' else theme end,
      language_front = case when p_patch ? 'languageFront' then p_patch ->> 'languageFront' else language_front end,
      language_back = case when p_patch ? 'languageBack' then p_patch ->> 'languageBack' else language_back end,
      cover_asset_id = v_cover_asset_id,
      default_note_type_id = case when p_patch ? 'defaultNoteTypeId' then (p_patch ->> 'defaultNoteTypeId')::uuid else default_note_type_id end
  where id = p_deck_id;
  v_deck := private.bump_deck_content_version(
    p_deck_id, v_account_id, 'deck_updated', 'Deck metadata updated', p_idempotency_key
  );
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_updated',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_deck.version)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.update', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object('version', v_deck.version, 'contentVersion', v_deck.current_version)
  );
  return v_deck;
end;
$function$;

create or replace function private.set_deck_lifecycle(
  p_operation text,
  p_deck_id uuid,
  p_expected_version bigint,
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
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.' || p_operation);
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or v_deck.owner_account_id <> v_account_id then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  if v_deck.version <> p_expected_version then
    perform private.raise_content_conflict('deck', p_deck_id, p_expected_version, v_deck.version);
  end if;
  if p_operation = 'archive' then
    if v_deck.status <> 'active' then
      raise exception using errcode = '22023', message = 'only an active deck can be archived';
    end if;
    update public.decks set status = 'archived', archived_at = pg_catalog.now(),
      version = version + 1 where id = p_deck_id returning * into v_deck;
  elsif p_operation = 'restore' then
    if v_deck.status not in ('archived', 'deleted') then
      raise exception using errcode = '22023', message = 'deck is not restorable';
    end if;
    update public.decks set status = 'active', archived_at = null, deleted_at = null,
      version = version + 1 where id = p_deck_id returning * into v_deck;
  elsif p_operation = 'delete' then
    if v_deck.status = 'deleted' then
      raise exception using errcode = '22023', message = 'deck is already deleted';
    end if;
    delete from public.deck_publications where public_id = v_deck.public_id;
    update public.folder_items set deleted_at = pg_catalog.now(), version = version + 1
    where deck_id = p_deck_id and deleted_at is null;
    update public.decks set status = 'deleted', deleted_at = pg_catalog.now(),
      published_version = null, published_at = null, visibility = 'private',
      version = version + 1 where id = p_deck_id returning * into v_deck;
  else
    raise exception using errcode = '22023', message = 'deck lifecycle operation is invalid';
  end if;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_' || p_operation || 'd',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_deck.version)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.' || p_operation, 'deck', v_deck.id,
    pg_catalog.jsonb_build_object('version', v_deck.version, 'status', v_deck.status)
  );
  return v_deck;
end;
$function$;

create or replace function public.current_archive_deck(uuid, bigint, uuid)
returns public.decks language sql security definer set search_path = ''
as $function$ select private.set_deck_lifecycle('archive', $1, $2, $3); $function$;
create or replace function public.current_restore_deck(uuid, bigint, uuid)
returns public.decks language sql security definer set search_path = ''
as $function$ select private.set_deck_lifecycle('restore', $1, $2, $3); $function$;
create or replace function public.current_delete_deck(uuid, bigint, uuid)
returns public.decks language sql security definer set search_path = ''
as $function$ select private.set_deck_lifecycle('delete', $1, $2, $3); $function$;

revoke all on function private.set_deck_lifecycle(text, uuid, bigint, uuid) from public, anon, authenticated, service_role;

create or replace function public.current_upsert_note(
  p_deck_id uuid,
  p_note_id uuid,
  p_note_type_code text,
  p_expected_version bigint,
  p_fields jsonb,
  p_card_payload jsonb,
  p_tags text[],
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
  v_note_type public.note_types;
  v_field public.note_type_fields;
  v_field_input jsonb;
  v_value_doc jsonb;
  v_plain_text text;
  v_normalized_text text;
  v_sort_text text := '';
  v_tag_name text;
  v_tag public.tags;
  v_is_create boolean := false;
  v_old_version bigint;
  v_old_payload jsonb;
  v_classification public.content_change_classification := 'answer'::public.content_change_classification;
  v_response jsonb;
  v_deck_result public.decks;
  v_authoring_payload jsonb;
  v_source_references jsonb;
  v_persistence_payload jsonb;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note.upsert');
  if v_receipt.idempotency_key is not null then
    return v_receipt.response;
  end if;
  if p_fields is null or pg_catalog.jsonb_typeof(p_fields) <> 'object'
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_fields)) > 64
    or p_card_payload is null or pg_catalog.jsonb_typeof(p_card_payload) <> 'object'
    or not (p_card_payload ? 'authoringData')
    or pg_catalog.jsonb_typeof(p_card_payload -> 'authoringData') <> 'object'
    or exists(
      select 1 from pg_catalog.jsonb_object_keys(p_card_payload) as transport_key
      where transport_key not in ('authoringData', 'sourceReference', 'sourceReferences')
    )
    or coalesce(pg_catalog.cardinality(p_tags), 0) > 100 then
    raise exception using errcode = '22023', message = 'note input is invalid';
  end if;
  v_authoring_payload := p_card_payload -> 'authoringData';
  v_source_references := coalesce(p_card_payload -> 'sourceReferences', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_source_references) <> 'array'
    or pg_catalog.jsonb_array_length(v_source_references) > 100
    or pg_catalog.char_length(coalesce(p_card_payload ->> 'sourceReference', '')) > 2000 then
    raise exception using errcode = '22023', message = 'note source input is invalid';
  end if;
  v_persistence_payload := v_authoring_payload
    || pg_catalog.jsonb_build_object('sourceReferences', v_source_references);
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or not private.can_edit_deck(v_account_id, p_deck_id) or v_deck.status <> 'active' then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  select * into v_note_type
  from public.note_types as note_type
  where note_type.code = p_note_type_code
    and note_type.deleted_at is null
    and (
      note_type.is_system
      or note_type.owner_account_id = v_account_id
      or note_type.id = v_deck.default_note_type_id
      or exists(
        select 1 from public.notes as existing_note
        where existing_note.deck_id = p_deck_id
          and existing_note.note_type_id = note_type.id
          and existing_note.deleted_at is null
      )
    )
  order by note_type.is_system desc
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'note type is unavailable';
  end if;
  if exists(
    select 1 from pg_catalog.jsonb_object_keys(p_fields) as supplied(field_key)
    where not exists(
      select 1 from public.note_type_fields as field
      where field.note_type_id = v_note_type.id
        and field.field_key = supplied.field_key
        and field.deleted_at is null
    )
  ) then
    raise exception using errcode = '22023', message = 'note contains an unknown field';
  end if;
  if exists(
    select 1 from public.note_type_fields as field
    where field.note_type_id = v_note_type.id
      and field.required and field.deleted_at is null
      and (
        not (p_fields ? field.field_key)
        or pg_catalog.btrim(coalesce(p_fields -> field.field_key ->> 'plainText', '')) = ''
      )
  ) then
    raise exception using errcode = '22023', message = 'required note field is empty';
  end if;

  if p_note_id is not null then
    select * into v_note from public.notes as note where note.id = p_note_id for update;
  end if;
  if not found then
    if p_expected_version is not null and p_expected_version <> 0 then
      perform private.raise_content_conflict(
        'note', coalesce(p_note_id, extensions.gen_random_uuid()), p_expected_version, 0
      );
    end if;
    v_is_create := true;
    v_note.id := coalesce(p_note_id, extensions.gen_random_uuid());
    v_old_version := 0;
  else
    if v_note.deck_id <> p_deck_id or v_note.deleted_at is not null then
      raise exception using errcode = '42501', message = 'note is unavailable';
    end if;
    if v_note.version <> p_expected_version then
      perform private.raise_content_conflict('note', v_note.id, p_expected_version, v_note.version);
    end if;
    v_old_version := v_note.version;
    v_old_payload := v_note.card_payload;
    perform private.record_note_revision(v_note.id, v_account_id, 'note_updated', p_idempotency_key);
  end if;

  for v_field in
    select * from public.note_type_fields as field
    where field.note_type_id = v_note_type.id and field.deleted_at is null
    order by field.position
  loop
    if p_fields ? v_field.field_key then
      v_field_input := p_fields -> v_field.field_key;
      if pg_catalog.jsonb_typeof(v_field_input) <> 'object' then
        raise exception using errcode = '22023', message = 'note field input must be an object';
      end if;
      v_value_doc := coalesce(v_field_input -> 'doc', v_field_input);
      v_plain_text := coalesce(v_field_input ->> 'plainText', '');
      v_normalized_text := coalesce(
        v_field_input ->> 'normalizedText',
        pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_plain_text), '[[:space:]]+', ' ', 'g'))
      );
      if pg_catalog.jsonb_typeof(v_value_doc) <> 'object'
        or pg_catalog.char_length(v_plain_text) > 100000
        or pg_catalog.char_length(v_normalized_text) > 100000 then
        raise exception using errcode = '22023', message = 'note field value is invalid';
      end if;
      if v_sort_text = '' then
        v_sort_text := pg_catalog.left(v_plain_text, 10000);
      end if;
    end if;
  end loop;

  if v_is_create then
    insert into public.notes (
      id, deck_id, note_type_id, created_by, updated_by, version,
      sort_text, content_hash, source_reference, metadata, card_payload
    ) values (
      v_note.id, p_deck_id, v_note_type.id, v_account_id, v_account_id, 1,
      v_sort_text,
      private.content_hash(pg_catalog.jsonb_build_object(
        'fields', p_fields, 'cardPayload', v_authoring_payload,
        'sourceReference', p_card_payload ->> 'sourceReference',
        'sourceReferences', v_source_references
      )),
      p_card_payload ->> 'sourceReference', '{}'::jsonb, v_authoring_payload
    ) returning * into v_note;
  else
    update public.notes
    set note_type_id = v_note_type.id,
        updated_by = v_account_id,
        version = version + 1,
        sort_text = v_sort_text,
        content_hash = private.content_hash(
          pg_catalog.jsonb_build_object(
            'fields', p_fields, 'cardPayload', v_authoring_payload,
            'sourceReference', p_card_payload ->> 'sourceReference',
            'sourceReferences', v_source_references
          )
        ),
        source_reference = p_card_payload ->> 'sourceReference',
        card_payload = v_authoring_payload
    where id = v_note.id returning * into v_note;
  end if;

  update public.note_field_values set deleted_at = pg_catalog.now(), version = version + 1
  where note_id = v_note.id and deleted_at is null;
  for v_field in
    select * from public.note_type_fields as field
    where field.note_type_id = v_note_type.id and field.deleted_at is null
    order by field.position
  loop
    if p_fields ? v_field.field_key then
      v_field_input := p_fields -> v_field.field_key;
      v_value_doc := coalesce(v_field_input -> 'doc', v_field_input);
      v_plain_text := coalesce(v_field_input ->> 'plainText', '');
      v_normalized_text := coalesce(
        v_field_input ->> 'normalizedText',
        pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_plain_text), '[[:space:]]+', ' ', 'g'))
      );
      insert into public.note_field_values (
        note_id, field_id, value_doc, plain_text, normalized_text, position, deleted_at
      ) values (
        v_note.id, v_field.id, v_value_doc, v_plain_text, v_normalized_text,
        coalesce((v_field_input ->> 'position')::integer, v_field.position), null
      ) on conflict (note_id, field_id) do update
      set value_doc = excluded.value_doc,
          plain_text = excluded.plain_text,
          normalized_text = excluded.normalized_text,
          position = excluded.position,
          version = public.note_field_values.version + 1,
          deleted_at = null;
    end if;
  end loop;

  update public.note_tags set deleted_at = pg_catalog.now()
  where note_id = v_note.id and deleted_at is null;
  foreach v_tag_name in array coalesce(p_tags, '{}'::text[]) loop
    v_tag_name := pg_catalog.btrim(v_tag_name);
    if pg_catalog.char_length(v_tag_name) not between 1 and 100 then
      raise exception using errcode = '22023', message = 'tag name is invalid';
    end if;
    insert into public.tags (deck_id, name, normalized_name)
    values (
      p_deck_id, v_tag_name,
      pg_catalog.lower(pg_catalog.regexp_replace(v_tag_name, '[[:space:]]+', ' ', 'g'))
    )
    on conflict (deck_id, normalized_name) where deleted_at is null do update
    set name = excluded.name
    returning * into v_tag;
    insert into public.note_tags (note_id, tag_id, created_by, deleted_at)
    values (v_note.id, v_tag.id, v_account_id, null)
    on conflict (note_id, tag_id) do update set deleted_at = null;
  end loop;

  perform private.persist_specialized_card_payload(
    v_note.id, v_note_type.code, v_persistence_payload, v_account_id
  );
  perform private.reconcile_generated_cards(v_note.id, v_note_type.id, v_note.version);

  if not v_is_create then
    begin
      v_classification := case
        when v_old_payload = v_authoring_payload
          then 'answer'::public.content_change_classification
        else 'structural'::public.content_change_classification
      end;
    exception when invalid_text_representation then
      v_classification := 'structural'::public.content_change_classification;
    end;
    insert into public.content_change_impacts (
      deck_id, note_id, from_note_version, to_note_version,
      classification, affected_generation_keys, created_by
    ) values (
      p_deck_id, v_note.id, v_old_version, v_note.version, v_classification,
      coalesce((
        select pg_catalog.array_agg(card.generation_key order by card.ordinal)
        from public.cards as card where card.note_id = v_note.id and card.active
      ), '{}'::text[]),
      v_account_id
    );
  end if;
  v_deck_result := private.bump_deck_content_version(
    p_deck_id, v_account_id,
    case when v_is_create then 'note_created' else 'note_updated' end,
    case when v_is_create then 'Note created' else 'Note updated' end,
    p_idempotency_key
  );
  select pg_catalog.jsonb_build_object(
    'note', pg_catalog.to_jsonb(v_note),
    'deckVersion', v_deck_result.version,
    'contentVersion', v_deck_result.current_version,
    'cards', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', card.id,
        'templateId', card.template_id,
        'ordinal', card.ordinal,
        'cardKind', card.card_kind,
        'generationKey', card.generation_key,
        'contentVersion', card.content_version,
        'active', card.active
      ) order by card.ordinal, card.id
    ) filter (where card.id is not null), '[]'::jsonb)
  ) into v_response
  from public.cards as card
  where card.note_id = v_note.id and card.active and card.deleted_at is null;
  perform private.write_audit_event(
    'account', v_account_id, null, null,
    case when v_is_create then 'content.note_created' else 'content.note_updated' end,
    'note', v_note.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_note.version, 'deckId', p_deck_id)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note.upsert', 'note', v_note.id, v_response
  );
  return v_response;
end;
$function$;

create or replace function public.current_delete_note(
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
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_note public.notes;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'note.delete');
  if v_receipt.idempotency_key is not null then
    select * into strict v_note from public.notes where id = v_receipt.resource_id;
    return v_note;
  end if;
  select * into v_note from public.notes as note where note.id = p_note_id for update;
  if not found or v_note.deleted_at is not null
    or not private.can_edit_deck(v_account_id, v_note.deck_id) then
    raise exception using errcode = '42501', message = 'note is unavailable';
  end if;
  if v_note.version <> p_expected_version then
    perform private.raise_content_conflict('note', p_note_id, p_expected_version, v_note.version);
  end if;
  perform private.record_note_revision(v_note.id, v_account_id, 'note_deleted', p_idempotency_key);
  update public.notes
  set version = version + 1, updated_by = v_account_id, deleted_at = pg_catalog.now()
  where id = p_note_id returning * into v_note;
  update public.cards set active = false, version = version + 1,
    deactivated_at = pg_catalog.now() where note_id = p_note_id and active;
  insert into public.content_change_impacts (
    deck_id, note_id, from_note_version, to_note_version,
    classification, affected_generation_keys, created_by
  ) values (
    v_note.deck_id, v_note.id, v_note.version - 1, v_note.version, 'structural',
    coalesce((select pg_catalog.array_agg(card.generation_key) from public.cards as card
      where card.note_id = v_note.id), '{}'::text[]),
    v_account_id
  );
  perform private.bump_deck_content_version(
    v_note.deck_id, v_account_id, 'note_deleted', 'Note deleted', p_idempotency_key
  );
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.note_deleted',
    'note', v_note.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('version', v_note.version)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'note.delete', 'note', v_note.id,
    pg_catalog.jsonb_build_object('version', v_note.version)
  );
  return v_note;
end;
$function$;

create or replace function public.current_duplicate_deck(
  p_source_deck_id uuid,
  p_title text,
  p_folder_id uuid,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_source public.decks;
  v_deck public.decks;
  v_source_note public.notes;
  v_new_note public.notes;
  v_note_type_code text;
  v_public_id uuid := extensions.gen_random_uuid();
  v_tag_name text;
  v_tag public.tags;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.duplicate');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  select * into v_source from public.decks as deck where deck.id = p_source_deck_id;
  if not found or not private.can_view_deck(v_account_id, p_source_deck_id)
    or v_source.status = 'deleted' then
    raise exception using errcode = '42501', message = 'source deck is unavailable';
  end if;
  if p_folder_id is not null and not exists(
    select 1 from public.folders as folder where folder.id = p_folder_id
      and folder.owner_account_id = v_account_id and folder.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'folder is unavailable';
  end if;
  insert into public.decks (
    public_id, owner_account_id, title, slug, description_doc, description_plain,
    visibility, license, language_front, language_back, cover_asset_id,
    default_note_type_id, source_deck_id, fork_mode, content_hash
  ) values (
    v_public_id, v_account_id,
    pg_catalog.btrim(coalesce(nullif(p_title, ''), v_source.title || ' copy')),
    pg_catalog.left(private.slugify(coalesce(nullif(p_title, ''), v_source.title || ' copy')), 105)
      || '-' || pg_catalog.left(v_public_id::text, 8),
    v_source.description_doc, v_source.description_plain, 'private', v_source.license,
    v_source.language_front, v_source.language_back,
    case when v_source.owner_account_id = v_account_id then v_source.cover_asset_id else null end,
    v_source.default_note_type_id, v_source.id, 'independent',
    private.content_hash(pg_catalog.jsonb_build_object('schemaVersion', 1, 'notes', '[]'::jsonb))
  ) returning * into v_deck;
  update public.decks set theme = v_source.theme where id = v_deck.id returning * into v_deck;
  insert into public.deck_members (deck_id, account_id, role, granted_by)
  values (v_deck.id, v_account_id, 'owner', v_account_id);
  if p_folder_id is not null then
    insert into public.folder_items (folder_id, deck_id) values (p_folder_id, v_deck.id);
  end if;

  for v_source_note in
    select * from public.notes as note
    where note.deck_id = p_source_deck_id and note.deleted_at is null
    order by note.created_at, note.id
  loop
    insert into public.notes (
      deck_id, note_type_id, created_by, updated_by, version, sort_text,
      content_hash, source_reference, metadata, card_payload
    ) values (
      v_deck.id, v_source_note.note_type_id, v_account_id, v_account_id, 1,
      v_source_note.sort_text, v_source_note.content_hash, v_source_note.source_reference,
      v_source_note.metadata, v_source_note.card_payload
    ) returning * into v_new_note;
    insert into public.note_field_values (
      note_id, field_id, value_doc, plain_text, normalized_text, position
    ) select
      v_new_note.id, field_value.field_id, field_value.value_doc,
      field_value.plain_text, field_value.normalized_text, field_value.position
    from public.note_field_values as field_value
    where field_value.note_id = v_source_note.id and field_value.deleted_at is null;
    select code into strict v_note_type_code from public.note_types where id = v_source_note.note_type_id;
    perform private.persist_specialized_card_payload(
      v_new_note.id, v_note_type_code, v_source_note.card_payload, v_account_id
    );
    insert into public.source_references (
      note_id, semantic_key, citation_doc, title, author, url, position
    ) select
      v_new_note.id, source.semantic_key, source.citation_doc,
      source.title, source.author, source.url, source.position
    from public.source_references as source
    where source.note_id = v_source_note.id and source.deleted_at is null;
    perform private.reconcile_generated_cards(v_new_note.id, v_new_note.note_type_id, v_new_note.version);
    for v_tag_name in
      select tag.name from public.note_tags as note_tag
      join public.tags as tag on tag.id = note_tag.tag_id
      where note_tag.note_id = v_source_note.id
        and note_tag.deleted_at is null and tag.deleted_at is null
    loop
      insert into public.tags (deck_id, name, normalized_name)
      values (
        v_deck.id, v_tag_name,
        pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_tag_name), '[[:space:]]+', ' ', 'g'))
      ) on conflict (deck_id, normalized_name) where deleted_at is null
      do update set name = excluded.name returning * into v_tag;
      insert into public.note_tags (note_id, tag_id, created_by)
      values (v_new_note.id, v_tag.id, v_account_id);
    end loop;
  end loop;
  update public.decks
  set note_count = (select pg_catalog.count(*)::integer from public.notes where deck_id = v_deck.id and deleted_at is null),
      card_count = (
        select pg_catalog.count(*)::integer from public.cards as card
        join public.notes as note on note.id = card.note_id
        where note.deck_id = v_deck.id and card.active and card.deleted_at is null
      ),
      content_hash = private.content_hash(private.capture_deck_content(v_deck.id))
  where id = v_deck.id returning * into v_deck;
  perform private.create_deck_version(
    v_deck.id, v_account_id, 'deck_duplicated', 'Deck duplicated', p_idempotency_key
  );
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_duplicated',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('sourceDeckId', p_source_deck_id)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.duplicate', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object('version', v_deck.version, 'publicId', v_deck.public_id)
  );
  return v_deck;
end;
$function$;

create or replace function private.adjust_media_reference_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    update public.media_assets
    set reference_count = reference_count + 1,
        status = case when status = 'deleting' then 'ready' else status end,
        delete_after = null
    where id = new.media_asset_id;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.media_assets
      set reference_count = greatest(reference_count - 1, 0),
          status = case when reference_count <= 1 and status = 'ready' then 'deleting' else status end,
          delete_after = case when reference_count <= 1 and status = 'ready'
            then pg_catalog.now() + interval '7 days' else delete_after end
      where id = new.media_asset_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.media_assets
      set reference_count = reference_count + 1,
          status = case when status = 'deleting' then 'ready' else status end,
          delete_after = null
      where id = new.media_asset_id;
    end if;
  end if;
  return new;
end;
$function$;

create trigger media_references_adjust_count
after insert or update of deleted_at on public.media_references
for each row execute function private.adjust_media_reference_count();

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
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_asset public.media_assets;
  v_extension text;
  v_public_id uuid;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'media.register');
  if v_receipt.idempotency_key is not null then
    select * into strict v_asset from public.media_assets where id = v_receipt.resource_id;
    return v_asset;
  end if;
  p_sha256 := pg_catalog.lower(pg_catalog.btrim(p_sha256));
  p_mime_type := pg_catalog.lower(pg_catalog.btrim(p_mime_type));
  if p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_size <= 0
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
  select * into v_asset from public.media_assets as asset
  where asset.owner_account_id = v_account_id and asset.sha256 = p_sha256
  for update;
  if found then
    if v_asset.kind <> p_kind or v_asset.byte_size <> p_byte_size
      or v_asset.status in ('quarantined', 'deleted') then
      raise exception using errcode = '22023', message = 'media hash replay does not match';
    end if;
    perform private.record_content_receipt(
      v_account_id, p_idempotency_key, 'media.register', 'media_asset', v_asset.id,
      pg_catalog.jsonb_build_object('version', v_asset.version, 'deduplicated', true)
    );
    return v_asset;
  end if;
  if coalesce((
    select pg_catalog.sum(asset.byte_size) from public.media_assets as asset
    where asset.owner_account_id = v_account_id
      and asset.status not in ('quarantined', 'deleted')
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
    duration_ms, storage_path, alt_text
  ) values (
    v_public_id, v_account_id, p_sha256, p_kind, p_mime_type, p_byte_size, p_width, p_height,
    p_duration_ms,
    v_public_id::text || '/' || pg_catalog.left(p_sha256, 2) || '/' || p_sha256 || '.' || v_extension,
    nullif(pg_catalog.btrim(coalesce(p_alt_text, '')), '')
  ) returning * into v_asset;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.media_registered',
    'media_asset', v_asset.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('kind', v_asset.kind, 'byteSize', v_asset.byte_size)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'media.register', 'media_asset', v_asset.id,
    pg_catalog.jsonb_build_object('version', v_asset.version, 'deduplicated', false)
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
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets;
begin
  if p_actor_account_id is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'media finalization input is invalid';
  end if;
  select * into v_asset from public.media_assets as asset
  where asset.id = p_media_asset_id and asset.owner_account_id = p_actor_account_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'media asset is unavailable';
  end if;
  if v_asset.status = 'ready' then
    if v_asset.detected_mime_type <> pg_catalog.lower(p_detected_mime_type)
      or v_asset.sha256 <> pg_catalog.lower(p_detected_sha256) then
      raise exception using errcode = '22023', message = 'media finalization replay does not match';
    end if;
    if v_asset.reference_count = 0 and v_asset.delete_after is null then
      update public.media_assets
      set delete_after = pg_catalog.now() + interval '7 days',
          version = version + 1
      where id = v_asset.id
      returning * into v_asset;
    end if;
    return v_asset;
  end if;
  update public.media_assets
  set detected_mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type)),
      magic_verified = coalesce(p_magic_verified, false)
        and sha256 = pg_catalog.lower(pg_catalog.btrim(p_detected_sha256))
        and mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type)),
      status = case when coalesce(p_magic_verified, false)
        and sha256 = pg_catalog.lower(pg_catalog.btrim(p_detected_sha256))
        and mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type))
        then 'ready'::public.media_status else 'quarantined'::public.media_status end,
      delete_after = case when coalesce(p_magic_verified, false)
        and sha256 = pg_catalog.lower(pg_catalog.btrim(p_detected_sha256))
        and mime_type = pg_catalog.lower(pg_catalog.btrim(p_detected_mime_type))
        and reference_count = 0
        then pg_catalog.now() + interval '7 days' else null end,
      version = version + 1
  where id = p_media_asset_id returning * into v_asset;
  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    case when v_asset.status = 'ready' then 'content.media_verified' else 'content.media_quarantined' end,
    'media_asset', v_asset.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('status', v_asset.status)
  );
  return v_asset;
end;
$function$;

create or replace function public.current_link_media(
  p_media_asset_id uuid,
  p_owner_type public.media_reference_type,
  p_owner_id uuid,
  p_purpose public.media_reference_purpose,
  p_position integer,
  p_alt_text text,
  p_idempotency_key uuid
)
returns public.media_references
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_asset public.media_assets;
  v_reference public.media_references;
  v_deck_id uuid;
  v_note_id uuid;
  v_field_value_id uuid;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'media.link');
  if v_receipt.idempotency_key is not null then
    select * into strict v_reference from public.media_references where id = v_receipt.resource_id;
    return v_reference;
  end if;
  select * into v_asset from public.media_assets as asset
  where asset.id = p_media_asset_id and asset.owner_account_id = v_account_id
    and asset.status = 'ready' for update;
  if not found then
    raise exception using errcode = '42501', message = 'media asset is unavailable';
  end if;
  if p_position < 0 or pg_catalog.char_length(coalesce(p_alt_text, '')) > 1000
    or (v_asset.kind = 'image' and pg_catalog.btrim(coalesce(p_alt_text, v_asset.alt_text, '')) = '') then
    raise exception using errcode = '22023', message = 'media reference metadata is invalid';
  end if;
  if p_owner_type = 'deck' then
    v_deck_id := p_owner_id;
  elsif p_owner_type = 'note' then
    select note.deck_id, note.id into v_deck_id, v_note_id
    from public.notes as note where note.id = p_owner_id and note.deleted_at is null;
  elsif p_owner_type = 'note_field' then
    select note.deck_id, note.id, field_value.id into v_deck_id, v_note_id, v_field_value_id
    from public.note_field_values as field_value
    join public.notes as note on note.id = field_value.note_id
    where field_value.id = p_owner_id and field_value.deleted_at is null and note.deleted_at is null;
  elsif p_owner_type = 'image_occlusion' then
    select note.deck_id, note.id into v_deck_id, v_note_id
    from public.image_occlusions as child join public.notes as note on note.id = child.note_id
    where child.id = p_owner_id and child.deleted_at is null and note.deleted_at is null;
  elsif p_owner_type = 'diagram_hotspot' then
    select note.deck_id, note.id into v_deck_id, v_note_id
    from public.diagram_hotspots as child join public.notes as note on note.id = child.note_id
    where child.id = p_owner_id and child.deleted_at is null and note.deleted_at is null;
  elsif p_owner_type in ('audio_prompt', 'pronunciation') then
    v_note_id := p_owner_id;
    select note.deck_id into v_deck_id from public.notes as note
    where note.id = p_owner_id and note.deleted_at is null;
  elsif p_owner_type = 'drawing_layer' then
    select note.deck_id, note.id into v_deck_id, v_note_id
    from public.drawing_reference_layers as child join public.notes as note on note.id = child.note_id
    where child.id = p_owner_id and child.deleted_at is null and note.deleted_at is null;
  end if;
  if v_deck_id is null or not private.can_edit_deck(v_account_id, v_deck_id) then
    raise exception using errcode = '42501', message = 'media reference target is unavailable';
  end if;
  insert into public.media_references (
    media_asset_id, deck_id, note_id, field_value_id, reference_type,
    owner_id, purpose, position, alt_text, created_by, deleted_at
  ) values (
    v_asset.id, v_deck_id, v_note_id, v_field_value_id, p_owner_type,
    p_owner_id, p_purpose, p_position,
    nullif(pg_catalog.btrim(coalesce(p_alt_text, v_asset.alt_text, '')), ''),
    v_account_id, null
  ) on conflict (media_asset_id, reference_type, owner_id, purpose, position) do update
  set alt_text = excluded.alt_text,
      version = public.media_references.version + 1,
      deleted_at = null
  returning * into v_reference;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.media_linked',
    'media_reference', v_reference.id, p_idempotency_key,
    pg_catalog.jsonb_build_object('deckId', v_deck_id)
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'media.link', 'media_reference', v_reference.id,
    pg_catalog.jsonb_build_object('version', v_reference.version)
  );
  return v_reference;
end;
$function$;

create or replace function public.current_release_media_reference(
  p_media_reference_id uuid,
  p_idempotency_key uuid
)
returns public.media_references
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_reference public.media_references;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'media.release');
  if v_receipt.idempotency_key is not null then
    select * into strict v_reference from public.media_references where id = v_receipt.resource_id;
    return v_reference;
  end if;
  select * into v_reference from public.media_references as reference
  where reference.id = p_media_reference_id and reference.deleted_at is null
  for update;
  if not found or not private.can_edit_deck(v_account_id, v_reference.deck_id) then
    raise exception using errcode = '42501', message = 'media reference is unavailable';
  end if;
  update public.media_references
  set deleted_at = pg_catalog.now(), version = version + 1
  where id = p_media_reference_id returning * into v_reference;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.media_released',
    'media_reference', v_reference.id, p_idempotency_key, '{}'::jsonb
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'media.release', 'media_reference', v_reference.id,
    pg_catalog.jsonb_build_object('version', v_reference.version)
  );
  return v_reference;
end;
$function$;

create or replace function private.can_read_content_media_object(
  p_account_id uuid,
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_bucket_id = 'lumen-content-media' and exists(
    select 1 from public.media_assets as asset
    where asset.storage_bucket = p_bucket_id
      and asset.storage_path = p_object_name
      and asset.status = 'ready'
      and (
        (
          private.has_current_content_context(p_account_id)
          and (
            asset.owner_account_id = p_account_id
            or exists(
              select 1 from public.media_references as reference
              where reference.media_asset_id = asset.id
                and reference.deleted_at is null
                and private.can_view_deck(p_account_id, reference.deck_id)
            )
          )
        )
        or exists(
          select 1 from public.media_publications as publication
          join public.deck_publications as deck
            on deck.public_id = publication.deck_public_id
          where publication.media_public_id = asset.public_id
            and publication.storage_bucket = p_bucket_id
            and publication.storage_path = p_object_name
            and deck.visibility = 'public'
        )
      )
  );
$function$;

create or replace function private.can_write_content_media_object(
  p_account_id uuid,
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_bucket_id = 'lumen-content-media'
    and private.has_current_content_context(p_account_id)
    and exists(
      select 1 from public.media_assets as asset
      where asset.owner_account_id = p_account_id
        and asset.storage_bucket = p_bucket_id
        and asset.storage_path = p_object_name
        and (
          asset.status = 'pending'
          or (asset.status = 'ready' and asset.reference_count = 0)
        )
    );
$function$;

revoke all on function private.adjust_media_reference_count() from public, anon, authenticated, service_role;
revoke all on function private.can_read_content_media_object(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.can_write_content_media_object(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function private.can_read_content_media_object(uuid, text, text) to anon, authenticated;
grant execute on function private.can_write_content_media_object(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lumen-content-media', 'lumen-content-media', false, 10485760,
  array[
    'image/jpeg','image/png','image/webp',
    'audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy content_media_read on storage.objects
for select to anon, authenticated
using (private.can_read_content_media_object((select auth.uid()), bucket_id, name));
create policy content_media_insert on storage.objects
for insert to authenticated
with check (private.can_write_content_media_object((select auth.uid()), bucket_id, name));
create policy content_media_update on storage.objects
for update to authenticated
using (private.can_write_content_media_object((select auth.uid()), bucket_id, name))
with check (private.can_write_content_media_object((select auth.uid()), bucket_id, name));
create policy content_media_delete on storage.objects
for delete to authenticated
using (private.can_write_content_media_object((select auth.uid()), bucket_id, name));

create or replace function public.current_publish_deck(
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
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_profile public.profiles;
  v_cover_public_id uuid;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.publish');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  if p_visibility not in ('public', 'unlisted') then
    raise exception using errcode = '22023', message = 'published visibility must be public or unlisted';
  end if;
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or not private.can_manage_deck(v_account_id, p_deck_id)
    or v_deck.status <> 'active' then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  if v_deck.version <> p_expected_version then
    perform private.raise_content_conflict('deck', p_deck_id, p_expected_version, v_deck.version);
  end if;
  if not exists(
    select 1 from public.cards as card
    join public.notes as note on note.id = card.note_id
    where note.deck_id = p_deck_id and note.deleted_at is null
      and card.active and card.deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'a deck must contain an active card before publication';
  end if;
  if exists(
    with referenced_assets as (
      select v_deck.cover_asset_id as media_asset_id where v_deck.cover_asset_id is not null
      union select reference.media_asset_id from public.media_references as reference
        where reference.deck_id = p_deck_id and reference.deleted_at is null
      union select prompt.media_asset_id from public.audio_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where note.deck_id = p_deck_id and note.deleted_at is null
          and prompt.deleted_at is null and prompt.media_asset_id is not null
      union select prompt.reference_asset_id from public.pronunciation_prompts as prompt
        join public.notes as note on note.id = prompt.note_id
        where note.deck_id = p_deck_id and note.deleted_at is null
          and prompt.deleted_at is null and prompt.reference_asset_id is not null
      union select layer.media_asset_id from public.drawing_reference_layers as layer
        join public.notes as note on note.id = layer.note_id
        where note.deck_id = p_deck_id and note.deleted_at is null
          and layer.deleted_at is null and layer.media_asset_id is not null
    )
    select 1 from referenced_assets as referenced
    left join public.media_assets as asset on asset.id = referenced.media_asset_id
    where asset.id is null or asset.status <> 'ready' or not asset.magic_verified
  ) then
    raise exception using errcode = '22023', message = 'all published media must be verified';
  end if;
  if exists(
    with image_assets as (
      select asset.id, asset.alt_text
      from public.media_assets as asset
      where asset.id = v_deck.cover_asset_id and asset.kind = 'image'
      union
      select asset.id, coalesce(reference.alt_text, asset.alt_text)
      from public.media_references as reference
      join public.media_assets as asset on asset.id = reference.media_asset_id
      where reference.deck_id = p_deck_id and reference.deleted_at is null and asset.kind = 'image'
      union
      select asset.id, asset.alt_text
      from public.drawing_reference_layers as layer
      join public.notes as note on note.id = layer.note_id
      join public.media_assets as asset on asset.id = layer.media_asset_id
      where note.deck_id = p_deck_id and note.deleted_at is null
        and layer.deleted_at is null and asset.kind = 'image'
    )
    select 1 from image_assets where pg_catalog.btrim(coalesce(alt_text, '')) = ''
  ) then
    raise exception using errcode = '22023', message = 'published images require alternative text';
  end if;
  select * into strict v_profile from public.profiles where id = v_deck.owner_account_id;
  if v_deck.cover_asset_id is not null then
    select public_id into v_cover_public_id from public.media_assets where id = v_deck.cover_asset_id;
  end if;

  delete from public.deck_publications where public_id = v_deck.public_id;
  update public.decks
  set visibility = p_visibility,
      published_version = current_version,
      published_at = pg_catalog.now(),
      version = version + 1
  where id = p_deck_id returning * into v_deck;
  insert into public.deck_publications (
    public_id, slug, visibility, title, description_doc, description_plain,
    creator_handle, creator_display_name, license, theme, language_front,
    language_back, cover_media_public_id, published_version, card_count,
    card_kinds, content_hash, published_at
  ) values (
    v_deck.public_id, v_deck.slug, v_deck.visibility, v_deck.title,
    v_deck.description_doc, v_deck.description_plain,
    coalesce(v_profile.handle::text, 'creator'), coalesce(v_profile.display_name, 'Creator'),
    v_deck.license, v_deck.theme, v_deck.language_front, v_deck.language_back,
    v_cover_public_id, v_deck.current_version, v_deck.card_count,
    coalesce((
      select pg_catalog.array_agg(distinct card.card_kind order by card.card_kind)
      from public.cards as card join public.notes as note on note.id = card.note_id
      where note.deck_id = p_deck_id and note.deleted_at is null
        and card.active and card.deleted_at is null
    ), '{}'::public.card_kind[]),
    v_deck.content_hash, v_deck.published_at
  );
  insert into public.card_publications (
    deck_public_id, card_public_id, ordinal, card_kind, generation_key,
    template_key, front_template, back_template, styling_css,
    field_values, card_payload, source_references, content_hash, published_at
  )
  select
    v_deck.public_id,
    card.id,
    (pg_catalog.row_number() over (
      order by note.created_at, note.id, card.ordinal, card.id
    ) - 1)::integer,
    card.card_kind,
    card.generation_key,
    template.template_key,
    template.front_template,
    template.back_template,
    template.styling_css,
    coalesce((
      select pg_catalog.jsonb_object_agg(
        field.field_key,
        pg_catalog.jsonb_build_object(
          'doc', field_value.value_doc,
          'plainText', field_value.plain_text,
          'normalizedText', field_value.normalized_text,
          'position', field_value.position
        ) order by field.position
      )
      from public.note_field_values as field_value
      join public.note_type_fields as field on field.id = field_value.field_id
      where field_value.note_id = note.id and field_value.deleted_at is null
    ), '{}'::jsonb),
    note.card_payload,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'semanticKey', source.semantic_key,
          'citationDoc', source.citation_doc,
          'title', source.title,
          'author', source.author,
          'url', source.url,
          'position', source.position
        ) order by source.position, source.id
      ) from public.source_references as source
      where source.note_id = note.id and source.deleted_at is null
    ), '[]'::jsonb),
    note.content_hash,
    v_deck.published_at
  from public.cards as card
  join public.notes as note on note.id = card.note_id
  join public.card_templates as template on template.id = card.template_id
  where note.deck_id = p_deck_id and note.deleted_at is null
    and card.active and card.deleted_at is null;
  insert into public.media_publications (
    deck_public_id, media_public_id, kind, mime_type, byte_size,
    width, height, duration_ms, storage_bucket, storage_path,
    alt_text, published_at
  )
  select distinct on (asset.public_id)
    v_deck.public_id, asset.public_id, asset.kind, asset.mime_type, asset.byte_size,
    asset.width, asset.height, asset.duration_ms, asset.storage_bucket,
    asset.storage_path, coalesce(reference.alt_text, asset.alt_text), v_deck.published_at
  from public.media_assets as asset
  left join public.media_references as reference
    on reference.media_asset_id = asset.id and reference.deck_id = p_deck_id
      and reference.deleted_at is null
  where asset.status = 'ready' and (
    asset.id = v_deck.cover_asset_id
    or reference.id is not null
    or exists(
      select 1 from public.audio_prompts as prompt
      join public.notes as note on note.id = prompt.note_id
      where note.deck_id = p_deck_id and note.deleted_at is null
        and prompt.deleted_at is null and prompt.media_asset_id = asset.id
    )
    or exists(
      select 1 from public.pronunciation_prompts as prompt
      join public.notes as note on note.id = prompt.note_id
      where note.deck_id = p_deck_id and note.deleted_at is null
        and prompt.deleted_at is null and prompt.reference_asset_id = asset.id
    )
    or exists(
      select 1 from public.drawing_reference_layers as layer
      join public.notes as note on note.id = layer.note_id
      where note.deck_id = p_deck_id and note.deleted_at is null
        and layer.deleted_at is null and layer.media_asset_id = asset.id
    )
  )
  order by asset.public_id, reference.position nulls last;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_published',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'visibility', v_deck.visibility, 'publishedVersion', v_deck.published_version
    )
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.publish', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object(
      'version', v_deck.version, 'publishedVersion', v_deck.published_version,
      'publicId', v_deck.public_id
    )
  );
  return v_deck;
end;
$function$;

create or replace function public.current_unpublish_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck.unpublish');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or not private.can_manage_deck(v_account_id, p_deck_id) then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  if v_deck.version <> p_expected_version then
    perform private.raise_content_conflict('deck', p_deck_id, p_expected_version, v_deck.version);
  end if;
  delete from public.deck_publications where public_id = v_deck.public_id;
  update public.decks
  set visibility = 'private', published_version = null, published_at = null,
      version = version + 1
  where id = p_deck_id returning * into v_deck;
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_unpublished',
    'deck', v_deck.id, p_idempotency_key, '{}'::jsonb
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck.unpublish', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object('version', v_deck.version)
  );
  return v_deck;
end;
$function$;

create or replace function public.get_public_deck(p_public_id uuid)
returns table (
  public_id uuid, slug text, visibility public.deck_visibility, title text,
  description_doc jsonb, description_plain text, creator_handle text,
  creator_display_name text, license public.deck_license, theme text,
  language_front text, language_back text, cover_media_public_id uuid,
  published_version bigint, card_count integer, card_kinds public.card_kind[],
  content_hash text, published_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    publication.public_id, publication.slug, publication.visibility,
    publication.title, publication.description_doc, publication.description_plain,
    publication.creator_handle, publication.creator_display_name, publication.license,
    publication.theme, publication.language_front, publication.language_back,
    publication.cover_media_public_id, publication.published_version,
    publication.card_count, publication.card_kinds, publication.content_hash,
    publication.published_at, publication.updated_at
  from public.deck_publications as publication
  where publication.public_id = p_public_id
    and publication.visibility in ('public', 'unlisted');
$function$;

create or replace function public.get_public_deck_by_slug(p_slug text)
returns table (
  public_id uuid, slug text, visibility public.deck_visibility, title text,
  description_doc jsonb, description_plain text, creator_handle text,
  creator_display_name text, license public.deck_license, theme text,
  language_front text, language_back text, cover_media_public_id uuid,
  published_version bigint, card_count integer, card_kinds public.card_kind[],
  content_hash text, published_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from public.get_public_deck(
    (select publication.public_id from public.deck_publications as publication
      where publication.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
        and publication.visibility in ('public', 'unlisted') limit 1)
  );
$function$;

create or replace function public.get_public_deck_cards(p_public_id uuid)
returns table (
  card_public_id uuid, ordinal integer, card_kind public.card_kind,
  generation_key text, template_key text, front_template text,
  back_template text, styling_css text, field_values jsonb,
  card_payload jsonb, source_references jsonb, content_hash text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    card.card_public_id, card.ordinal, card.card_kind, card.generation_key,
    card.template_key, card.front_template, card.back_template,
    card.styling_css, card.field_values, card.card_payload,
    card.source_references, card.content_hash, card.published_at
  from public.card_publications as card
  where card.deck_public_id = p_public_id
    and exists(
      select 1 from public.deck_publications as publication
      where publication.public_id = p_public_id
        and publication.visibility in ('public', 'unlisted')
    )
  order by card.ordinal, card.card_public_id;
$function$;

create or replace function public.get_public_deck_media(p_public_id uuid)
returns table (
  media_public_id uuid, kind public.media_kind, mime_type text, byte_size bigint,
  width integer, height integer, duration_ms integer, storage_bucket text,
  storage_path text, alt_text text, published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    media.media_public_id, media.kind, media.mime_type, media.byte_size,
    media.width, media.height, media.duration_ms, media.storage_bucket,
    media.storage_path, media.alt_text, media.published_at
  from public.media_publications as media
  where media.deck_public_id = p_public_id
    and exists(
      select 1 from public.deck_publications as publication
      where publication.public_id = p_public_id
        and publication.visibility in ('public', 'unlisted')
    )
  order by media.media_public_id;
$function$;

create or replace function public.current_restore_deck_version(
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
  v_account_id uuid := private.assert_active_content_actor();
  v_receipt private.content_mutation_receipts;
  v_deck public.decks;
  v_target public.deck_versions;
  v_note_snapshot jsonb;
  v_field_snapshot jsonb;
  v_note public.notes;
  v_note_id uuid;
  v_note_type_id uuid;
  v_tag_name text;
  v_tag public.tags;
  v_source_payload jsonb;
begin
  v_receipt := private.get_content_receipt(v_account_id, p_idempotency_key, 'deck_version.restore');
  if v_receipt.idempotency_key is not null then
    select * into strict v_deck from public.decks where id = v_receipt.resource_id;
    return v_deck;
  end if;
  select * into v_deck from public.decks as deck where deck.id = p_deck_id for update;
  if not found or not private.can_manage_deck(v_account_id, p_deck_id)
    or v_deck.status <> 'active' then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  if v_deck.version <> p_expected_version then
    perform private.raise_content_conflict('deck', p_deck_id, p_expected_version, v_deck.version);
  end if;
  select * into v_target from public.deck_versions as deck_version
  where deck_version.deck_id = p_deck_id
    and deck_version.version_number = p_version_number;
  if not found then
    raise exception using errcode = '22023', message = 'deck version is unavailable';
  end if;

  for v_note in
    select * from public.notes as note where note.deck_id = p_deck_id and note.deleted_at is null
  loop
    perform private.record_note_revision(
      v_note.id, v_account_id, 'deck_version_restore', extensions.gen_random_uuid()
    );
  end loop;
  update public.notes
  set deleted_at = pg_catalog.now(), updated_by = v_account_id, version = version + 1
  where deck_id = p_deck_id and deleted_at is null;
  update public.cards as card
  set active = false, deactivated_at = pg_catalog.now(), version = card.version + 1
  where card.note_id in (select note.id from public.notes as note where note.deck_id = p_deck_id)
    and card.active;

  for v_note_snapshot in
    select value from pg_catalog.jsonb_array_elements(v_target.content_snapshot -> 'notes')
  loop
    v_note_id := (v_note_snapshot ->> 'id')::uuid;
    v_note_type_id := (v_note_snapshot ->> 'noteTypeId')::uuid;
    if not exists(select 1 from public.note_types where id = v_note_type_id) then
      raise exception using errcode = '55000', message = 'version references an unavailable note type';
    end if;
    insert into public.notes (
      id, deck_id, note_type_id, created_by, updated_by, version,
      sort_text, content_hash, source_reference, metadata, card_payload,
      created_at, deleted_at
    ) values (
      v_note_id, p_deck_id, v_note_type_id, v_account_id, v_account_id, 1,
      coalesce(v_note_snapshot ->> 'sortText', ''),
      v_note_snapshot ->> 'contentHash', v_note_snapshot ->> 'sourceReference',
      coalesce(v_note_snapshot -> 'metadata', '{}'::jsonb),
      coalesce(v_note_snapshot -> 'cardPayload', '{}'::jsonb),
      coalesce((v_note_snapshot ->> 'createdAt')::timestamptz, pg_catalog.now()), null
    ) on conflict (id) do update
    set deck_id = excluded.deck_id,
        note_type_id = excluded.note_type_id,
        updated_by = v_account_id,
        version = public.notes.version + 1,
        sort_text = excluded.sort_text,
        content_hash = excluded.content_hash,
        source_reference = excluded.source_reference,
        metadata = excluded.metadata,
        card_payload = excluded.card_payload,
        deleted_at = null
    returning * into v_note;

    update public.note_field_values set deleted_at = pg_catalog.now(), version = version + 1
    where note_id = v_note.id and deleted_at is null;
    for v_field_snapshot in
      select value from pg_catalog.jsonb_array_elements(v_note_snapshot -> 'fields')
    loop
      insert into public.note_field_values (
        id, note_id, field_id, value_doc, plain_text,
        normalized_text, position, version, deleted_at
      ) values (
        coalesce((v_field_snapshot ->> 'id')::uuid, extensions.gen_random_uuid()),
        v_note.id, (v_field_snapshot ->> 'fieldId')::uuid,
        v_field_snapshot -> 'valueDoc', coalesce(v_field_snapshot ->> 'plainText', ''),
        coalesce(v_field_snapshot ->> 'normalizedText', ''),
        coalesce((v_field_snapshot ->> 'position')::integer, 0), 1, null
      ) on conflict (note_id, field_id) do update
      set value_doc = excluded.value_doc,
          plain_text = excluded.plain_text,
          normalized_text = excluded.normalized_text,
          position = excluded.position,
          version = public.note_field_values.version + 1,
          deleted_at = null;
    end loop;

    update public.note_tags set deleted_at = pg_catalog.now()
    where note_id = v_note.id and deleted_at is null;
    for v_tag_name in
      select value #>> '{}' from pg_catalog.jsonb_array_elements(v_note_snapshot -> 'tagNames')
    loop
      insert into public.tags (deck_id, name, normalized_name)
      values (
        p_deck_id, v_tag_name,
        pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_tag_name), '[[:space:]]+', ' ', 'g'))
      ) on conflict (deck_id, normalized_name) where deleted_at is null
      do update set name = excluded.name returning * into v_tag;
      insert into public.note_tags (note_id, tag_id, created_by, deleted_at)
      values (v_note.id, v_tag.id, v_account_id, null)
      on conflict (note_id, tag_id) do update set deleted_at = null;
    end loop;
    v_source_payload := coalesce(v_note.card_payload, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'sourceReferences', coalesce(v_note_snapshot -> 'sourceReferences', '[]'::jsonb)
      );
    perform private.persist_specialized_card_payload(
      v_note.id,
      (select note_type.code from public.note_types as note_type where note_type.id = v_note.note_type_id),
      v_source_payload,
      v_account_id
    );
    perform private.reconcile_generated_cards(v_note.id, v_note.note_type_id, v_note.version);
  end loop;

  update public.decks
  set title = v_target.deck_snapshot ->> 'title',
      description_doc = v_target.deck_snapshot -> 'descriptionDoc',
      description_plain = coalesce(v_target.deck_snapshot ->> 'descriptionPlain', ''),
      license = (v_target.deck_snapshot ->> 'license')::public.deck_license,
      theme = coalesce(v_target.deck_snapshot ->> 'theme', 'neutral'),
      language_front = v_target.deck_snapshot ->> 'languageFront',
      language_back = v_target.deck_snapshot ->> 'languageBack',
      cover_asset_id = case
        when nullif(v_target.deck_snapshot ->> 'coverAssetId', '') is not null
          and exists(select 1 from public.media_assets where id = (v_target.deck_snapshot ->> 'coverAssetId')::uuid)
          then (v_target.deck_snapshot ->> 'coverAssetId')::uuid
        else null
      end,
      default_note_type_id = (v_target.deck_snapshot ->> 'defaultNoteTypeId')::uuid
  where id = p_deck_id;
  v_deck := private.bump_deck_content_version(
    p_deck_id, v_account_id, 'deck_version_restored',
    'Restored deck content version ' || p_version_number::text,
    p_idempotency_key, p_version_number
  );
  perform private.write_audit_event(
    'account', v_account_id, null, null, 'content.deck_version_restored',
    'deck', v_deck.id, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'restoredFromVersion', p_version_number,
      'newContentVersion', v_deck.current_version
    )
  );
  perform private.record_content_receipt(
    v_account_id, p_idempotency_key, 'deck_version.restore', 'deck', v_deck.id,
    pg_catalog.jsonb_build_object(
      'version', v_deck.version, 'contentVersion', v_deck.current_version,
      'restoredFromVersion', p_version_number
    )
  );
  return v_deck;
end;
$function$;

create or replace function public.current_get_deck_media(p_deck_id uuid)
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
  alt_text text,
  status public.media_status,
  reference_id uuid,
  reference_type public.media_reference_type,
  purpose public.media_reference_purpose,
  reference_position integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
begin
  if not private.can_view_deck(v_account_id, p_deck_id) then
    raise exception using errcode = '42501', message = 'deck is unavailable';
  end if;
  return query
  select
    asset.id, asset.public_id, asset.kind, asset.mime_type, asset.byte_size,
    asset.width, asset.height, asset.duration_ms, asset.storage_bucket,
    asset.storage_path, coalesce(reference.alt_text, asset.alt_text), asset.status,
    reference.id, reference.reference_type, reference.purpose, reference.position
  from public.media_references as reference
  join public.media_assets as asset on asset.id = reference.media_asset_id
  where reference.deck_id = p_deck_id and reference.deleted_at is null
    and asset.status = 'ready'
  order by reference.position, reference.id;
end;
$function$;

-- Phase 01 owns the service-only account-deletion worker. Extend that worker's
-- guarded pending_deletion -> deleted profile transition so Phase 02 content is
-- unpublished and minimized in the same transaction. Durable row identities
-- and history coordinates remain available to audit/ledger references, but no
-- user-authored deck, note, template, citation, or media metadata survives.
create or replace function private.guard_content_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject uuid;
begin
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

drop trigger note_revisions_append_only on public.note_revisions;
create trigger note_revisions_append_only
before update or delete on public.note_revisions
for each row execute function private.guard_content_history_mutation();

drop trigger deck_versions_append_only on public.deck_versions;
create trigger deck_versions_append_only
before update or delete on public.deck_versions
for each row execute function private.guard_content_history_mutation();

create or replace function private.tombstone_account_content(
  p_account_id uuid,
  p_deleted_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_empty_hash text := pg_catalog.encode(
    extensions.digest('{}'::text, 'sha256'),
    'hex'
  );
  v_empty_content_hash text := pg_catalog.encode(
    extensions.digest('{"schemaVersion":1,"notes":[]}'::text, 'sha256'),
    'hex'
  );
begin
  if p_account_id is null
    or p_deleted_at is null
    or pg_catalog.current_setting('lumen.account_deletion_subject', true)
      is distinct from p_account_id::text then
    raise exception using errcode = '42501', message = 'content deletion context is unavailable';
  end if;

  -- A publication using an owned asset is withdrawn even if the publication
  -- belongs to a collaborator. It must never retain a path to pending deletion.
  delete from public.deck_publications as publication
  where exists(
      select 1 from public.decks as deck
      where deck.public_id = publication.public_id
        and deck.owner_account_id = p_account_id
    )
    or exists(
      select 1
      from public.media_publications as media_publication
      join public.media_assets as asset
        on asset.public_id = media_publication.media_public_id
      where media_publication.deck_public_id = publication.public_id
        and asset.owner_account_id = p_account_id
    );

  update public.media_references as reference
  set alt_text = null,
      version = reference.version + 1,
      deleted_at = coalesce(reference.deleted_at, p_deleted_at)
  where reference.deleted_at is null
    and (
      exists(
        select 1 from public.decks as deck
        where deck.id = reference.deck_id and deck.owner_account_id = p_account_id
      )
      or exists(
        select 1 from public.media_assets as asset
        where asset.id = reference.media_asset_id and asset.owner_account_id = p_account_id
      )
    );

  update public.deck_members as member
  set revoked_at = coalesce(member.revoked_at, p_deleted_at),
      version = member.version + 1
  where member.revoked_at is null
    and (
      member.account_id = p_account_id
      or exists(
        select 1 from public.decks as deck
        where deck.id = member.deck_id and deck.owner_account_id = p_account_id
      )
    );

  update public.folder_items as item
  set deleted_at = coalesce(item.deleted_at, p_deleted_at),
      version = item.version + 1
  where item.deleted_at is null
    and exists(
      select 1 from public.decks as deck
      where deck.id = item.deck_id and deck.owner_account_id = p_account_id
    );

  update public.note_tags as note_tag
  set deleted_at = coalesce(note_tag.deleted_at, p_deleted_at)
  where note_tag.deleted_at is null
    and exists(
      select 1
      from public.notes as note
      join public.decks as deck on deck.id = note.deck_id
      where note.id = note_tag.note_id and deck.owner_account_id = p_account_id
    );

  update public.card_choices as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      content_doc = '{}'::jsonb,
      plain_text = '',
      feedback_doc = null,
      is_correct = false,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.cloze_definitions as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      ranges = '[{"from":0,"to":1}]'::jsonb,
      hint = null,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.image_occlusions as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      group_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      geometry_kind = 'rectangle',
      geometry = '{"type":"rectangle","x":0,"y":0,"width":1,"height":1}'::jsonb,
      label = 'Deleted region',
      alt_text = null,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.diagram_hotspots as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      geometry_kind = 'rectangle',
      geometry = '{"type":"rectangle","x":0,"y":0,"width":1,"height":1}'::jsonb,
      label = 'Deleted region',
      aliases = '{}'::text[],
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.ordering_items as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      content_doc = '{}'::jsonb,
      plain_text = '',
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.list_answer_items as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      answer = 'Deleted answer',
      aliases = '{}'::text[],
      required = false,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.audio_prompts as child
  set media_asset_id = null,
      transcript = '',
      answer = '',
      tts_language = null,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.pronunciation_prompts as child
  set text = 'Deleted prompt',
      language = 'und',
      reference_asset_id = null,
      tts_allowed = true,
      fallback_answer = null,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.drawing_reference_layers as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      media_asset_id = null,
      strokes = '[]'::jsonb,
      opacity = 0,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.source_references as child
  set semantic_key = 'deleted_' || pg_catalog.replace(child.id::text, '-', ''),
      citation_doc = '{}'::jsonb,
      title = null,
      author = null,
      url = null,
      version = child.version + 1,
      deleted_at = coalesce(child.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = child.note_id and deck.owner_account_id = p_account_id
  );

  update public.note_field_values as field_value
  set value_doc = '{}'::jsonb,
      plain_text = '',
      normalized_text = '',
      version = field_value.version + 1,
      deleted_at = coalesce(field_value.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = field_value.note_id and deck.owner_account_id = p_account_id
  );

  update public.cards as card
  set generation_key = 'g1:deleted:' || pg_catalog.replace(card.id::text, '-', ''),
      active = false,
      deactivated_at = coalesce(card.deactivated_at, p_deleted_at),
      version = card.version + 1,
      deleted_at = coalesce(card.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.notes as note join public.decks as deck on deck.id = note.deck_id
    where note.id = card.note_id and deck.owner_account_id = p_account_id
  );

  update public.note_revisions as revision
  set note_snapshot = '{"deleted":true}'::jsonb,
      fields_snapshot = '[]'::jsonb,
      card_payload_snapshot = '{}'::jsonb,
      content_hash = v_empty_hash
  where exists(
    select 1 from public.decks as deck
    where deck.id = revision.deck_id and deck.owner_account_id = p_account_id
  );

  update public.deck_versions as deck_version
  set summary = 'Account content deleted',
      deck_snapshot = '{"deleted":true}'::jsonb,
      content_snapshot = '{"schemaVersion":1,"notes":[]}'::jsonb,
      content_hash = v_empty_content_hash
  where exists(
    select 1 from public.decks as deck
    where deck.id = deck_version.deck_id and deck.owner_account_id = p_account_id
  );

  update public.content_change_impacts as impact
  set affected_generation_keys = '{}'::text[],
      resolution = case when impact.resolution = 'pending' then 'preserve' else impact.resolution end,
      resolved_at = case when impact.resolution = 'pending' then p_deleted_at else impact.resolved_at end
  where exists(
    select 1 from public.decks as deck
    where deck.id = impact.deck_id and deck.owner_account_id = p_account_id
  );

  update public.notes as note
  set sort_text = '',
      content_hash = v_empty_hash,
      source_reference = null,
      metadata = '{}'::jsonb,
      card_payload = '{}'::jsonb,
      version = note.version + 1,
      deleted_at = coalesce(note.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.decks as deck
    where deck.id = note.deck_id and deck.owner_account_id = p_account_id
  );

  update public.tags as tag
  set parent_tag_id = null,
      name = 'Deleted tag ' || pg_catalog.left(tag.id::text, 8),
      normalized_name = 'deleted-' || pg_catalog.replace(tag.id::text, '-', ''),
      color = null,
      version = tag.version + 1,
      deleted_at = coalesce(tag.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.decks as deck
    where deck.id = tag.deck_id and deck.owner_account_id = p_account_id
  );

  update public.folders as folder
  set parent_id = null,
      name = 'Deleted folder',
      status = 'deleted',
      version = folder.version + 1,
      deleted_at = coalesce(folder.deleted_at, p_deleted_at)
  where folder.owner_account_id = p_account_id;

  update public.card_templates as template
  set template_key = 'deleted_' || pg_catalog.replace(template.id::text, '-', ''),
      name = 'Deleted template',
      generation_condition = null,
      front_template = '{{Deleted}}',
      back_template = '{{Deleted}}',
      styling_css = null,
      answer_field_key = null,
      version = template.version + 1,
      deleted_at = coalesce(template.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.note_types as note_type
    where note_type.id = template.note_type_id
      and note_type.owner_account_id = p_account_id
  );

  update public.note_type_fields as field
  set field_key = 'Deleted_' || pg_catalog.replace(field.id::text, '-', ''),
      label = 'Deleted field',
      language = null,
      grading_settings = '{}'::jsonb,
      display_settings = '{}'::jsonb,
      version = field.version + 1,
      deleted_at = coalesce(field.deleted_at, p_deleted_at)
  where exists(
    select 1 from public.note_types as note_type
    where note_type.id = field.note_type_id
      and note_type.owner_account_id = p_account_id
  );

  update public.note_types as note_type
  set display_name = 'Deleted note type',
      description = '',
      template_policy = '{}'::jsonb,
      version = note_type.version + 1,
      deleted_at = coalesce(note_type.deleted_at, p_deleted_at)
  where note_type.owner_account_id = p_account_id and not note_type.is_system;

  update public.decks as deck
  set title = 'Deleted deck ' || pg_catalog.left(deck.id::text, 8),
      slug = 'deleted-' || pg_catalog.replace(deck.id::text, '-', ''),
      description_doc = '{}'::jsonb,
      description_plain = '',
      visibility = 'private',
      license = 'all_rights_reserved',
      language_front = null,
      language_back = null,
      cover_asset_id = null,
      source_deck_id = null,
      fork_mode = null,
      published_version = null,
      published_at = null,
      archived_at = null,
      note_count = 0,
      card_count = 0,
      content_hash = v_empty_content_hash,
      theme = 'neutral',
      status = 'deleted',
      version = deck.version + 1,
      deleted_at = coalesce(deck.deleted_at, p_deleted_at)
  where deck.owner_account_id = p_account_id;

  update public.media_assets as asset
  set status = 'deleting',
      reference_count = 0,
      alt_text = null,
      metadata = '{}'::jsonb,
      version = asset.version + 1,
      delete_after = p_deleted_at
  where asset.owner_account_id = p_account_id and asset.status <> 'deleted';

  delete from private.content_mutation_receipts as receipt
  where receipt.account_id = p_account_id;
end;
$function$;

create or replace function private.extend_account_deletion_to_content()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if old.account_status <> 'deleted' and new.account_status = 'deleted' then
    if old.account_status not in ('pending_deletion', 'onboarding')
      or pg_catalog.current_setting('lumen.account_deletion_subject', true)
        is distinct from new.id::text then
      raise exception using errcode = '42501', message = 'content deletion requires the due deletion worker';
    end if;
    perform private.tombstone_account_content(new.id, coalesce(new.deleted_at, pg_catalog.now()));
  end if;
  return new;
end;
$function$;

create trigger profiles_extend_account_deletion_to_content
before update of account_status on public.profiles
for each row execute function private.extend_account_deletion_to_content();

revoke all on function private.guard_content_history_mutation()
from public, anon, authenticated, service_role;
revoke all on function private.tombstone_account_content(uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function private.extend_account_deletion_to_content()
from public, anon, authenticated, service_role;

revoke all on function public.current_create_folder(text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_update_folder(uuid, bigint, text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_move_folder(uuid, bigint, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_folder(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_create_note_type(text, text, jsonb, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_update_note_type(uuid, bigint, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_create_deck(text, jsonb, uuid, public.deck_visibility, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_update_deck(uuid, bigint, jsonb, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_archive_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_restore_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_duplicate_deck(uuid, text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_upsert_note(uuid, uuid, text, bigint, jsonb, jsonb, text[], uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_note(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_register_media_asset(text, text, public.media_kind, bigint, integer, integer, integer, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_finalize_media_asset(uuid, uuid, text, text, boolean, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_link_media(uuid, public.media_reference_type, uuid, public.media_reference_purpose, integer, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_release_media_reference(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_publish_deck(uuid, bigint, public.deck_visibility, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_unpublish_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_restore_deck_version(uuid, bigint, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_get_deck_media(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.get_public_deck(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.get_public_deck_by_slug(text)
from public, anon, authenticated, service_role;
revoke all on function public.get_public_deck_cards(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.get_public_deck_media(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.current_create_folder(text, uuid, uuid) to authenticated;
grant execute on function public.current_update_folder(uuid, bigint, text, uuid, uuid) to authenticated;
grant execute on function public.current_move_folder(uuid, bigint, uuid, uuid) to authenticated;
grant execute on function public.current_delete_folder(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_create_note_type(text, text, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.current_update_note_type(uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.current_create_deck(text, jsonb, uuid, public.deck_visibility, uuid) to authenticated;
grant execute on function public.current_update_deck(uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.current_archive_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_restore_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_delete_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_duplicate_deck(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.current_upsert_note(uuid, uuid, text, bigint, jsonb, jsonb, text[], uuid) to authenticated;
grant execute on function public.current_delete_note(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_register_media_asset(text, text, public.media_kind, bigint, integer, integer, integer, text, uuid) to authenticated;
grant execute on function public.current_link_media(uuid, public.media_reference_type, uuid, public.media_reference_purpose, integer, text, uuid) to authenticated;
grant execute on function public.current_release_media_reference(uuid, uuid) to authenticated;
grant execute on function public.current_publish_deck(uuid, bigint, public.deck_visibility, uuid) to authenticated;
grant execute on function public.current_unpublish_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_restore_deck_version(uuid, bigint, bigint, uuid) to authenticated;
grant execute on function public.current_get_deck_media(uuid) to authenticated;
grant execute on function public.admin_finalize_media_asset(uuid, uuid, text, text, boolean, uuid) to service_role;
grant execute on function public.get_public_deck(uuid) to anon, authenticated;
grant execute on function public.get_public_deck_by_slug(text) to anon, authenticated;
grant execute on function public.get_public_deck_cards(uuid) to anon, authenticated;
grant execute on function public.get_public_deck_media(uuid) to anon, authenticated;

revoke all on public.published_decks, public.published_cards, public.published_media
from public, anon, authenticated, service_role;
grant select on public.published_decks, public.published_cards, public.published_media
to anon, authenticated;

revoke all privileges on all tables in schema public from service_role;
revoke all privileges on all sequences in schema public from service_role;
revoke all privileges on all tables in schema private from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema private from public, anon, authenticated, service_role;

comment on function public.current_upsert_note(uuid, uuid, text, bigint, jsonb, jsonb, text[], uuid) is
  'Actor-derived atomic note upsert. p_card_payload is a closed transport object with authoringData, optional sourceReference, and optional sourceReferences; only authoringData is stored in notes.card_payload.';
comment on function public.current_publish_deck(uuid, bigint, public.deck_visibility, uuid) is
  'Freezes safe deck/card/media projections at the current content version; later draft edits do not mutate the published snapshot.';
comment on function public.get_public_deck(uuid) is
  'Exact opaque-ID lookup for public or unlisted frozen deck metadata. Does not enumerate unlisted content.';

commit;
