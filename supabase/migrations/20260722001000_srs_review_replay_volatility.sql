begin;

-- Runtime authorization delegates to the strictest underlying helper. Keep the
-- wrapper volatile so PostgreSQL does not assume a weaker execution contract.
alter function public.admin_get_srs_review_replay(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text
) volatile;

commit;
