"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button, IconButton } from "./button";
import {
  CheckIcon,
  CloseIcon,
  InfoIcon,
  RefreshIcon,
  ShieldIcon,
  SpinnerIcon,
  WarningIcon,
} from "../lib/icons";
import { cn } from "../lib/cn";

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  action?: ToastAction;
  description?: ReactNode;
  duration?: number;
  title: ReactNode;
  tone?: ToastTone;
}

interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastContextValue {
  dismiss: (id: string) => void;
  notify: (toast: ToastInput) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastToneClasses: Record<ToastTone, string> = {
  neutral: "border-[var(--color-border)]",
  success: "border-l-4 border-l-[var(--color-success)]",
  warning: "border-l-4 border-l-[var(--color-warning)]",
  danger: "border-l-4 border-l-[var(--color-danger)]",
  info: "border-l-4 border-l-[var(--color-info)]",
};

export interface ToastProps extends ToastRecord {
  onDismiss: (id: string) => void;
}

export function Toast({
  action,
  description,
  duration = 5000,
  id,
  onDismiss,
  title,
  tone = "neutral",
}: ToastProps) {
  return (
    <ToastPrimitive.Root
      duration={duration}
      onOpenChange={(open) => {
        if (!open) onDismiss(id);
      }}
      className={cn(
        "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-[var(--radius-lg)] border bg-[var(--color-surface-raised)] p-4 text-[var(--color-text)] shadow-[var(--shadow-lg)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] motion-reduce:animate-none",
        toastToneClasses[tone],
      )}
    >
      <div className="min-w-0">
        <ToastPrimitive.Title className="text-sm font-bold">{title}</ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {description}
          </ToastPrimitive.Description>
        )}
        {action && (
          <ToastPrimitive.Action altText={action.label} asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 min-h-9 px-2"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close asChild>
        <IconButton label="Dismiss notification" variant="ghost" size="sm" className="-mt-2 -mr-2">
          <CloseIcon />
        </IconButton>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
  label?: string;
}

export function ToastProvider({ children, label = "Notifications" }: ToastProviderProps) {
  const [messages, setMessages] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);
  const notify = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setMessages((current) => [...current, { ...input, id }]);
    return id;
  }, []);
  const value = useMemo<ToastContextValue>(() => ({ dismiss, notify }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider label={label} swipeDirection="right">
        {children}
        {messages.map((message) => (
          <Toast key={message.id} {...message} onDismiss={dismiss} />
        ))}
        <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[var(--z-toast)] m-0 flex max-h-dvh w-full max-w-md list-none flex-col gap-3 p-4 outline-none sm:p-6" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export interface StatePanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}

function StatePanel({
  action,
  children,
  className,
  description,
  icon,
  title,
  ...props
}: StatePanelProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-xl flex-col items-center rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-5 grid size-14 place-items-center rounded-2xl bg-[var(--color-surface-sunken)] text-[var(--color-brand)] [&>svg]:size-7"
        >
          {icon}
        </div>
      )}
      <h2 className="m-0 text-xl font-bold tracking-[-0.015em] text-[var(--color-text)]">
        {title}
      </h2>
      <div className="mt-2 max-w-md leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </div>
      {children}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export interface EmptyStateProps extends Omit<StatePanelProps, "icon"> {
  icon?: ReactNode;
}

export function EmptyState({ icon = <InfoIcon />, ...props }: EmptyStateProps) {
  return <StatePanel icon={icon} {...props} />;
}

export interface ErrorStateProps extends Omit<StatePanelProps, "action" | "icon"> {
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
}

export function ErrorState({
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  ...props
}: ErrorStateProps) {
  return (
    <StatePanel
      role="alert"
      icon={<WarningIcon />}
      action={
        onRetry ? (
          <Button
            variant="secondary"
            onClick={onRetry}
            loading={retrying}
            loadingLabel="Trying again"
            leadingIcon={<RefreshIcon className="size-4" />}
          >
            {retryLabel}
          </Button>
        ) : undefined
      }
      {...props}
    />
  );
}

export interface PermissionStateProps extends Omit<
  StatePanelProps,
  "description" | "icon" | "title"
> {
  description?: ReactNode;
  resourceName?: string;
  title?: ReactNode;
}

export function PermissionState({
  description,
  resourceName,
  title = "Access needed",
  ...props
}: PermissionStateProps) {
  return (
    <StatePanel
      icon={<ShieldIcon />}
      title={title}
      description={
        description ??
        `You do not currently have permission to open ${resourceName ?? "this item"}.`
      }
      {...props}
    />
  );
}

export interface OfflineBannerProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function OfflineBanner({
  className,
  message = "You’re offline. Changes will wait safely on this device.",
  onRetry,
  retrying = false,
  ...props
}: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 border-b border-[color-mix(in_srgb,var(--color-warning)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-4 py-3 text-sm text-[var(--color-text)] sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <span className="flex items-start gap-2 font-medium">
        <WarningIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
        {message}
      </span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          loading={retrying}
          loadingLabel="Checking"
          onClick={onRetry}
          className="self-start sm:self-auto"
        >
          Check connection
        </Button>
      )}
    </div>
  );
}

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";

const syncLabels: Record<SyncState, string> = {
  idle: "Ready to sync",
  syncing: "Syncing changes",
  synced: "All changes saved",
  offline: "Waiting for connection",
  error: "Sync needs attention",
};

export interface SyncIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  state: SyncState;
}

export function SyncIndicator({ className, label, state, ...props }: SyncIndicatorProps) {
  const text = label ?? syncLabels[state];
  const Icon =
    state === "syncing"
      ? SpinnerIcon
      : state === "synced"
        ? CheckIcon
        : state === "error" || state === "offline"
          ? WarningIcon
          : InfoIcon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]",
        state === "error" && "text-[var(--color-danger)]",
        state === "offline" && "text-[var(--color-warning)]",
        state === "synced" && "text-[var(--color-success)]",
        className,
      )}
      {...props}
    >
      <Icon
        className={cn("size-3.5", state === "syncing" && "animate-spin motion-reduce:animate-none")}
      />
      <span>{text}</span>
    </div>
  );
}
