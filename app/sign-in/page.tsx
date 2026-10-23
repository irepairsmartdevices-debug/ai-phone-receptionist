export default function SignIn() {
  return (
    <section className="panel">
      <div className="eyebrow">YOUR REPAIR TEAM, CONNECTED</div>
      <h1>Connect your staff account.</h1>
      <p className="section-intro">
        Sign in to your repair software first, then authorize this receptionist.
        Your repair password stays in the repair app.
      </p>
      <a className="button primary" href="/api/auth/start">
        Connect repair account →
      </a>
      <p className="muted">
        Access expires after 15 minutes. Only staff can request ticket changes.
      </p>
    </section>
  );
}
