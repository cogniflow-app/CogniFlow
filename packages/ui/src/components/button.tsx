"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { SpinnerIcon } from "../lib/icons";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const baseClasses = [
  "relative inline-flex min-h-11 max-w-full min-w-0 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-2 text-center leading-snug font-semibold whitespace-normal",
  "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--easing-standard)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55",
  "active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
].join(" ");

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--color-brand)] text-[var(--color-brand-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-brand-hover)]",
  secondary:
    "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]",
  ghost:
    "border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-sunken)]",
  danger:
    "border-transparent bg-[var(--color-danger)] text-[var(--color-danger-contrast)] shadow-[var(--shadow-sm)] hover:brightness-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled = false,
    leadingIcon,
    loading = false,
    loadingLabel = "Working",
    size = "md",
    trailingIcon,
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <SpinnerIcon className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        leadingIcon
      )}
      <span className="min-w-0 text-center [overflow-wrap:anywhere]">
        {loading ? loadingLabel : children}
      </span>
      {!loading && trailingIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<
  ButtonProps,
  "children" | "leadingIcon" | "trailingIcon"
> {
  children: ReactNode;
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, label, size = "md", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      className={cn(
        "aspect-square rounded-full p-0",
        size === "sm" && "size-10",
        size === "md" && "size-11",
        size === "lg" && "size-12",
        className,
      )}
      size={size}
      {...props}
    >
      <span aria-hidden="true" className="grid size-5 place-items-center">
        {children}
      </span>
    </Button>
  );
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  disabled?: boolean;
  leadingIcon?: ReactNode;
  size?: ButtonSize;
  trailingIcon?: ReactNode;
  variant?: ButtonVariant;
}

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  {
    children,
    className,
    disabled = false,
    leadingIcon,
    onClick,
    size = "md",
    tabIndex,
    trailingIcon,
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <a
      ref={ref}
      aria-disabled={disabled || undefined}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      tabIndex={disabled ? -1 : tabIndex}
      {...props}
    >
      {leadingIcon}
      <span className="min-w-0 text-center [overflow-wrap:anywhere]">{children}</span>
      {trailingIcon}
    </a>
  );
});
