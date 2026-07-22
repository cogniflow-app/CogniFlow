import type { ExamPlan, ExamPlanDay, ExamPlanInput } from "./types";

const dayMs = 86_400_000;

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildExamPlan(input: ExamPlanInput): ExamPlan {
  const now = new Date(input.now);
  const exam = new Date(input.examAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(exam.getTime()) || exam <= now) {
    throw new Error("The exam date must be a valid future date.");
  }
  const rawDays = Math.max(1, Math.ceil((exam.getTime() - now.getTime()) / dayMs));
  const studyDates: Date[] = [];
  for (let offset = 0; offset < rawDays; offset += 1) {
    const date = new Date(now.getTime() + offset * dayMs);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    if (input.includeWeekends || !weekend) studyDates.push(date);
  }
  if (studyDates.length === 0) studyDates.push(now);

  const averageMastery = Math.max(0, Math.min(1, input.averageMastery));
  const learningPasses = 1 + (1 - averageMastery) * 1.5;
  const totalEstimatedMinutes = Math.ceil(
    Math.max(0, input.candidateCount) * Math.max(0.1, input.minutesPerItem) * learningPasses,
  );
  const recommendedItemsPerDay = Math.ceil(Math.max(0, input.candidateCount) / studyDates.length);
  const capacity = Math.max(1, input.minutesAvailablePerDay) * studyDates.length;
  const feasible = totalEstimatedMinutes <= capacity;
  const days: ExamPlanDay[] = studyDates.map((date, index) => {
    const progress = studyDates.length === 1 ? 1 : index / (studyDates.length - 1);
    const focus =
      progress < 0.3
        ? "learn"
        : progress < 0.72
          ? "mixed"
          : progress < 0.92
            ? "recall"
            : "light_review";
    const remainingItems = Math.max(0, input.candidateCount - recommendedItemsPerDay * index);
    const items = Math.min(recommendedItemsPerDay, remainingItems);
    return Object.freeze({
      studyDay: utcDay(date),
      items,
      estimatedMinutes: Math.min(
        Math.max(1, input.minutesAvailablePerDay),
        Math.ceil(items * Math.max(0.1, input.minutesPerItem) * learningPasses),
      ),
      focus,
    });
  });

  return Object.freeze({
    daysAvailable: studyDates.length,
    totalEstimatedMinutes,
    recommendedItemsPerDay,
    feasible,
    warning: feasible
      ? null
      : "The current time budget is unlikely to cover every item. Narrow the scope, add time, or move the exam date.",
    days: Object.freeze(days),
  });
}
