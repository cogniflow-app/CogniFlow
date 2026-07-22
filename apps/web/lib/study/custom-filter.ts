import { z } from "zod";

export const studyFilterModes = [
  "today",
  "new_only",
  "due_only",
  "forgotten_today",
  "leeches",
  "starred",
  "review_ahead",
  "cram",
  "folder",
  "tag_query",
  "interval_range",
  "card_state",
] as const;

export const studyFilterDefinitionSchema = z
  .object({
    deckId: z.uuid().optional(),
    deckIds: z.array(z.uuid()).min(1).max(100).optional(),
    intervalRangeDays: z
      .object({
        max: z.number().int().min(0).max(36_500),
        min: z.number().int().min(0).max(36_500),
      })
      .strict()
      .optional(),
    mode: z.enum(studyFilterModes),
    rescheduling: z.boolean(),
    reviewOrder: z.enum(["due", "random", "relative_overdueness", "retrievability"]).optional(),
    stateFilter: z
      .array(z.enum(["new", "learning", "review", "relearning"]))
      .min(1)
      .max(4)
      .optional(),
    tagQuery: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.deckId && value.deckIds)
      context.addIssue({ code: "custom", message: "Choose one deck scope.", path: ["deckIds"] });
    if (value.intervalRangeDays && value.intervalRangeDays.min > value.intervalRangeDays.max)
      context.addIssue({
        code: "custom",
        message: "Interval range is reversed.",
        path: ["intervalRangeDays"],
      });
    if (value.mode === "tag_query" && !value.tagQuery)
      context.addIssue({ code: "custom", message: "A tag is required.", path: ["tagQuery"] });
    if (value.mode === "interval_range" && !value.intervalRangeDays)
      context.addIssue({
        code: "custom",
        message: "An interval range is required.",
        path: ["intervalRangeDays"],
      });
    if (value.mode === "card_state" && !value.stateFilter)
      context.addIssue({
        code: "custom",
        message: "A card state is required.",
        path: ["stateFilter"],
      });
    if (value.mode === "folder" && !value.deckIds)
      context.addIssue({
        code: "custom",
        message: "Folder decks are required.",
        path: ["deckIds"],
      });
  });

export type StudyFilterDefinition = z.infer<typeof studyFilterDefinitionSchema>;
