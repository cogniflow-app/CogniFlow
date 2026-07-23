begin;

create or replace function public.admin_get_portability_audit_events(
  p_account_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'actorLearnerProfileId', event.actor_learner_profile_id,
        'actorType', event.actor_type,
        'correlationId', event.correlation_id,
        'eventType', event.event_type,
        'id', event.id,
        'metadata', event.metadata,
        'receivedAt', event.received_at,
        'targetId', event.target_id,
        'targetType', event.target_type
      )
      order by event.received_at, event.id
    ),
    '[]'::jsonb
  )
  from (
    select audit.*
    from public.audit_events as audit
    where audit.actor_account_id = p_account_id
    order by audit.received_at, audit.id
    limit 10000
  ) as event
$function$;

revoke all on function public.admin_get_portability_audit_events(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_get_portability_audit_events(uuid)
to service_role;

comment on function public.admin_get_portability_audit_events(uuid) is
  'Returns a bounded, minimized audit history for a server-authorized complete-account portability export.';

commit;
