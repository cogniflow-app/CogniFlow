import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  width?: "reading" | "content" | "wide";
}

const widths = {
  reading: "max-w-3xl",
  content: "max-w-6xl",
  wide: "max-w-[90rem]",
} as const;

export const PageShell = forwardRef<HTMLDivElement, PageShellProps>(function PageShell(
  { children, className, width = "content", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 lg:py-12", widths[width], className)}
      {...props}
    >
      {children}
    </div>
  );
});

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  navigation?: ReactNode;
  utility?: ReactNode;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  { children, className, navigation, utility, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("min-h-dvh bg-[var(--color-background)] text-[var(--color-text)]", className)}
      {...props}
    >
      {navigation}
      {utility}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
});

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { actions, className, description, eyebrow, title, ...props },
  ref,
) {
  return (
    <header
      ref={ref}
      className={cn(
        "mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="max-w-3xl">
        {eyebrow && (
          <div className="mb-2 text-sm font-bold tracking-[0.12em] text-[var(--color-brand)] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="m-0 text-[length:var(--text-3xl)] leading-[var(--leading-tight)] font-bold tracking-[-0.025em]">
          {title}
        </h1>
        {description && (
          <div className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)] sm:text-lg">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
});
