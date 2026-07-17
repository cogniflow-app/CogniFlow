import {
  cardAuthoringSchema,
  customFieldPlainText,
  type CardAuthoringData,
  type CardKind,
} from "./card-types";
import { createStudyRendererContract, type StudyRendererContract } from "./study-renderer";
import { DomainValidationError, contentFingerprint } from "./validation";

export const CARD_GENERATION_VERSION = 1 as const;

export interface GeneratedCardBlueprint {
  readonly generationVersion: typeof CARD_GENERATION_VERSION;
  readonly cardKind: CardKind;
  readonly semanticKey: string;
  readonly generationKey: string;
  readonly ordinal: number;
  readonly contentFingerprint: string;
  readonly renderer: StudyRendererContract;
}

export interface ExistingGeneratedCard {
  readonly id: string;
  readonly cardKind: CardKind;
  readonly semanticKey: string;
  readonly generationKey: string;
  readonly ordinal: number;
  readonly contentVersion: number;
  readonly active: boolean;
}

export interface ReconciledGeneratedCard {
  readonly id: string;
  readonly blueprint: GeneratedCardBlueprint;
  readonly contentVersion: number;
  readonly disposition: "preserved" | "reactivated";
}

export interface CreatedGeneratedCard {
  readonly blueprint: GeneratedCardBlueprint;
  readonly contentVersion: number;
  readonly disposition: "created";
}

export interface DeactivatedGeneratedCard {
  readonly id: string;
  readonly generationKey: string;
  readonly previousContentVersion: number;
  readonly disposition: "deactivated";
}

export interface CardGenerationIdentityConflict {
  readonly code: "duplicate_existing_key" | "identity_mismatch";
  readonly generationKey: string;
  readonly existingCardIds: readonly string[];
  readonly message: string;
}

export interface CardReconciliationSuccess {
  readonly ok: true;
  readonly active: readonly ReconciledGeneratedCard[];
  readonly created: readonly CreatedGeneratedCard[];
  readonly deactivated: readonly DeactivatedGeneratedCard[];
  readonly inactiveUnchanged: readonly ExistingGeneratedCard[];
}

export interface CardReconciliationFailure {
  readonly ok: false;
  readonly conflicts: readonly CardGenerationIdentityConflict[];
}

export type CardReconciliationResult = CardReconciliationSuccess | CardReconciliationFailure;

function validateSemanticKey(semanticKey: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u.test(semanticKey)) {
    throw new DomainValidationError("generated-card semantic key", [
      { path: "$.semanticKey", code: "invalid_semantic_key", message: "Semantic key is invalid" },
    ]);
  }
}

export function createGenerationKey(cardKind: CardKind, semanticKey: string): string {
  validateSemanticKey(semanticKey);
  return `g${CARD_GENERATION_VERSION}:${cardKind}:${encodeURIComponent(semanticKey)}`;
}

function semanticKeysForCard(card: CardAuthoringData): readonly string[] {
  switch (card.kind) {
    case "basic":
      return ["forward"];
    case "basic_reversed":
      return ["forward", "reverse"];
    case "optional_reversed":
      return card.reverseEnabled ? ["forward", "reverse"] : ["forward"];
    case "bidirectional":
      return ["a_to_b", "b_to_a"];
    case "custom":
      return card.templates
        .filter((template) => {
          if (!template.generationCondition) return true;
          const field = card.fields[template.generationCondition.field];
          if (!field) return false;
          const value = customFieldPlainText(field).trim();
          return template.generationCondition.when === "nonempty"
            ? value.length > 0
            : value.length === 0;
        })
        .map((template) => template.semanticKey);
    case "typed_answer":
      return ["typed"];
    case "cloze":
      return card.clozes.map((cloze) => cloze.semanticKey);
    case "image_occlusion":
      return [...new Set(card.occlusions.map((region) => region.groupKey))];
    case "multiple_choice":
    case "select_all":
      return ["choice"];
    case "true_false":
      return ["boolean"];
    case "ordering":
      return ["sequence"];
    case "list_answer":
      return ["list"];
    case "diagram":
      return card.hotspots.flatMap((hotspot) => {
        if (hotspot.promptDirection === "both") {
          return [
            `${hotspot.semanticKey}:region_to_label`,
            `${hotspot.semanticKey}:label_to_region`,
          ];
        }
        return [`${hotspot.semanticKey}:${hotspot.promptDirection}`];
      });
    case "audio_prompt":
      return ["audio"];
    case "pronunciation":
      return ["pronunciation"];
    case "drawing":
      return ["drawing"];
  }
}

/**
 * Generates only semantic study units. It deliberately contains no scheduling state,
 * learner state, random identifiers, wall-clock time, or provider calls.
 */
export function generateCardBlueprints(
  input: CardAuthoringData,
): readonly GeneratedCardBlueprint[] {
  const card = cardAuthoringSchema.parse(input);
  const semanticKeys = semanticKeysForCard(card);
  if (new Set(semanticKeys).size !== semanticKeys.length) {
    throw new DomainValidationError("generated cards", [
      {
        path: "$.semanticKeys",
        code: "duplicate_generation_identity",
        message: "Generated card semantic identities must be unique",
      },
    ]);
  }
  return Object.freeze(
    semanticKeys.map((semanticKey, ordinal) => {
      const generationKey = createGenerationKey(card.kind, semanticKey);
      const renderer = createStudyRendererContract(card, semanticKey, generationKey);
      return Object.freeze({
        generationVersion: CARD_GENERATION_VERSION,
        cardKind: card.kind,
        semanticKey,
        generationKey,
        ordinal,
        contentFingerprint: contentFingerprint(renderer),
        renderer,
      });
    }),
  );
}

export function reconcileGeneratedCards(input: {
  readonly existing: readonly ExistingGeneratedCard[];
  readonly desired: readonly GeneratedCardBlueprint[];
  readonly contentVersion: number;
}): CardReconciliationResult {
  if (!Number.isSafeInteger(input.contentVersion) || input.contentVersion < 1) {
    throw new DomainValidationError("card reconciliation", [
      {
        path: "$.contentVersion",
        code: "invalid_version",
        message: "Content version must be a positive safe integer",
      },
    ]);
  }

  const existingByKey = new Map<string, ExistingGeneratedCard[]>();
  for (const existing of input.existing) {
    const values = existingByKey.get(existing.generationKey) ?? [];
    values.push(existing);
    existingByKey.set(existing.generationKey, values);
  }

  const conflicts: CardGenerationIdentityConflict[] = [];
  for (const [generationKey, existing] of existingByKey) {
    if (existing.length > 1) {
      conflicts.push({
        code: "duplicate_existing_key",
        generationKey,
        existingCardIds: Object.freeze(existing.map((card) => card.id).sort()),
        message: "Multiple stored cards use one generation identity",
      });
    }
  }

  const desiredKeys = new Set<string>();
  for (const desired of input.desired) {
    if (desired.generationKey !== createGenerationKey(desired.cardKind, desired.semanticKey)) {
      throw new DomainValidationError("card reconciliation", [
        {
          path: "$.desired",
          code: "noncanonical_generation_key",
          message: "Desired card generation identities must use the canonical key format",
        },
      ]);
    }
    if (desiredKeys.has(desired.generationKey)) {
      throw new DomainValidationError("card reconciliation", [
        {
          path: "$.desired",
          code: "duplicate_desired_key",
          message: "Desired cards contain a duplicate generation identity",
        },
      ]);
    }
    desiredKeys.add(desired.generationKey);
    const existing = existingByKey.get(desired.generationKey)?.[0];
    if (
      existing &&
      (existing.semanticKey !== desired.semanticKey || existing.cardKind !== desired.cardKind)
    ) {
      conflicts.push({
        code: "identity_mismatch",
        generationKey: desired.generationKey,
        existingCardIds: Object.freeze([existing.id]),
        message:
          "A stored generation key points at different card semantics and cannot be repurposed",
      });
    }
  }
  if (conflicts.length > 0) {
    return Object.freeze({
      ok: false,
      conflicts: Object.freeze(
        conflicts.sort((left, right) => left.generationKey.localeCompare(right.generationKey)),
      ),
    });
  }

  const active: ReconciledGeneratedCard[] = [];
  const created: CreatedGeneratedCard[] = [];
  for (const desired of input.desired) {
    const existing = existingByKey.get(desired.generationKey)?.[0];
    if (existing) {
      active.push(
        Object.freeze({
          id: existing.id,
          blueprint: desired,
          contentVersion: input.contentVersion,
          disposition: existing.active ? "preserved" : "reactivated",
        }),
      );
    } else {
      created.push(
        Object.freeze({
          blueprint: desired,
          contentVersion: input.contentVersion,
          disposition: "created",
        }),
      );
    }
  }

  const deactivated: DeactivatedGeneratedCard[] = [];
  const inactiveUnchanged: ExistingGeneratedCard[] = [];
  for (const existing of input.existing) {
    if (desiredKeys.has(existing.generationKey)) continue;
    if (existing.active) {
      deactivated.push(
        Object.freeze({
          id: existing.id,
          generationKey: existing.generationKey,
          previousContentVersion: existing.contentVersion,
          disposition: "deactivated",
        }),
      );
    } else {
      inactiveUnchanged.push(existing);
    }
  }

  return Object.freeze({
    ok: true,
    active: Object.freeze(active),
    created: Object.freeze(created),
    deactivated: Object.freeze(deactivated),
    inactiveUnchanged: Object.freeze(inactiveUnchanged),
  });
}
