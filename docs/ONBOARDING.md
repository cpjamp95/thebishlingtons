# Guest onboarding

Implemented: invitation lookup, household confirmation, account creation, email confirmation, sign-in, password reset, household linking, personalised homepage, persistent session and sign-out. RSVP is deliberately marked as not yet submitted.

## Test the screens locally (no Supabase needed)

```
git fetch origin
git switch codex/guest-onboarding
npm ci
npm run dev:preview
```

Open http://127.0.0.1:4321 and select RSVP. Use `DEMO-DAY`, `DEMO-EVENING` or `DEMO-PARTY`. Confirm the fictional household, enter a display name and continue. Refresh to check persistence, then sign out. No email, password or real account is created in this preview. It uses a separate localStorage key and is compiled out of production builds.

Stop the preview before switching to real credentials:

```
npx astro dev stop
```

## Hosted backend status

The `The Bishlingtons` project (`lntrxxppwteatcwkimgj`) is provisioned in London (`eu-west-2`). The migration has been applied and a fictional test household has been created. Its code is supplied separately, not committed. RLS and anonymous invitation lookup have been checked on the hosted database. The advisor's four “RLS enabled, no policy” notices are intentional: direct table access is revoked and only the scoped RPCs are used ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

`src/data/backend.ts` contains the public project URL and publishable key, so the branch works without copying environment variables. These are public client settings, not an administrative secret. Environment variables can override them for another project. Auth redirect/email configuration and a real email/account round trip must be verified before release.

## Backend setup reference

1. Use a Supabase project for this wedding. Apply `supabase/migrations/20260921091936_guest_onboarding.sql` once in the SQL editor (or via the Supabase CLI migration workflow).
2. Enable email/password authentication and email confirmation. Set a minimum password length of 12. Configure outgoing email before inviting real guests.
3. Set the Site URL to `https://thebishlingtons.com/`. Add exact redirect URLs for that address and `http://127.0.0.1:4321/` for local testing. Add the `www` address only if it is used. No wildcard redirects are needed.
4. Copy `.env.example` to `.env` and fill `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the project URL and publishable (or legacy anon) key. Keep `PUBLIC_ONBOARDING_PREVIEW=false`. Never use the service-role/secret key in client config.
5. For GitHub Pages, set the same two public values as repository **Actions variables**, then run the deployment workflow after merging. The build reads these variables. The checked-in public configuration is used when these overrides are empty; production never falls back to fake accounts.
6. Generate a fictional test household with `node scripts/create-test-invitation.mjs`. Run its SQL in Supabase and retain the freshly generated invitation code locally. Do not commit invitation codes or actual guest lists to the public repository.
7. Start `npm run dev`, open the local URL and test the generated invitation code with an email address you control. Confirm your email, sign in, refresh, sign out and sign in again. Try password recovery. Email deliveries and real hosted persistence require this connected test; local automated tests do not certify them.

Email confirmation opened in a different browser/tab may require re-entering the invitation code. The pending code is kept only in sessionStorage; account passwords are never stored by this application. The Supabase SDK manages its normal session storage. Anyone with a household's invitation code can link a verified account to that household; keep codes private. Account membership cannot be changed through client metadata. Admin access is outside this milestone and is never granted through invitation codes.

## Data access

The four wedding tables have RLS enabled and no direct anon/authenticated table grants. Three invoker RPCs delegate to explicitly granted helpers in the unexposed `wedding_private` schema, all with an empty search path. They provide the only guest operations:

- `lookup_invitation`: returns just the household label, guest type and invited names for a valid, unexpired code. Codes are 128 random bits (32 hexadecimal characters), stored as SHA-256 hashes.
- `claim_invitation`: requires an authenticated, email-confirmed user; links one household idempotently and rejects switching to another.
- `guest_home`: returns only the current account's linked household.

Revoking an invitation blocks new claims. To remove an existing account's household access, delete its row in `wedding_memberships` using the database administrator. Household members may each have their own account. There is no client-side role selection and no admin invitation password.

## Checks

```
npm run typecheck
npm run test:db
npm run build
npx playwright install chromium
npm run dev:preview
npm run test:ui
npx astro dev stop
```

The database test executes the actual migration in PostgreSQL via PGlite, including anonymous denial, unconfirmed accounts, isolation, forged metadata, repeated claims, expired/revoked codes and denied household switching. UI tests cover phone layouts, correcting a code, navigation, text safety, refresh and sign-out. The auth tests use intercepted Supabase HTTP responses to exercise the real SDK without sending email; see `tests/auth.spec.ts` for configuration.
