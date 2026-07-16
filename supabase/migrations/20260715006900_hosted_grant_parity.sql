-- Hosted Supabase projects may provision broader default service-role table grants
-- than the local stack. Lumen's server boundary is RPC-only, so keep the hosted
-- and locally tested least-privilege contracts identical.
revoke all privileges on all tables in schema public from service_role;
revoke all privileges on all sequences in schema public from service_role;

alter default privileges in schema public
  revoke all privileges on tables from service_role;

alter default privileges in schema public
  revoke all privileges on sequences from service_role;
