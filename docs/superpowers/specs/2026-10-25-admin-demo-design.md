# Admin-only online demo

User approved an admin-only password-protected online demo. No staff accounts.
Keep fixture repair operations fictional and live phone webhooks disabled. Reuse Next.js,
PostgreSQL sessions and existing fixture engine, without a new auth provider or database schema.

## Approaches
A separate demo admin password works before the repair app is deployed (selected).
Repair account authorization requires that app to be deployed and is retained only for connected mode.

## Design
RECEPTIONIST_MODE=fixture and DEMO_ADMIN_PASSWORD (at least 16 characters) enables
admin sign-in. APP_ORIGIN must match the canonical HTTPS deployment address.
Password comes from a server-only environment variable; never checked into Git or exposed to browser.
Sessions last eight hours; database holds token hashes and a password-bound grant so password
rotation revokes them. Login attempts are throttled across instances through PostgreSQL settings.
Origin checks protect login, logout and all existing mutations. No local bypass on Vercel.
Connected mode continues using repair authorization. Demo session cannot authorize connected mode.
Only existing local development retains the localhost fixture bypass.
