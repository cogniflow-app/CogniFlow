"use client";

import * as VisuallyHiddenPrimitive from "@radix-ui/react-visually-hidden";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

export const VisuallyHidden = VisuallyHiddenPrimitive.Root;

export interface LiveRegionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  politeness?: "polite" | "assertive";
  visuallyHidden?: boolean;
}

export const LiveRegion = forwardRef<HTMLDivElement, LiveRegionProps>(function LiveRegion(
  { children, className, politeness = "polite", visuallyHidden = true, ...props },
  ref,
) {
  const content = (
    <div
      ref={ref}
      aria-atomic="true"
      aria-live={politeness}
      className={cn(!visuallyHidden && "text-sm text-[var(--color-text-muted)]", className)}
      {...props}
    >
      {children}
    </div>
  );

  return visuallyHidden ? <VisuallyHidden>{content}</VisuallyHidden> : content;
});

export interface ShortcutHintProps extends HTMLAttributes<HTMLElement> {
  keys: readonly string[];
  label?: string;
}

export const ShortcutHint = forwardRef<HTMLElement, ShortcutHintProps>(function ShortcutHint(
  { className, keys, label = "Keyboard shortcut", ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn("inline-flex items-center gap-1", className)} {...props}>
      <VisuallyHidden>{`${label}: ${keys.join(" plus ")}`}</VisuallyHidden>
      {keys.map((key) => (
        <kbd
          key={key}
          aria-hidden="true"
          className="min-w-6 rounded-[var(--radius-sm)] border border-b-2 border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-[var(--color-text-muted)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
});

export interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
}

export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(function SkipLink(
  { children = "Skip to main content", className, href = "#main-content", ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={cn(
        "fixed top-4 left-4 z-[var(--z-toast)] -translate-y-24 rounded-[var(--radius-md)] bg-[var(--color-text)] px-4 py-3 font-semibold text-[var(--color-text-inverse)] transition-transform focus:translate-y-0 motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
});
