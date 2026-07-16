import type { ReactNode } from "react";

export interface AuthShellProps {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly story: string;
  readonly title: string;
}

export function AuthShell({ children, eyebrow, story, title }: AuthShellProps) {
  return (
    <main className="auth-grid" id="main-content" tabIndex={-1}>
      <section className="auth-story" aria-labelledby="auth-story-title">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1 id="auth-story-title">{title}</h1>
          <p>{story}</p>
        </div>
        <p className="text-sm">
          No advertising. No sale of learner data. This beta is for ages 13 and older; child
          profiles are not available.
        </p>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
