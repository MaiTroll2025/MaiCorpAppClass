# Mai Corp App Class

Mai Corp App Class is a React, TypeScript, and Vite learning platform frontend backed by Supabase.

## Local setup

1. Install Node.js 20.19+ or 22.12+.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project settings. The URL and anon key are public client configuration protected by RLS; never put service-role keys, database passwords, or provider secrets in `VITE_*` variables. `DATABASE_URL`, if used by trusted local tooling, must remain server-side.
4. Apply the versioned SQL migrations in `supabase/migrations/` using the Supabase CLI or the SQL migration workflow for your project.
5. Start the frontend with `npm run dev`.

The site intentionally shows setup and empty states until it can retrieve published data. It does not create sample courses or pretend that payments, live video, recordings, or AI summaries are connected.

## Implemented foundation

- Responsive public pages and navigation for courses, live classes, recorded lessons, pricing, and product information.
- Published course catalog, search/filter controls, and course detail pages backed by Supabase.
- Supabase Auth registration, sign-in, sign-out, session restoration, and password recovery.
- Supabase-backed live-class listings, active shared links with server-calculated expiry and revocation, real-time hand-raise requests, instructor approval/denial, and administrator/instructor class restrictions.
- A scheduled classroom workflow with role-authorized start/end/cancel controls, classroom chat and questions, realtime roster, attendance records, and an Agora RTC client for on-demand camera, microphone, and screen sharing. See [classroom deployment and verification status](./docs/CLASSROOM-STATUS.md).
- Public Q&A event configuration and a server-only $10/24-hour pass ledger. The public checkout remains unavailable until a payment provider and verified webhook are configured.
- Role-aware student and administrator dashboards backed by the existing profiles, enrollment, lesson progress, course, class-session, and subscription tables. See [dashboard status and limitations](./docs/DASHBOARD-STATUS.md).
- Lesson-specific copy-to-Kilo prompts on accessible course lessons and a student guide for the local VS Code companion workflow.
- A forward-only SQL foundation for profiles, roles, course content, enrollment, progress, live-class metadata, attendance, recordings, summaries, class resources, link sharing, speaking requests, and moderation events, with RLS policies.

## Deployment requirements and limitations

The classroom implementation is present locally but has not been applied to a database or deployed. It requires the `20261030000000_interactive_classroom_and_public_qa.sql` migration, the `agora-token` Edge Function, server-side `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, and `APP_ALLOWED_ORIGINS` secrets, and Agora token/co-host publish-privilege enforcement enabled in the provider console. No live RTC session or mobile screen-share test has been performed. There is no recording/replay pipeline or provider-side forced-disconnect integration. See the classroom status document for deployment steps and limitations.

Payment processing, one-time course checkout, App Credit purchases, Q&A checkout, OpenRouter summaries, private Storage bucket setup, background job scheduling, and email delivery are not configured. The Q&A pass grant function is restricted to `service_role` and must only be invoked after a real payment webhook verifies the signed payment and amount. Subscription cancellation remains unavailable without a billing provider.

The local VS Code companion is in `vscode-companion/`; it has not been packaged or tested in an Extension Development Host. Course tier and App Credit records are defined by the forward-only migration, but no checkout/payment grant workflow exists. Support cases, training appointments, and full administrative audit workflows remain unavailable and are identified in the dashboard instead of being presented as active features.

No migration has been validated against a running local Postgres database or applied to a remote Supabase project in this workspace. The local Supabase CLI lint command requires a Postgres instance listening on port 54322.
