# Phase 1 — Identity, authentication, learner profiles, privacy controls, and authorization foundation

Read `AGENTS.md`, the blueprint, the architecture decisions, and implementation status. Implement this phase in the existing repository. Do not merely propose schemas or screens.

## Objective

Deliver a complete account foundation for authenticated users, parent-managed learner profiles, public visitors, and ephemeral game guests. Build the authorization and privacy model that all later deck, scheduling, class, sharing, and game features will rely on.

The Vercel beta remains 13+. Under-13 code paths may be implemented and tested locally, but the server must keep them disabled under the Vercel deployment profile.

## 1. Database schema

Create additive migrations for the canonical identity/privacy entities, adapting names only when the mapping is documented:

- `profiles`;
- `learner_profiles`;
- `learner_profile_access`;
- `account_capabilities` or an equivalent normalized capability model;
- `guardian_relationships`;
- `consent_records`;
- `profile_sessions`;
- `devices`;
- `privacy_requests`;
- `data_export_jobs`;
- `deletion_jobs`;
- `audit_events`;
- `guest_sessions`;
- `rate_limit_buckets` if using database-backed rate limiting.

Requirements:

- one self learner profile is created transactionally for every eligible account;
- account capabilities permit a user to learn, create, host, and teach without mutually exclusive roles;
- authorization-critical data is not stored in user-editable auth metadata;
- age band is stored rather than exact birthday by default;
- consent and revocation are append-only;
- child profile access is explicit and guardian-controlled;
- profile-session tokens are hashed at rest;
- guest records contain no email or unnecessary persistent identifier;
- all timestamps are UTC;
- all exposed tables have RLS;
- policy helper functions live in a private schema, use explicit search paths, and have minimal grants;
- all policy columns are indexed.

Create database functions for:

- provisioning the application profile after auth signup;
- ensuring exactly one self learner profile;
- checking learner-profile access;
- creating/revoking a profile-switch session;
- creating and redeeming a guest session;
- requesting account export;
- requesting account deletion;
- recording consent/revocation;
- auditing sensitive changes.

Use idempotency and transaction safety.

## 2. Authentication

Implement a polished authentication experience using Supabase Auth:

Required:

- email/password signup and sign-in;
- email verification flow where configured;
- forgot/reset password;
- magic-link sign-in;
- sign-out from current device;
- sign-out all sessions when supported;
- session refresh and SSR-protected routes;
- auth callback handling;
- safe redirect allowlist;
- graceful expired-link/error screens.

Optional providers must be conditionally rendered based on environment configuration:

- Google;
- GitHub;
- Microsoft.

Do not show a provider button that is not configured. Add setup instructions for each. Do not implement Apple as a required beta dependency because its developer setup may not be free; keep the provider interface extensible.

Use server-side authorization for protected routes. Never rely only on middleware or hidden UI. Every protected server read/mutation must verify the account and learner-profile context.

## 3. Neutral age screen and onboarding

Create onboarding that asks for the minimum information:

- display name;
- handle;
- locale;
- time zone;
- study-day start;
- age band using a neutral age screen;
- optional learning goals;
- theme/motion preference.

Flow:

- adult/teen users may finish self-account onboarding;
- under-13 selection cannot create an independent account workflow;
- under-13 path explains that a guardian-managed profile is required;
- on `vercel_beta`, the flow clearly states child profiles are not available and refuses activation server-side;
- in local child-enabled test profile, a guardian can create a child learner profile after recording the configured consent state;
- do not collect a child email;
- do not request exact school, address, phone, or full birthday.

Do not claim that a checkbox alone is verifiable parental consent. Represent consent status and provide an owner-facing launch gate.

## 4. Learner-profile switcher

Implement:

- self profile;
- guardian-created child profile when capability enabled;
- secure profile switch;
- PIN/family-code setup using strong hashing and rate limits;
- short-lived signed/hashed profile session;
- obvious active-profile indicator;
- cache and offline-storage isolation hooks for later phases;
- guardian exit control;
- profile lock timeout;
- profile rename/avatar seed/preferences;
- revoke device/profile sessions.

A child profile must never gain the guardian’s account settings, email, private billing placeholder, or administrative controls.

## 5. Account and privacy settings

Implement real settings pages for:

- profile;
- security;
- connected auth providers;
- devices/sessions;
- learner profiles;
- guardian controls;
- privacy;
- data export request;
- deletion request and cancellation during a grace period;
- content/social safety defaults;
- analytics preference;
- notification placeholder only when it has real stored settings and no dead controls.

Provide:

- clear retention explanations based on configuration;
- no ads/data sale defaults;
- first-party analytics default;
- child analytics minimized;
- downloadable export job status infrastructure, even though full content export is implemented in the portability phase;
- deletion job state and safe re-authentication for destructive requests.

## 6. Public visitor behavior

Public routes must work without login. Add a real public-shell context that later public decks can use.

Unauthenticated users may not:

- create or save decks;
- persist study history;
- access `/app`;
- rate/favorite/comment;
- enumerate users;
- switch learner profiles.

Implement an authorization-aware call to action that preserves the intended return URL safely.

## 7. Guest game identity foundation

Implement the reusable guest identity flow without building games yet:

- join-code form shell;
- server route/RPC that will accept a future valid game code;
- Supabase anonymous auth or a documented equivalent ephemeral signed claim;
- generated safe nickname service;
- optional filtered custom nickname;
- hashed reconnect token;
- expiration and purge job;
- rate limiting by IP/session without invasive fingerprinting;
- no persistent XP or account conversion unless the guest explicitly signs up later;
- test fixture room hook, not a fake production room.

If the game tables do not yet exist, define an interface and a test-only adapter; do not expose a join button that pretends to join a nonexistent game.

## 8. RLS and authorization matrix

Write automated database tests covering at minimum:

- anonymous visitor;
- authenticated owner;
- unrelated authenticated user;
- guardian;
- child active profile;
- teacher-observer placeholder capability;
- revoked guardian;
- expired profile session;
- guest;
- attacker with a valid account but tampered learner-profile ID;
- service/admin path.

Verify that:

- users can read/update only their allowed profile fields;
- child data is guardian-scoped;
- consent records cannot be rewritten;
- audit events cannot be forged by clients;
- guest rows are scoped and expire;
- private helper schemas are not exposed;
- user metadata cannot escalate privileges.

## 9. Security

Add:

- route-level rate limiting for signup, password reset, PIN attempts, guest creation, and destructive requests;
- CSRF/origin protections appropriate to the chosen Next.js mutation path;
- safe error messages that do not enumerate accounts;
- re-authentication for high-risk actions;
- audit entries for profile/consent/session/deletion changes;
- headers and cookie settings;
- tests that a Vercel profile cannot enable child profiles through client or server tampering.

## 10. UI quality

The auth/onboarding/settings experience must be:

- original and premium;
- fully responsive;
- keyboard accessible;
- screen-reader friendly;
- complete in light/dark/reduced-motion modes;
- explicit about loading, pending verification, expired link, offline, rate-limited, and error states;
- free of fake social proof or fabricated user statistics.

## Required acceptance criteria

- migrations apply from empty and from the previous phase;
- auth provisioning is idempotent;
- SSR route protection and redirect behavior work;
- configured email/password and magic-link flows have local/test coverage;
- conditional OAuth buttons behave correctly;
- profile switching is authorized server-side;
- Vercel child-profile guard cannot be bypassed;
- RLS matrix passes;
- destructive requests require re-authentication or an equivalent secure check;
- privacy/export/deletion state is real, not static UI;
- `pnpm verify` and relevant Playwright flows pass;
- documentation includes Supabase email/OAuth configuration and current child launch gate;
- implementation status records tests and any integration that could not be live-verified without credentials.

Do not begin deck/card implementation beyond interfaces required for authorization tests.
