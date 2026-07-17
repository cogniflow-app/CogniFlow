"use client";

import { Button, LinkButton } from "@lumen/ui";
import { useEffect } from "react";

export default function WorkspaceError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Keep the public message neutral; the framework digest is enough for a
    // configured server logger to correlate without exposing private content.
    void error.digest;
  }, [error]);

  return (
    <div className="library-shell">
      <section className="library-empty" aria-labelledby="workspace-error-heading">
        <div className="library-empty__content">
          <span aria-hidden="true" className="library-empty__icon">
            !
          </span>
          <h1 id="workspace-error-heading">Your library could not be loaded</h1>
          <p>
            Your content was not changed. Retry the request, or return later if the service is
            temporarily unavailable.
          </p>
          <div className="library-actions justify-center">
            <Button onClick={reset}>Try again</Button>
            <LinkButton href="/" variant="secondary">
              Public home
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
