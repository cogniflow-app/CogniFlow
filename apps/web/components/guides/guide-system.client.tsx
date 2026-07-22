"use client";

import { Button } from "@lumen/ui";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { globalGuide, guideByKey, type GuideDefinition } from "@/lib/guides/definitions";
import type { GuideProgressView } from "@/lib/guides/models";

export const startGuideEvent = "lumen:start-guide";

interface GuideEventDetail {
  readonly key: string;
  readonly progressId?: string;
  readonly step?: number;
}

interface ActiveGuide {
  readonly definition: GuideDefinition;
  readonly progressId: string;
  readonly step: number;
}

interface TargetBox {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export function GuideSystem({
  canCreate,
  initialProgress,
  reducedMotion,
}: {
  readonly canCreate: boolean;
  readonly initialProgress: GuideProgressView | null;
  readonly reducedMotion: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const coach = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [invitation, setInvitation] = useState(!initialProgress);
  const [active, setActive] = useState<ActiveGuide | null>(() =>
    initialProgress?.status === "in_progress"
      ? {
          definition: globalGuide,
          progressId: initialProgress.id,
          step: Math.min(initialProgress.currentStep, globalGuide.steps.length - 1),
        }
      : null,
  );
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [pending, setPending] = useState(false);

  const visibleSteps =
    active?.definition.steps.filter((step) => canCreate || !step.creatorOnly) ?? [];
  const stepIndex = active ? Math.min(active.step, Math.max(0, visibleSteps.length - 1)) : 0;
  const step = visibleSteps[stepIndex];

  async function persist(
    definition: GuideDefinition,
    progressId: string,
    status: "in_progress" | "completed" | "dismissed",
    currentStep: number,
  ): Promise<boolean> {
    const response = await fetch("/api/guides/progress", {
      body: JSON.stringify({
        currentStep,
        guideKey: definition.key,
        guideVersion: definition.version,
        metadata: { lastPath: pathname ?? "/app" },
        progressId,
        status,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.ok;
  }

  async function start(definition: GuideDefinition, stepNumber = 0, existingProgressId?: string) {
    if (pending) return;
    const progressId = existingProgressId ?? crypto.randomUUID();
    setPending(true);
    const saved = await persist(definition, progressId, "in_progress", stepNumber);
    setPending(false);
    if (!saved) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInvitation(false);
    setActive({ definition, progressId, step: stepNumber });
  }

  async function dismissInvitation(openGettingStarted = false) {
    if (pending) return;
    setPending(true);
    await persist(globalGuide, crypto.randomUUID(), "dismissed", 0);
    setInvitation(false);
    setPending(false);
    if (openGettingStarted) router.push("/app/getting-started" as Route);
  }

  async function finish(status: "completed" | "dismissed") {
    if (!active || pending) return;
    setPending(true);
    await persist(active.definition, active.progressId, status, stepIndex);
    setPending(false);
    setActive(null);
    setTargetBox(null);
    returnFocus.current?.focus();
  }

  async function move(next: number) {
    if (!active || pending) return;
    if (next >= visibleSteps.length) {
      await finish("completed");
      return;
    }
    const bounded = Math.max(0, next);
    setPending(true);
    await persist(active.definition, active.progressId, "in_progress", bounded);
    setActive({ ...active, step: bounded });
    setPending(false);
  }

  useEffect(() => {
    function onStartGuide(event: Event) {
      const key = (event as CustomEvent<GuideEventDetail>).detail?.key;
      const progressId = (event as CustomEvent<GuideEventDetail>).detail?.progressId;
      const stepNumber = (event as CustomEvent<GuideEventDetail>).detail?.step ?? 0;
      const definition = guideByKey(key);
      if (definition) void start(definition, stepNumber, progressId);
    }
    window.addEventListener(startGuideEvent, onStartGuide);
    return () => window.removeEventListener(startGuideEvent, onStartGuide);
  });

  useEffect(() => {
    if (!active || !step) return;
    let frame = 0;
    function locate(scrollTarget = false) {
      const target = document.querySelector<HTMLElement>(`[data-guide-id="${step?.target ?? ""}"]`);
      setTargetFound(Boolean(target));
      if (!target) {
        setTargetBox(null);
        return;
      }
      if (scrollTarget)
        target.scrollIntoView({
          behavior:
            reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          block: "center",
          inline: "nearest",
        });
      frame = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setTargetBox({ height: rect.height, left: rect.left, top: rect.top, width: rect.width });
      });
    }
    locate(true);
    const measure = () => locate(false);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const timeout = window.setTimeout(measure, 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, pathname, reducedMotion, step]);

  useEffect(() => {
    if (active && coach.current) coach.current.focus();
  }, [active, pathname]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Tab" && active && coach.current) {
        const focusable = [
          ...coach.current.querySelectorAll<HTMLElement>("button,[href],[tabindex]"),
        ].filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (active) {
        event.preventDefault();
        void persist(active.definition, active.progressId, "in_progress", stepIndex).then(() => {
          setActive(null);
          setTargetBox(null);
          returnFocus.current?.focus();
        });
      } else if (invitation) {
        event.preventDefault();
        void dismissInvitation();
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  });

  const onExpectedRoute = Boolean(step && pathname === step.href);
  const coachStyle = targetBox
    ? {
        left: `${String(Math.max(12, Math.min(window.innerWidth - 344, targetBox.left + targetBox.width / 2 - 160)))}px`,
        top: `${String(Math.max(12, Math.min(window.innerHeight - 250, targetBox.top + targetBox.height + 12)))}px`,
      }
    : undefined;
  const useAnchoredCoach =
    targetBox !== null && typeof window !== "undefined" && window.innerWidth > 768;

  return (
    <>
      {invitation && (
        <aside aria-labelledby="guide-welcome-title" className="guide-invitation" role="dialog">
          <button
            aria-label="Dismiss welcome guide"
            disabled={pending}
            onClick={() => void dismissInvitation()}
            type="button"
          >
            ×
          </button>
          <span aria-hidden="true" className="guide-invitation__mark">
            L
          </span>
          <h2 id="guide-welcome-title">Make Lumen yours in two minutes</h2>
          <p>
            Take a short interactive tour, or explore freely. Every guide can be restarted later.
          </p>
          <div>
            <Button disabled={pending} onClick={() => void start(globalGuide)} size="sm">
              Take the tour
            </Button>
            <Button
              disabled={pending}
              onClick={() => void dismissInvitation()}
              size="sm"
              variant="secondary"
            >
              Explore on my own
            </Button>
          </div>
          <button
            className="guide-invitation__link"
            disabled={pending}
            onClick={() => void dismissInvitation(true)}
            type="button"
          >
            Open Getting Started
          </button>
        </aside>
      )}

      {active && step && (
        <div className="guide-layer">
          {targetBox && onExpectedRoute && (
            <span
              aria-hidden="true"
              className="guide-target-ring"
              style={{
                height: `${String(targetBox.height + 12)}px`,
                left: `${String(targetBox.left - 6)}px`,
                top: `${String(targetBox.top - 6)}px`,
                width: `${String(targetBox.width + 12)}px`,
              }}
            />
          )}
          <div
            aria-describedby="guide-step-body"
            aria-labelledby="guide-step-title"
            className="guide-coach"
            ref={coach}
            role="dialog"
            style={onExpectedRoute && useAnchoredCoach ? coachStyle : undefined}
            tabIndex={-1}
          >
            <div className="guide-coach__topline">
              <span>
                {active.definition.label} · {stepIndex + 1} of {visibleSteps.length}
              </span>
              <button
                aria-label="Close and resume later"
                onClick={() =>
                  void persist(active.definition, active.progressId, "in_progress", stepIndex).then(
                    () => setActive(null),
                  )
                }
                type="button"
              >
                ×
              </button>
            </div>
            <h2 id="guide-step-title">{step.title}</h2>
            <p id="guide-step-body">{step.body}</p>
            {onExpectedRoute && !targetFound && (
              <p className="guide-coach__recovery">
                This control moved or is unavailable for your role. You can continue safely.
              </p>
            )}
            <div className="guide-coach__actions">
              <button disabled={pending} onClick={() => void finish("dismissed")} type="button">
                Skip
              </button>
              <span />
              {stepIndex > 0 && (
                <Button
                  disabled={pending}
                  onClick={() => void move(stepIndex - 1)}
                  size="sm"
                  variant="secondary"
                >
                  Back
                </Button>
              )}
              {!onExpectedRoute ? (
                <Button
                  disabled={pending}
                  onClick={() => router.push(step.href as Route)}
                  size="sm"
                >
                  {step.actionLabel ?? "Go there"}
                </Button>
              ) : (
                <Button disabled={pending} onClick={() => void move(stepIndex + 1)} size="sm">
                  {stepIndex === visibleSteps.length - 1 ? "Finish" : "Next"}
                </Button>
              )}
            </div>
          </div>
          <p className="visually-hidden" role="status">
            Guide step {stepIndex + 1} of {visibleSteps.length}: {step.title}. Target{" "}
            {targetFound ? "available" : "unavailable"}.
          </p>
        </div>
      )}
    </>
  );
}
