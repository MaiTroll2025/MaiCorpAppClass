# Role-based dashboard status

The application resolves the signed-in user's `profiles.role` and `account_status` from Supabase before rendering a dashboard. `/learn` routes active students to the student view and active administrators to `/admin`; `/admin` redirects students back to `/learn`. Unknown, missing, or suspended profiles do not receive elevated access. The existing database role checks and RLS policies remain authoritative for data reads and course publication writes; client-side route checks are not a replacement for them.

## Connected to existing data

- Student dashboard: own active/completed enrollments, persisted lesson progress, accessible course lessons, scheduled/live class records, plan entitlements, app projects, App Credit balance/history, and the student's subscription record.
- Administrator dashboard: RLS-authorized student profile summaries, courses and publication state, scheduled/live classes, active subscription-record count, and draft/published course counts.
- Administrators can publish/unpublish courses through the existing `courses` table update path; the existing database policies authorize the write. The UI asks for confirmation.
- Course pages offer lesson-specific prompt copying for free courses and preview lessons. Clipboard failure provides a manual-copy field. It does not retrieve or expose restricted lesson content.

## Not represented as implemented

The forward-only launch/project migration defines tier entitlements, app projects, and an App Credit transaction ledger. No payment provider or verified checkout/webhook is configured, so new paid entitlements and App Credit purchases cannot be granted from the website; a row in `subscriptions` is not presented as verified payment revenue or a receipt. Support cases, training appointments, and full administrative audit workflows remain unavailable. Classroom chat/questions and moderation are documented separately in [classroom status](./CLASSROOM-STATUS.md). There is no separate instructor dashboard; instructors use the authorized class routes.

The dashboard read paths use existing RLS and the project/launch backend is supplied by the forward-only migration `20261029000000_launch_app_credits_and_projects.sql`. Existing Supabase migrations have not been validated against a running local database or applied to a remote database in this workspace. Production operation requires the migrations to be applied by the project owner.

## Authorization and freshness

The frontend fetches the profile using the current authenticated Supabase session. It rechecks on window focus and subscribes to profile changes when Realtime is available. The Supabase RLS policies remain responsible for each data request, and the course update is subject to the existing database policy. If access is revoked, reload/focus and backend checks prevent the dashboard from treating the cached view as authorization.

## Verification

The production build and focused lint/type checks cover frontend compilation. Companion scanner tests are separate from dashboard tests. There is no configured frontend test runner or Supabase local database in this workspace, so RLS behavior, live data integration, role routing against real accounts, payment processing, and administrative workflows were not remotely integration-tested.

## Dashboard launch and visual refresh (2026-10-27)

- The instructor/admin dashboard class setup now supports both **Schedule class** and **Start class now**. The instant-start path validates the selected published course, title, and 15–360 minute duration; creates a session scheduled one minute ahead; calls the existing server-authorized `start_class_session` lifecycle RPC; and navigates to `/classroom/:sessionId` only after the RPC succeeds. The classroom route then uses the existing Agora token Edge Function and RTC implementation.
- The dashboard's class-management action jumps to this setup area instead of sending instructors and administrators to the public class listing.
- If session creation succeeds but the start RPC fails, the UI surfaces the error and explains that the session remains scheduled. It does not pretend the Agora room started.
- A unified Mai Corp App Class design system was applied across the shared global styles and route components: electric blue, bright green, and violet accents, updated cards/buttons/forms, and responsive dashboard controls.
- Before production use, apply and validate all migrations in a disposable local Supabase instance, deploy `supabase/functions/agora-token`, configure server-side Agora secrets and allowed origins, and verify Agora token authentication/publish privilege enforcement in the Agora console. The code path is wired, but this environment did not have the correct Linux TypeScript/Vite optional platform binaries to complete a production build, and no real Supabase/Agora browser test was run.
