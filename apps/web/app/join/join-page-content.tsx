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
        <h1 id="join-title">Have a room code? Check it here.</h1>
        <p>
          Enter the code you received. If the room is active and accepts guests, we create a
          temporary guest identity with a safe nickname and no email address.
        </p>
        <dl className="join-privacy-list">
          <div>
            <dt>No account required</dt>
            <dd>An active room can allow temporary guest access.</dd>
          </div>
          <div>
            <dt>Active rooms only</dt>
            <dd>Guest access continues only after the room code is verified.</dd>
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
                You are signed in. <a href={viewer.accountHref}>Open your workspace</a> to manage
                your account.
              </>
            ) : (
              <>
                Want secure account access and privacy controls?{" "}
                <a href={viewer.signUpHref}>Create an account</a>; you will return to this page
                afterward.
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
