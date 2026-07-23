-- Correct Phase 06 routines that qualified PostgreSQL's LEAST/GREATEST SQL
-- expressions as though they were pg_catalog functions. Earlier migrations
-- remain immutable because they have already been exercised on Preview.

do $migration$
declare
  v_function_name text;
  v_definition text;
begin
  perform pg_catalog.set_config('search_path', '', true);

  foreach v_function_name in array array[
    'admin_complete_portability_job',
    'admin_restore_portability_progress_chunk',
    'admin_restore_portability_evidence_chunk'
  ]
  loop
    select pg_catalog.pg_get_functiondef(proc.oid)
    into strict v_definition
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = v_function_name;

    v_definition := pg_catalog.replace(
      pg_catalog.replace(
        v_definition,
        'pg_catalog.least(',
        'least('
      ),
      'pg_catalog.greatest(',
      'greatest('
    );

    execute v_definition;
  end loop;
end;
$migration$;
