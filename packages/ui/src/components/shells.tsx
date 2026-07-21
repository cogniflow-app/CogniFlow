import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

export type PageContainerWidth = "reading" | "content" | "site" | "wide";

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  width?: PageContainerWidth;
}

const containerWidthClasses: Record<PageContainerWidth, string> = {
  reading: "lumen-page-container--reading",
  content: "lumen-page-container--content",
  site: "lumen-page-container--site",
  wide: "lumen-page-container--wide",
} as const;

/**
 * A neutral horizontal layout boundary shared by public and application
 * surfaces. Its raw CSS intentionally does not depend on Tailwind so public
 * routes can use it without loading the complete component utility bundle.
 */
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(function PageContainer(
  { children, className, width = "site", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("lumen-page-container", containerWidthClasses[width], className)}
      {...props}
    >
      {children}
    </div>
  );
});

export type PageShellProps = PageContainerProps;

export const PageShell = forwardRef<HTMLDivElement, PageShellProps>(function PageShell(
  { children, className, width = "content", ...props },
  ref,
) {
  return (
    <PageContainer ref={ref} className={cn("py-8 lg:py-12", className)} width={width} {...props}>
      {children}
    </PageContainer>
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

/** Product-wide page boundary with the shared responsive gutters. */
export const ProductPage = forwardRef<HTMLDivElement, PageShellProps>(function ProductPage(
  { children, className, width = "wide", ...props },
  ref,
) {
  return (
    <PageShell ref={ref} className={cn("lumen-product-page", className)} width={width} {...props}>
      {children}
    </PageShell>
  );
});

export const ProductPageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  function ProductPageHeader({ actions, className, description, eyebrow, title, ...props }, ref) {
    return (
      <PageHeader
        ref={ref}
        actions={actions}
        className={cn("lumen-product-page-header", className)}
        description={description}
        eyebrow={eyebrow}
        title={title}
        {...props}
      />
    );
  },
);

export interface ProductToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  label: string;
}

export const ProductToolbar = forwardRef<HTMLDivElement, ProductToolbarProps>(
  function ProductToolbar({ children, className, label, ...props }, ref) {
    return (
      <div
        ref={ref}
        aria-label={label}
        className={cn("lumen-product-toolbar", className)}
        role="group"
        {...props}
      >
        {children}
      </div>
    );
  },
);

export const ReadableContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ReadableContent({ children, className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("lumen-readable-content", className)} {...props}>
        {children}
      </div>
    );
  },
);

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

export const SectionHeader = forwardRef<HTMLElement, SectionHeaderProps>(function SectionHeader(
  { actions, className, description, title, ...props },
  ref,
) {
  return (
    <header ref={ref} className={cn("lumen-section-header", className)} {...props}>
      <div>
        <h2>{title}</h2>
        {description && <div className="lumen-compact-form-copy">{description}</div>}
      </div>
      {actions && <div className="lumen-responsive-actions">{actions}</div>}
    </header>
  );
});

export interface FormSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  children: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
}

export const FormSection = forwardRef<HTMLElement, FormSectionProps>(function FormSection(
  { children, className, description, title, ...props },
  ref,
) {
  return (
    <section ref={ref} className={cn("lumen-form-section", className)} {...props}>
      {(title || description) && (
        <div className="lumen-form-section__heading">
          {title && <h2>{title}</h2>}
          {description && <div className="lumen-compact-form-copy">{description}</div>}
        </div>
      )}
      {children}
    </section>
  );
});

export const FieldGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function FieldGroup({ children, className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("lumen-field-group", className)} {...props}>
        {children}
      </div>
    );
  },
);

export const StickyActionBar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function StickyActionBar({ children, className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("lumen-sticky-action-bar", className)} {...props}>
        {children}
      </div>
    );
  },
);

export type CompactStatusTone = "neutral" | "progress" | "success" | "danger";

export interface CompactStatusProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: CompactStatusTone;
}

export const CompactStatus = forwardRef<HTMLSpanElement, CompactStatusProps>(function CompactStatus(
  { children, className, tone = "neutral", ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn("lumen-compact-status", className)} data-tone={tone} {...props}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
});
