begin;

-- PostgREST exposes only named JSON arguments. The original lifecycle wrappers
-- used positional SQL arguments, so recreate the same guarded boundary with
-- stable public parameter names instead of relying on an untyped RPC call.
drop function public.current_archive_deck(uuid, bigint, uuid);
drop function public.current_restore_deck(uuid, bigint, uuid);
drop function public.current_delete_deck(uuid, bigint, uuid);

create function public.current_archive_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language sql
security definer
set search_path = ''
as $function$
  select private.set_deck_lifecycle(
    'archive', p_deck_id, p_expected_version, p_idempotency_key
  );
$function$;

create function public.current_restore_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language sql
security definer
set search_path = ''
as $function$
  select private.set_deck_lifecycle(
    'restore', p_deck_id, p_expected_version, p_idempotency_key
  );
$function$;

create function public.current_delete_deck(
  p_deck_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns public.decks
language sql
security definer
set search_path = ''
as $function$
  select private.set_deck_lifecycle(
    'delete', p_deck_id, p_expected_version, p_idempotency_key
  );
$function$;

revoke all on function public.current_archive_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_restore_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_delete_deck(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.current_archive_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_restore_deck(uuid, bigint, uuid) to authenticated;
grant execute on function public.current_delete_deck(uuid, bigint, uuid) to authenticated;

comment on function public.current_archive_deck(uuid, bigint, uuid)
is 'Actor-derived archive boundary with named PostgREST parameters.';
comment on function public.current_restore_deck(uuid, bigint, uuid)
is 'Actor-derived restore boundary with named PostgREST parameters.';
comment on function public.current_delete_deck(uuid, bigint, uuid)
is 'Actor-derived soft-delete boundary with named PostgREST parameters.';

commit;
