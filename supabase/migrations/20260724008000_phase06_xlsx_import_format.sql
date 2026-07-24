-- Add the user-requested Excel / Google Sheets workbook source without
-- changing any already-applied Phase 06 migration.

alter type public.portability_format add value if not exists 'xlsx' after 'tsv';

comment on type public.portability_format is
  'Versioned portability source and artifact formats, including import-only XLSX workbooks.';

alter table public.export_jobs
  add constraint export_jobs_xlsx_import_only
  check (export_format::text <> 'xlsx');

alter table public.export_artifacts
  add constraint export_artifacts_xlsx_import_only
  check (format::text <> 'xlsx');

update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then
    array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
  when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' =
    any(allowed_mime_types) then allowed_mime_types
  else pg_catalog.array_append(
    allowed_mime_types,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
end
where id = 'lumen-portability';
