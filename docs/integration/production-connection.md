# Connect the deployed repair software

This connection uses two separate websites and their existing databases. The repair
integration must be deployed before switching the receptionist out of fixture mode.
The receptionist workspace accepts administrators only.

## Private hosting configuration

Create a dedicated long random integration credential using a password manager
(at least 32 random characters). Do not use the six-digit admin PIN or an AI key.
Enter the same credential privately in both projects; never commit it or send it in chat.

| Repair project variable | Value |
| --- | --- |
| `RECEPTIONIST_API_TOKEN` | The dedicated integration credential |
| `RECEPTIONIST_ORIGIN` | `https://ai-phone-receptionist-five.vercel.app` |
| `APP_URL` | The repair site's final canonical HTTPS origin |

Keep the repair project's current database, administrator credentials and session
secret. Its production build applies the additive integration migration; do not run
seed scripts against an existing hosted database.

| Receptionist project variable | Value |
| --- | --- |
| `REPAIR_SERVICE_TOKEN` | The same dedicated integration credential |
| `REPAIR_SERVICE_URL` | The repair site's final canonical HTTPS origin |
| `RECEPTIONIST_MODE` | `connected` |
| `APP_ORIGIN` | `https://ai-phone-receptionist-five.vercel.app` |

Keep the receptionist's current Neon database to retain its custom topics and settings.
Use the final repair hostname directly; redirects and deployment password gates block
server-to-server API requests. Redeploy both projects after configuration changes.

## Administrator authorization

1. Sign in to the repair software as an administrator.
2. Open `https://ai-phone-receptionist-five.vercel.app/sign-in`.
3. Select **Connect admin account**.
4. If shown, select **Continue to administrator approval** on the repair website.
5. Review the connection and select **Connect admin account** to approve it.

The continuation only restores same-origin access to the existing Strict login cookie.
It grants no access by itself. The callback is exactly
`https://ai-phone-receptionist-five.vercel.app/api/auth/callback`. Administrator
sessions last 15 minutes and are checked against the repair app on requests. The demo
PIN is for fixture mode; connected access uses the repair administrator account.

## Verify the actual connection

Load Knowledge & pricing and confirm it shows the real source catalog. Ask for a
known device/model repair price in customer mode and compare it with the repair app.
Each pricing question reads the current source catalog without caching; new models
need an assigned repair offering and price before they can be quoted. A manual
linked override stays fixed until removed, and an already-open catalog list needs
reload/navigation to display source changes.

Settings' Connected label reflects the configured mode; use a successful live catalog
request and administrator authorization as evidence that connection actually works.
Real customer ticket verification also requires registered-contact SMS delivery in
the repair app. Connecting the catalog does not configure Twilio phone calling.
