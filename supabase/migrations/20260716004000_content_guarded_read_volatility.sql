-- PostgREST executes STABLE RPCs in a read-only transaction. These actor-scoped
-- reads deliberately reuse the Phase 01 session guard, which takes a row lock
-- while proving that the current device/session remains authorized. Mark the
-- public wrappers VOLATILE so that the HTTP boundary permits that lock.

begin;

alter function public.current_get_deck_media(uuid) volatile;
alter function public.current_get_media_asset(uuid) volatile;
alter function public.current_get_library_counts() volatile;

comment on function public.current_get_deck_media(uuid)
is 'Returns authorized private deck media. VOLATILE because the shared session guard locks the active device row.';
comment on function public.current_get_media_asset(uuid)
is 'Resolves one authorized private media asset. VOLATILE because the shared session guard locks the active device row.';
comment on function public.current_get_library_counts()
is 'Returns exact actor-scoped library counts. VOLATILE because the shared session guard locks the active device row.';

commit;
