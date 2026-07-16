import { JoinForm } from "@/components/join/join-form.client";
import type { PublicViewerContext } from "@/lib/server/public-viewer";

export interface JoinPageContentProps {
  readonly initialJoinCode?: string;
  readonly viewer: PublicViewerContext;
}

export function JoinPageContent({ initialJoinCode, viewer }: JoinPageContentProps) {
  return (
    <main className="join-shell" id="main-content" tabIndex={-1}>
      <section className="join-story" aria-labelledby="join-title">
        <span className="eyebrow">Guest access</span>
        <h1 id="join-title">A room code is all you need.</h1>
        <p>
          Guest play is temporary by design. We use a safe nickname and an expiring reconnect
          secret—never an email address, persistent XP, or a tracking profile.
        </p>
        <dl className="join-privacy-list">
          <div>
            <dt>No account required</dt>
            <dd>A host can allow ephemeral guests for an active room.</dd>
          </div>
          <div>
            <dt>No pretend rooms</dt>
            <dd>The server checks a real room provider before issuing guest access.</dd>
          </div>
          <div>
            <dt>Short-lived by default</dt>
            <dd>Guest identity expires with the room or the configured retention limit.</dd>
          </div>
        </dl>
      </section>
      <section className="join-panel" aria-labelledby="join-form-title">
        <div className="join-card">
          <h2 id="join-form-title">Find your room</h2>
          <p className="auth-card__intro">
            Enter the code shown by the host. We will only continue when that room exists and
            currently accepts guests.
          </p>
          <JoinForm {...(initialJoinCode === undefined ? {} : { initialJoinCode })} />
          <p className="join-account-note">
            {viewer.authenticated ? (
              <>
                Your account can keep study history and persistent progress.{" "}
                <a href={viewer.accountHref}>Open your workspace</a>.
              </>
            ) : (
              <>
                Want study history or persistent progress?{" "}
                <a href={viewer.signUpHref}>Create an account</a>; you will return to this room page
                afterward.
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
