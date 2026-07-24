import type { NormalizedGraph } from "../src";

export function portabilityGraph(): NormalizedGraph {
  return {
    decks: [
      {
        description: "A compact biology deck.",
        externalId: "deck-1",
        folderPath: ["Science"],
        lineageId: "lineage-deck-1",
        notes: [
          {
            externalId: "note-1",
            fields: [
              { key: "Front", name: "Front", value: "What is ATP?" },
              {
                key: "Back",
                name: "Back",
                value: "The main energy-carrying molecule in cells.",
              },
            ],
            generatedCards: [
              {
                active: true,
                externalId: "card-1",
                generationKey: "forward",
                kind: "basic",
                ordinal: 0,
                templateKey: "forward",
              },
            ],
            lineageId: "lineage-note-1",
            mediaExternalIds: [],
            noteTypeCode: "basic",
            source: "Biology notes",
            tags: ["biology", "energy"],
          },
        ],
        sourceFormat: "lumen_archive",
        tags: ["science"],
        title: "Cell biology",
      },
    ],
    folders: [
      {
        externalId: "folder-1",
        name: "Science",
        parentExternalId: null,
        position: 0,
      },
    ],
    loss: [],
    mastery: [],
    media: [],
    noteTypes: [
      {
        code: "basic",
        externalId: "type-basic",
        fieldNames: ["Front", "Back"],
        name: "Basic",
        templates: [
          {
            answerFieldKey: "Back",
            back: "{{Back}}",
            front: "{{Front}}",
            name: "Forward",
            ordinal: 0,
            templateKey: "forward",
          },
        ],
      },
    ],
    practice: [],
    provenance: {
      adapter: "test",
      createdAt: "2026-07-23T12:00:00.000Z",
      sourceFormat: "lumen_archive",
      sourceName: "fixture",
    },
    publications: [],
    reviews: [
      {
        cardExternalId: "card-1",
        durationMs: 1_200,
        externalId: "review-1",
        learnerExternalId: "learner-1",
        rating: "good",
        reviewedAt: "2026-07-23T12:30:00.000Z",
        values: { factor: 2500, interval: 4, lastInterval: 1, type: 1 },
      },
    ],
    revisions: [],
    schedules: [
      {
        algorithm: "fsrs",
        cardExternalId: "card-1",
        dueAt: "2026-07-27T12:30:00.000Z",
        learnerExternalId: "learner-1",
        state: "review",
        values: {
          due: 4,
          factor: 2500,
          interval: 4,
          lapses: 0,
          queue: 2,
          repetitions: 1,
          state: 2,
        },
      },
    ],
    schemaVersion: 1,
    settings: { studyDayStartMinutes: 240 },
    warnings: [],
  };
}
