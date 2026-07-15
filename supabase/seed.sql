begin;

-- Phase 00 intentionally has no application rows. Keeping this executable file
-- makes local resets deterministic without introducing fake user data.
do $seed$
begin
  raise notice 'Foundation seed complete; no application data inserted.';
end;
$seed$;

commit;
