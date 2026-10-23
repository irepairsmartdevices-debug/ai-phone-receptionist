import "./globals.css";
import Link from "next/link";
export const metadata = {
  title: "Frontdesk · Repair Studio",
  description: "Your repair shop, always within reach.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="brand-icon">f</span> frontdesk
            <span className="brand-dot">.</span>
          </Link>
          <div className="workspace">
            <span className="avatar">RS</span>
            <div>
              <strong>Repair Studio</strong>
              <small>Receptionist workspace</small>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            <Link href="/">
              ◫ <span>Overview</span>
            </Link>
            <Link href="/conversations">
              ◌ <span>Conversations</span>
            </Link>
            <Link href="/test">
              ⌁ <span>Test receptionist</span>
            </Link>
            <Link href="/calls">
              ☎ <span>Calls</span>
            </Link>
            <Link href="/settings">
              ⚙ <span>Settings</span>
            </Link>
          </nav>
          <div className="sidebar-bottom">
            <div className="help-card">
              <span>✦</span>
              <strong>
                A great first impression.
                <br />
                Every single call.
              </strong>
              <p>Your front desk, with a little more possibility.</p>
            </div>
            <div className="profile">
              <span className="avatar">RS</span>
              <div>
                <strong>Repair Studio</strong>
                <small>Owner workspace</small>
              </div>
            </div>
          </div>
        </aside>
        <main>
          <header>
            <div className="breadcrumb">
              Workspace <span>/</span> Receptionist
            </div>
            <div className="header-right">
              <span className="dot amber" /> Local development{" "}
              <span className="avatar small">RS</span>
            </div>
          </header>
          <div className="content">{children}</div>
        </main>
      </body>
    </html>
  );
}
