import "../phase-one.css";

import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="phase-one-surface">{children}</div>;
}
