"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { SpinnerIcon } from "../lib/icons";
import { cn } from "../lib/cn";

export type SurfaceTone = "default" | "raised" | "sunken" | "brand";

const surfaceTones: Record<SurfaceTone, string> = {
  default: "border-[var(--color-border)] bg-[var(--color-surface)]",
  raised: "border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-md)]",
  sunken: "border-transparent bg-[var(--color-surface-sunken)]",
  brand:
    "border-[color-mix(in_srgb,var(--color-brand)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-brand)_7%,var(--color-surface))]",
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  tone?: SurfaceTone;
}

const surfacePadding = { none: "p-0", sm: "p-3", md: "p-5", lg: "p-6 sm:p-8" } as const;

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { children, className, padding = "md", tone = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] border text-[var(--color-text)]",
        surfaceTones[tone],
        surfacePadding[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  disabled?: boolean;
  interactive?: boolean;
  loading?: boolean;
  selected?: boolean;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    children,
    className,
    disabled = false,
    interactive = false,
    loading = false,
    onClick,
    onKeyDown,
    selected = false,
    tabIndex,
    ...props
  },
  ref,
) {
  return (
    <article
      ref={ref}
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      data-selected={selected || undefined}
      role={interactive ? "button" : undefined}
      className={cn(
        "relative rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-[var(--shadow-sm)]",
        interactive &&
          "cursor-pointer transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:outline-none motion-reduce:transform-none motion-reduce:transition-none",
        selected && "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]",
        disabled && "pointer-events-none cursor-not-allowed opacity-55",
        className,
      )}
      onClick={(event) => {
        if (!disabled) onClick?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!interactive || disabled || event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      tabIndex={interactive && !disabled ? (tabIndex ?? 0) : tabIndex}
      {...props}
    >
      {loading && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
          <SpinnerIcon className="size-4 animate-spin motion-reduce:animate-none" /> Loading
        </span>
      )}
      {children}
    </article>
  );
});

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const badgeTones: Record<BadgeTone, string> = {
  neutral:
    "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]",
  brand:
    "border-[color-mix(in_srgb,var(--color-brand)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_11%,transparent)] text-[var(--color-brand)]",
  success:
    "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_11%,transparent)] text-[var(--color-success)]",
  warning:
    "border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_11%,transparent)] text-[var(--color-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_11%,transparent)] text-[var(--color-danger)]",
  info: "border-[color-mix(in_srgb,var(--color-info)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-info)_11%,transparent)] text-[var(--color-info)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  dot?: boolean;
  tone?: BadgeTone;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { children, className, dot = false, tone = "neutral", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
});

export interface AvatarProps {
  alt: string;
  className?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  src?: string;
}

const avatarSizes = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-16 text-lg" } as const;

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { alt, className, fallback, size = "md", src },
  ref,
) {
  const initials =
    fallback ??
    alt
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] font-bold text-[var(--color-text-muted)]",
        avatarSizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        aria-label={alt}
        className="grid size-full place-items-center"
        delayMs={src ? 300 : 0}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});

export interface ProgressProps {
  className?: string;
  label: string;
  max?: number;
  showValue?: boolean;
  size?: "sm" | "md";
  value: number;
  valueLabel?: string;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, label, max = 100, showValue = true, size = "md", value, valueLabel },
  ref,
) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(safeMax, Math.max(0, value));
  const percentage = Math.round((safeValue / safeMax) * 100);
  const readableValue = valueLabel ?? `${percentage}%`;
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-[var(--color-text)]">{label}</span>
        {showValue && (
          <span className="text-[var(--color-text-muted)] tabular-nums">{readableValue}</span>
        )}
      </div>
      <ProgressPrimitive.Root
        value={safeValue}
        max={safeMax}
        aria-label={label}
        aria-valuetext={readableValue}
        className={cn(
          "relative overflow-hidden rounded-full bg-[var(--color-surface-sunken)]",
          size === "sm" ? "h-1.5" : "h-2.5",
        )}
      >
        <ProgressPrimitive.Indicator
          className="size-full origin-left bg-[var(--color-brand)] transition-transform duration-[var(--duration-base)] ease-[var(--easing-standard)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
});

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  lines?: number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, label, lines = 1, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("grid gap-2", className)}
      {...props}
    >
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span
          key={index}
          className={cn(
            "block h-4 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] motion-reduce:animate-none",
            index === lines - 1 && lines > 1 && "w-3/4",
          )}
        />
      ))}
    </div>
  );
});
