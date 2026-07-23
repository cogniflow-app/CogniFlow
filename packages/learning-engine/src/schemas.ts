import { z } from "zod";

import { learningLevels } from "./types";

export const practiceSessionConfigSchema = z
  .object({
    mode: z.enum([
      "flashcards",
      "learn",
      "write",
      "test",
      "match",
      "spell",
      "pronunciation",
      "diagram",
    ]),
    seed: z.string().trim().min(1).max(128),
    targetCount: z.number().int().min(1).max(10_000),
    deckIds: z.array(z.uuid()).max(200),
    rescheduling: z.boolean(),
    desiredLevel: z.enum(learningLevels).optional(),
  })
  .strict();
