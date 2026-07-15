begin;

select plan(11);

select ok(
  pg_catalog.to_regnamespace('private') is not null,
  'private schema exists'
);

select ok(
  exists(select 1 from pg_catalog.pg_extension where extname = 'citext'),
  'citext extension is installed'
);

select ok(
  exists(select 1 from pg_catalog.pg_extension where extname = 'pgcrypto'),
  'pgcrypto extension is installed'
);

select ok(
  exists(select 1 from pg_catalog.pg_extension where extname = 'pg_trgm'),
  'pg_trgm extension is installed'
);

select ok(
  pg_catalog.to_regprocedure('private.set_updated_at()') is not null,
  'updated-at trigger function exists'
);

select is(
  (select p.prosecdef from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('private.set_updated_at()')),
  false,
  'updated-at trigger is security invoker'
);

select ok(
  (select pg_catalog.array_to_string(p.proconfig, ',') like 'search_path=%'
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('private.set_updated_at()')),
  'updated-at trigger fixes its search path'
);

select ok(
  not pg_catalog.has_schema_privilege('anon', 'private', 'usage'),
  'anonymous role cannot use private schema'
);

select ok(
  not pg_catalog.has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated role cannot use private schema'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'private.set_updated_at()',
    'execute'
  ),
  'anonymous role cannot execute private trigger'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private.set_updated_at()',
    'execute'
  ),
  'authenticated role cannot execute private trigger'
);

select * from finish();
rollback;
