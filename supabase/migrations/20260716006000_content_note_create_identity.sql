-- Give browser-created notes a deterministic identity before entering the
-- legacy upsert implementation. Besides making create retries stable, this
-- prevents a NULL note id from inheriting PL/pgSQL FOUND state from the
-- preceding note-type lookup and being misclassified as an update.

begin;

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
begin
  perform private.require_content_expected_version(p_expected_version);
  return private.content_upsert_note_with_media_unchecked(
    p_deck_id,
    coalesce(p_note_id, p_idempotency_key),
    p_note_type_code,
    p_expected_version,
    p_fields,
    p_card_payload,
    p_tags,
    p_media_links,
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) to authenticated;

comment on function public.current_upsert_note_with_media(
  uuid, uuid, text, bigint, jsonb, jsonb, text[], jsonb, uuid
) is 'Atomic browser note/media boundary; creation derives a stable note id from its required idempotency key.';

commit;
