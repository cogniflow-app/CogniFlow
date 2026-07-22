import type { PracticeAttemptResult, PracticeCardView } from "@/lib/practice/models";

interface ApiResponse<T> {
  readonly data?: T;
  readonly message?: string;
}

export async function recordPracticeAttempt({
  answerRevealed = false,
  card,
  durationMs,
  response,
  responseKind,
  retryCount = 0,
  selfVerdict,
}: {
  readonly answerRevealed?: boolean;
  readonly card: PracticeCardView;
  readonly durationMs: number;
  readonly response: string;
  readonly responseKind: string;
  readonly retryCount?: number;
  readonly selfVerdict?: "correct" | "partial" | "incorrect" | "needs_review";
}): Promise<PracticeAttemptResult> {
  const responseRequest = await fetch("/api/practice/attempts", {
    body: JSON.stringify({
      answerRevealed,
      attemptId: crypto.randomUUID(),
      durationMs: Math.max(0, Math.round(durationMs)),
      hintsUsed: 0,
      idempotencyKey: crypto.randomUUID(),
      itemPosition: card.item.position,
      response,
      responseKind,
      retryCount,
      selfConfidence: null,
      ...(selfVerdict ? { selfVerdict } : {}),
      sessionId: card.session.id,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await responseRequest
    .json()
    .catch(() => ({}))) as ApiResponse<PracticeAttemptResult>;
  if (!responseRequest.ok || !payload.data)
    throw new Error(payload.message ?? "Your answer could not be saved. Try again.");
  return payload.data;
}
