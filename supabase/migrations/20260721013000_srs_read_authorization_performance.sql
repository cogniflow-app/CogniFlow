-- Evaluate read authorization as reusable sets instead of repeating
-- security-definer permission functions for every card in a large queue.

create or replace function private.current_viewable_deck_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select deck.id
  from public.decks as deck
  where private.has_current_content_context((select auth.uid()))
    and deck.status <> 'deleted'
    and (
      deck.owner_account_id = (select auth.uid())
      or exists(
        select 1
        from public.deck_members as member
        where member.deck_id = deck.id
          and member.account_id = (select auth.uid())
          and member.revoked_at is null
      )
    );
$function$;

create or replace function private.current_viewable_note_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select note.id
  from public.notes as note
  where note.deck_id in (select private.current_viewable_deck_ids());
$function$;

create or replace function private.current_viewable_card_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select card.id
  from public.cards as card
  where card.note_id in (select private.current_viewable_note_ids());
$function$;

revoke all on function private.current_viewable_deck_ids()
from public, anon, authenticated, service_role;
revoke all on function private.current_viewable_note_ids()
from public, anon, authenticated, service_role;
revoke all on function private.current_viewable_card_ids()
from public, anon, authenticated, service_role;
grant execute on function private.current_viewable_deck_ids() to authenticated;
grant execute on function private.current_viewable_note_ids() to authenticated;
grant execute on function private.current_viewable_card_ids() to authenticated;

drop policy decks_select_authorized on public.decks;
create policy decks_select_authorized on public.decks for select to authenticated using (
  id in (select private.current_viewable_deck_ids())
);

drop policy tags_select_deck_viewer on public.tags;
create policy tags_select_deck_viewer on public.tags for select to authenticated using (
  deck_id in (select private.current_viewable_deck_ids())
);

drop policy notes_select_deck_viewer on public.notes;
create policy notes_select_deck_viewer on public.notes for select to authenticated using (
  id in (select private.current_viewable_note_ids())
);

drop policy note_field_values_select_deck_viewer on public.note_field_values;
create policy note_field_values_select_deck_viewer
on public.note_field_values for select to authenticated using (
  note_id in (select private.current_viewable_note_ids())
);

drop policy note_tags_select_deck_viewer on public.note_tags;
create policy note_tags_select_deck_viewer on public.note_tags for select to authenticated using (
  note_id in (select private.current_viewable_note_ids())
);

drop policy cards_select_deck_viewer on public.cards;
create policy cards_select_deck_viewer on public.cards for select to authenticated using (
  id in (select private.current_viewable_card_ids())
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
    execute pg_catalog.format('drop policy %I on public.%I', v_table || '_select_deck_viewer', v_table);
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (note_id in (select private.current_viewable_note_ids()))',
      v_table || '_select_deck_viewer', v_table
    );
  end loop;
end;
$block$;

drop policy media_references_select_deck_viewer on public.media_references;
create policy media_references_select_deck_viewer
on public.media_references for select to authenticated using (
  deck_id in (select private.current_viewable_deck_ids())
);

drop policy deck_srs_settings_select_authorized on public.deck_srs_settings;
create policy deck_srs_settings_select_authorized
on public.deck_srs_settings for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
  and deck_id in (select private.current_viewable_deck_ids())
);

drop policy card_schedules_select_authorized on public.card_schedules;
create policy card_schedules_select_authorized
on public.card_schedules for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
  and card_id in (select private.current_viewable_card_ids())
);

drop policy review_logs_select_authorized on public.review_logs;
create policy review_logs_select_authorized on public.review_logs for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
  and deck_id in (select private.current_viewable_deck_ids())
);
