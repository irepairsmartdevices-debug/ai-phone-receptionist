import { demoConfigured } from "../../src/auth/demo";
import { authorizationMessage } from "../../src/auth/errors";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const fixture = (process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture";
  const { error } = await searchParams;
  return (
    <section className="panel">
      <div className="eyebrow">YOUR ADMIN WORKSPACE</div>
      <h1>Admin sign-in</h1>
      {fixture ? (
        <>
          <p className="section-intro">
            Sign in to explore your receptionist with fictional tickets and
            appointments.
          </p>
          {demoConfigured() ? (
            <form action="/api/auth/demo" method="post" className="stack">
              <label htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={4096}
              />
              {error && (
                <p role="alert">Incorrect password. Please try again.</p>
              )}
              <button type="submit" className="button primary">
                Sign in
              </button>
            </form>
          ) : (
            <p>
              Admin access is not configured yet. Set the admin demo password
              and website address in your hosting settings.
            </p>
          )}
          <p className="muted">
            Admin access only. No real calls or customer data. Sessions expire
            after eight hours.
          </p>
        </>
      ) : (
        <>
          <p className="section-intro">
            Sign in as an administrator in your repair software, then authorize
            this receptionist. Your repair password stays in the repair app.
          </p>
          {error && (
            <p className="error" role="alert">
              {authorizationMessage(error)}
            </p>
          )}
          <a className="button primary" href="/api/auth/start">
            Connect admin account →
          </a>
          <p className="muted">
            Only administrators can access this workspace.
          </p>
        </>
      )}
    </section>
  );
}
