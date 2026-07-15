# Edge function boundary

Phase 00 intentionally defines no deployed Edge Function. When a later phase
adds one, validate every request with shared runtime schemas, authorize inside
the function, keep credentials in deployment secrets, and import reusable code
from `_shared`. Do not place browser-readable configuration or product tables
here merely to reserve structure.
