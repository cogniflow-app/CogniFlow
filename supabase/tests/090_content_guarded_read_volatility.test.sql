begin;

select no_plan();

select is(
  (select provolatile from pg_catalog.pg_proc where oid = 'public.current_get_deck_media(uuid)'::regprocedure),
  'v'::"char",
  'the guarded deck-media RPC permits the session guard lock at the PostgREST boundary'
);
select is(
  (select provolatile from pg_catalog.pg_proc where oid = 'public.current_get_media_asset(uuid)'::regprocedure),
  'v'::"char",
  'the guarded media-asset RPC permits the session guard lock at the PostgREST boundary'
);
select is(
  (select provolatile from pg_catalog.pg_proc where oid = 'public.current_get_library_counts()'::regprocedure),
  'v'::"char",
  'the guarded library-count RPC permits the session guard lock at the PostgREST boundary'
);

select * from finish();
rollback;
