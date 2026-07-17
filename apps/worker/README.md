# Lumen worker

`pnpm worker:media-deletions` executes one bounded batch of delayed content-media cleanup. The
process requires `NEXT_PUBLIC_SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY`. Optional
`MEDIA_DELETION_BATCH_SIZE` (`1..100`, default `25`) and `MEDIA_DELETION_LEASE_SECONDS` (`30..900`,
default `300`) tune one invocation.

The worker leases only due abandoned, quarantined, or zero-reference objects through a
service-role-only RPC, removes the exact private Storage path, and then marks the lease complete.
An already-absent key is a successful empty bulk deletion; every error reported by Storage is
recorded with bounded increasing backoff. A crashed worker leaves an expiring lease so a later
invocation can retry the idempotent object removal. Once a job exists, the old asset identity cannot
be attached again; a later same-byte upload gets a fresh path after tombstoning. No scheduler is
embedded here: a deployment may invoke this command from its cron or job service without changing
the database contract.
