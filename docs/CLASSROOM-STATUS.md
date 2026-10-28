# Live classroom and public Q&A status

## What is implemented in the repository

- Class listing and scheduling use the existing `class_sessions` and `courses` tables. Instructors may schedule their own published-course classes; administrators may schedule classes for a published course. The assigned instructor is the course instructor.
- Admin immediate-start and stream-setup inserts use client-generated UUIDs and do not request an inserted-row representation. This avoids applying the restrictive classroom read policy to the insert response; the table's existing insert RLS policy still authorizes each class, and the UUID insert grant is limited to authenticated users.
- The instructor and administrator dashboards provide a class setup form for published courses and show scheduled/live class records with a server-authorized **Start class** action. Starting from the dashboard uses the same lifecycle RPC and 15-minute-early/two-hours-late window as the classroom controls, then opens the live classroom. Dashboard links also lead to class details or the active classroom, and the dashboard remains integrated with the class listing.
- Instructors and administrators can start a class 15 minutes before its scheduled time through two hours after, cancel a scheduled class, and end a live class. Ending a class closes active attendance rows, pending hand raises, active shared links, and temporary join reservations.
- The classroom uses the installed `agora-rtc-sdk-ng` 4.24.9 package. RTC tokens are requested from the `agora-token` Edge Function; its signing certificate stays server-side. The Edge Function asks the database to authorize the authenticated user and requested session before building a token.
- The RTC UI does not start a camera or microphone automatically. Participants can enable/disable local tracks, select available camera/microphone devices, and leave the channel. The instructor camera remains separate from an optional screen stream; screen sharing uses a separate RTC client/account so it does not replace the camera video.
- Student microphone publication is granted in the database only while the instructor has approved an active speaking request. Student screen sharing is controlled by the session setting. Screen capture requires the participant to click the share control and accept the browser's native permission prompt.
- The participant roster exposes only participant ID, display name, role, and current attendance to authorized members. Classroom messages and questions are stored by session, rate-limited in database functions, and synchronized through Supabase Realtime. Instructors can answer or reopen questions.
- After a class ends, authorized participants can review its saved chat and questions while their course or Q&A-pass access remains valid. Chat becomes read-only; instructors can still answer or reopen saved questions.
- Class attendance is recorded after the browser reports a successful Agora join and is made idempotent for reconnects. It is not independently attested by an Agora server webhook.
- Public Q&A can be enabled on a scheduled class. Enrolled students who are entitled to that class can attend without a pass. A public pass record is constrained to $10 USD and expires exactly 24 hours after the verified payment is recorded. Passes are scoped to one Q&A session and cannot authorize access to other classes, projects, messages, or admin tools. Public passes can submit questions.
- A PayPal Edge Function creates fixed-price USD orders and verifies completed captures against server-defined plan prices or the $10 session pass before it calls the service-role entitlement RPCs. The browser never supplies a price or grants access directly.
- The public homepage lists published, scheduled/live classes and published recordings. Live streams use read-only Agora audience tokens. Private recordings are uploaded by class moderators and delivered through short-lived signed URLs after a plan, pass, or one-time 30-second per-IP/media preview check.
- A public pass is scoped to one class and expires 24 hours after verified payment; it can authorize that class's live stream and published recording. Buying before a live class is available still starts the pass timer at payment confirmation.
- Student interest messages are sent only after the student explicitly submits the “I’m interested” form. The instructor/admin classroom panel receives the class, student, and app-interest details.
- Setup, moderator recording upload, live class, public live viewing, and recording playback are desktop-only (minimum 900px viewport and fine pointer). This is a UI/device gate, not a way to prevent a desktop browser from being emulated.

## Required deployment configuration

The `20261031000000_public_streams_and_student_interest.sql` migration is applied to the linked production project `pbwzseeovztzjctppftl`. All four functions (`agora-token`, `public-stream-token`, `public-recording-url`, and `paypal-checkout`) are deployed and active there. The exact production CORS origin is `https://maicorpappclass.onrender.com`; no local development origin is allowlisted.

Configure these Supabase Edge Function secrets:

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `APP_ALLOWED_ORIGINS` as a comma-separated exact-origin allowlist, including the deployed site origin and the intended local development origin
- `STREAM_PREVIEW_HMAC_SECRET` as a high-entropy secret used to hash visitor IPs before storing preview grants
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT` as `sandbox` for testing or `live` for production

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Supabase Edge Function environment. Do not copy the Agora certificate, PayPal client secret, preview HMAC secret, or Supabase service-role key into a `VITE_*` setting.

`APP_ALLOWED_ORIGINS`, `STREAM_PREVIEW_HMAC_SECRET`, and `PAYPAL_ENVIRONMENT=live` are configured in the linked project. Add the PayPal Live `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` directly in Supabase Edge Function Secrets before enabling purchases. Those two values are not configured, so PayPal checkout currently returns an unavailable/configuration error.

In the Agora console, enable token authentication and co-host publish-privilege enforcement for the app. Agora's user-account privilege token API documents that publish-audio/video privileges are enforced only when co-host authentication is enabled. Until that is enabled and tested, the database authorization is present but RTC publish restrictions are not proven effective.

The RTC token expires after 15 minutes and is renewed against the database. A class restriction is pushed to the participant UI, which attempts to leave the RTC room; there is no Agora server-side forced-disconnect API integration in this repository. A hostile already-connected client may retain a connection until provider enforcement or token expiry.

## Not implemented or not live-verified

- PayPal checkout remains unavailable until the PayPal Live client credentials are added and the verified payment and entitlement flow has been tested. There is no refund, dispute, or receipt-management workflow in the app.
- Recordings are moderator-uploaded MP4/WebM files with a 50 MB bucket limit; there is no automated Agora recording pipeline, consent workflow, transcoding, or retention policy.
- RTC attendee removal currently blocks database access and causes the normal client to leave after a realtime update; it does not use Agora's server-side kick API.
- Attendance is client-confirmed after successful SDK join, not provider-webhook-attested. Do not use it as payment evidence or as a tamper-proof certification record.
- No live browser test with camera/microphone permissions, two real Agora accounts, screen sharing, poor-network recovery, or a mobile device was possible. An RTC mock test suite is not configured.
- The migration could not be linted because no local Postgres was listening on port 54322. The build does not execute Supabase migrations. Apply and validate the migration in a disposable local Supabase database before production.
- Production migrations, Edge Function deployment, Supabase secrets, Agora account settings, payment integration, and live RTC behavior remain unverified.

## Requirement status

| Area | Status |
|---|---|
| Class scheduling, role checks, join authorization, lifecycle controls | Implemented in code; not database/live verified |
| RTC camera/audio, participant tracks, reconnect state and cleanup | Implemented in code; not live verified |
| Student and instructor screen sharing | Implemented in code; not live verified |
| Chat, questions, hand raises, and moderation state | Implemented in code; not database/live verified |
| Attendance and roster | Implemented in code; client-confirmed, not provider-attested |
| Public Q&A pass and plan checkout | Implemented in code; PayPal configuration and provider verification required |
| Public stream and recording library | Implemented in code; migration, functions, storage, and provider configuration required |
| Recording upload and replay | Moderator upload and signed-link playback implemented; not live verified |
| Responsive UI and production build | Implemented and build-verified; not browser/device tested |
| Live RTC integration tests | Not performed |
