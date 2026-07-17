-- Keep function volatility aligned with the strictest hosted PostgreSQL catalog
-- classification. These deterministic projections call routines that hosted
-- lint classifies as STABLE, so their wrappers must not promise IMMUTABLE.

alter function private.filter_custom_card_payload(jsonb, text, text, text)
stable;

alter function private.derive_public_card_id(uuid, uuid)
stable;

alter function private.collect_embedded_media_requirements(
  jsonb,
  integer,
  public.media_kind,
  text,
  text
)
stable;
