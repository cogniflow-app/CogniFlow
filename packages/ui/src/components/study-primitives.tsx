"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { motion, useReducedMotion } from "motion/react";
import {
  forwardRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn";

function getDocumentMotionPreference(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return root.dataset.motion === "reduce" || root.dataset.seriousMode === "true";
}

function subscribeToDocumentMotionPreference(onChange: () => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => undefined;
  }

  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-motion", "data-serious-mode"],
    attributes: true,
  });
  return () => observer.disconnect();
}

export interface CardFlipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onChange"
> {
  back: ReactNode;
  backLabel?: string;
  flipped: boolean;
  front: ReactNode;
  frontLabel?: string;
  onFlippedChange: (flipped: boolean) => void;
}

export const CardFlip = forwardRef<HTMLButtonElement, CardFlipProps>(function CardFlip(
  {
    back,
    backLabel = "Answer side",
    className,
    disabled,
    flipped,
    front,
    frontLabel = "Prompt side",
    onClick,
    onFlippedChange,
    type = "button",
    ...props
  },
  ref,
) {
  const systemReduceMotion = useReducedMotion();
  const documentReduceMotion = useSyncExternalStore(
    subscribeToDocumentMotionPreference,
    getDocumentMotionPreference,
    () => false,
  );
  const reduceMotion = Boolean(systemReduceMotion || documentReduceMotion);
  const currentLabel = flipped ? backLabel : frontLabel;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={`${currentLabel}. Activate to show ${flipped ? frontLabel.toLowerCase() : backLabel.toLowerCase()}.`}
      aria-pressed={flipped}
      data-flipped={flipped}
      disabled={disabled}
      className={cn(
        "lumen-card-flip block min-h-64 w-full appearance-none border-0 bg-transparent p-0 text-left text-inherit outline-none disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:rounded-[var(--radius-xl)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-4",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onFlippedChange(!flipped);
      }}
      {...props}
    >
      <motion.span
        initial={false}
        animate={{ rotateY: reduceMotion ? 0 : flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        className="lumen-card-flip__inner min-h-64"
        data-motion-mode={reduceMotion ? "reduced" : "full"}
      >
        <span
          aria-hidden={flipped}
          className="lumen-card-flip__face lumen-card-flip__front flex min-h-64 flex-col justify-center rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-[var(--shadow-md)] sm:p-8"
          hidden={reduceMotion && flipped}
        >
          <span className="mb-5 text-xs font-bold tracking-[0.12em] text-[var(--color-text-subtle)] uppercase">
            {frontLabel}
          </span>
          <span className="text-lg leading-relaxed text-[var(--color-text)]">{front}</span>
          <span className="mt-auto pt-8 text-sm font-medium text-[var(--color-text-muted)]">
            Press Space or Enter to flip
          </span>
        </span>
        <span
          aria-hidden={!flipped}
          className="lumen-card-flip__face lumen-card-flip__back flex min-h-64 flex-col justify-center rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--color-brand)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-brand)_7%,var(--color-surface-raised))] p-6 shadow-[var(--shadow-md)] sm:p-8"
          hidden={reduceMotion && !flipped}
        >
          <span className="mb-5 text-xs font-bold tracking-[0.12em] text-[var(--color-brand)] uppercase">
            {backLabel}
          </span>
          <span className="text-lg leading-relaxed text-[var(--color-text)]">{back}</span>
          <span className="mt-auto pt-8 text-sm font-medium text-[var(--color-text-muted)]">
            Press Space or Enter to return
          </span>
        </span>
      </motion.span>
    </button>
  );
});

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface TimerProgressProps extends HTMLAttributes<HTMLDivElement> {
  elapsedMs: number;
  label?: string;
  totalMs: number;
  warningAt?: number;
}

export const TimerProgress = forwardRef<HTMLDivElement, TimerProgressProps>(function TimerProgress(
  { className, elapsedMs, label = "Time remaining", totalMs, warningAt = 0.2, ...props },
  ref,
) {
  const safeTotal = Math.max(1, totalMs);
  const safeElapsed = Math.min(safeTotal, Math.max(0, elapsedMs));
  const remaining = safeTotal - safeElapsed;
  const remainingRatio = remaining / safeTotal;
  const percentage = Math.round(remainingRatio * 100);
  const urgent = remainingRatio <= warningAt;
  const readable = `${formatDuration(remaining)} remaining, ${percentage} percent`;
  return (
    <div ref={ref} className={cn("w-full", className)} {...props}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        <span
          role="timer"
          aria-live={urgent ? "polite" : "off"}
          className={cn(
            "font-mono text-sm font-bold text-[var(--color-text-muted)] tabular-nums",
            urgent && "text-[var(--color-danger)]",
          )}
        >
          {formatDuration(remaining)}
        </span>
      </div>
      <ProgressPrimitive.Root
        value={remaining}
        max={safeTotal}
        aria-label={label}
        aria-valuetext={readable}
        className="h-3 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)]"
      >
        <ProgressPrimitive.Indicator
          data-urgent={urgent || undefined}
          className="lumen-timer-track size-full origin-left bg-[var(--color-info)] transition-transform duration-[var(--duration-base)] data-[urgent=true]:bg-[var(--color-danger)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
      <span className="mt-1.5 block text-xs text-[var(--color-text-muted)]">
        {urgent ? "Time is running low" : `${percentage}% of the time remains`}
      </span>
    </div>
  );
});

export interface ScoreDisplayProps extends HTMLAttributes<HTMLDivElement> {
  delta?: number;
  label?: string;
  value: number;
}

export const ScoreDisplay = forwardRef<HTMLDivElement, ScoreDisplayProps>(function ScoreDisplay(
  { className, delta, label = "Score", value, ...props },
  ref,
) {
  const formatted = new Intl.NumberFormat("en-US").format(value);
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-game-accent-1)_14%,transparent)] text-[var(--color-game-accent-1)]"
      >
        ✦
      </span>
      <span>
        <span className="block text-xs font-bold tracking-wider text-[var(--color-text-subtle)] uppercase">
          {label}
        </span>
        <output
          aria-live="polite"
          aria-label={`${label}: ${formatted}`}
          className="block text-xl font-black text-[var(--color-text)] tabular-nums"
        >
          {formatted}
        </output>
      </span>
      {delta !== undefined && delta !== 0 && (
        <span
          className={cn(
            "ml-1 text-sm font-bold tabular-nums",
            delta > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
          )}
        >
          <span className="sr-only">{delta > 0 ? "increased by" : "decreased by"}</span>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </div>
  );
});

export interface StreakDisplayProps extends HTMLAttributes<HTMLDivElement> {
  count: number;
  label?: string;
  personalBest?: boolean;
}

export const StreakDisplay = forwardRef<HTMLDivElement, StreakDisplayProps>(function StreakDisplay(
  { className, count, label = "Correct answer streak", personalBest = false, ...props },
  ref,
) {
  const noun = count === 1 ? "answer" : "answers";
  return (
    <div
      ref={ref}
      role="status"
      aria-label={`${label}: ${count} ${noun}${personalBest ? ", personal best" : ""}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-bold text-[var(--color-text)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="text-[var(--color-warning)]">
        ◆
      </span>
      <span className="tabular-nums">{count}</span>
      <span className="font-medium text-[var(--color-text-muted)]">streak</span>
      {personalBest && (
        <span className="rounded-full bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-2 py-0.5 text-xs text-[var(--color-warning)]">
          Best
        </span>
      )}
    </div>
  );
});

export const Score = ScoreDisplay;
export const Streak = StreakDisplay;

export interface StudyProgressProps extends HTMLAttributes<HTMLDivElement> {
  current: number;
  label?: string;
  total: number;
}

export const StudyProgress = forwardRef<HTMLDivElement, StudyProgressProps>(function StudyProgress(
  { className, current, label = "Study progress", total, ...props },
  ref,
) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(safeTotal, Math.max(0, current));
  const percentage = Math.round((safeCurrent / safeTotal) * 100);
  const remaining = Math.max(0, total - current);

  return (
    <div ref={ref} className={cn("lumen-study-progress", className)} {...props}>
      <div className="lumen-study-progress__copy">
        <span>{label}</span>
        <span className="tabular-nums">
          {safeCurrent} of {total} · {remaining} remaining
        </span>
      </div>
      <ProgressPrimitive.Root
        aria-label={label}
        aria-valuetext={`${safeCurrent} of ${total}, ${remaining} remaining`}
        className="lumen-study-progress__track"
        max={safeTotal}
        value={safeCurrent}
      >
        <ProgressPrimitive.Indicator
          className="lumen-study-progress__indicator"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
});

export interface ConnectionStatusProps extends HTMLAttributes<HTMLSpanElement> {
  online: boolean;
}

export const ConnectionStatus = forwardRef<HTMLSpanElement, ConnectionStatusProps>(
  function ConnectionStatus({ className, online, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn("lumen-connection-status", className)}
        data-online={online}
        role="status"
        {...props}
      >
        <span aria-hidden="true" className="lumen-connection-status__dot" />
        {online ? "Online" : "Offline — ratings paused"}
      </span>
    );
  },
);

export interface RatingButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  interval: string;
  label: string;
  rating: "again" | "easy" | "good" | "hard";
  shortcut: string;
}

export const RatingButton = forwardRef<HTMLButtonElement, RatingButtonProps>(function RatingButton(
  { className, interval, label, rating, shortcut, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={`${label}, ${interval}, keyboard shortcut ${shortcut}`}
      className={cn("lumen-rating-button", className)}
      data-rating={rating}
      type={type}
      {...props}
    >
      <span className="lumen-rating-button__label">{label}</span>
      <span className="lumen-rating-button__interval">{interval}</span>
      <kbd className="lumen-rating-button__shortcut">{shortcut}</kbd>
    </button>
  );
});

export function RatingGroup({
  children,
  label = "Rate your recall",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div aria-label={label} className="lumen-rating-group" role="group">
      {children}
    </div>
  );
}
