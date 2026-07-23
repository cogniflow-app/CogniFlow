"use client";

import { Button, CheckIcon, FormField, Input, ProductPage, Select, Textarea } from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useOffline } from "@/components/offline/offline-provider.client";
import { NoteEditor } from "./note-editor.client";
import { CARD_TYPE_BY_CODE } from "@/lib/content/card-types";
import { PendingContentMutations, performContentMutation } from "@/lib/content/client-mutations";
import type {
  CardTypeCode,
  ContentMutationResult,
  DeckSummary,
  FolderSummary,
} from "@/lib/content/view-models";

const CARD_TYPE_GROUPS: readonly {
  readonly label: string;
  readonly types: readonly CardTypeCode[];
}[] = [
  {
    label: "Basic",
    types: ["basic", "basic_reversed", "optional_reversed", "bidirectional", "typed_answer"],
  },
  {
    label: "Quiz",
    types: ["multiple_choice", "select_all", "true_false"],
  },
  { label: "Structured", types: ["cloze", "ordering", "list_answer"] },
  {
    label: "Visual and media",
    types: ["image_occlusion", "diagram", "audio_prompt", "pronunciation", "drawing"],
  },
  { label: "Advanced", types: ["custom"] },
] as const;

export function NewDeckWizard({ folders = [] }: { readonly folders?: readonly FolderSummary[] }) {
  const router = useRouter();
  const offline = useOffline();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("none");
  const [cardType, setCardType] = useState<CardTypeCode>("basic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);
  const [localDeckId, setLocalDeckId] = useState<string | null>(null);
  const pendingMutations = useRef(new PendingContentMutations());
  const stepTwoHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 2) stepTwoHeadingRef.current?.focus();
  }, [step]);

  async function createDeck(openComposer: boolean) {
    if (savedLocally) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        const temporaryDeckId = await offline.queueDeckCreation({
          description,
          folderId: folderId === "none" ? null : folderId,
          title,
        });
        setSavedLocally(true);
        if (openComposer) setLocalDeckId(temporaryDeckId);
        setSubmitting(false);
        return;
      }
      const result = await performContentMutation<ContentMutationResult<DeckSummary>>({
        body: {
          description,
          folderId: folderId === "none" ? null : folderId,
          title,
          visibility: "private",
        },
        fallbackMessage: "The deck could not be created.",
        method: "POST",
        operation: "new-deck-wizard:create",
        pending: pendingMutations.current,
        url: "/api/content/decks",
      });
      router.push(
        (openComposer
          ? `/app/decks/${result.data.id}/edit?type=${encodeURIComponent(cardType)}`
          : `/app/decks/${result.data.id}`) as Route,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The deck could not be created.");
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      if (!title.trim()) {
        setError("Add a deck title to continue.");
        return;
      }
      setError(null);
      setStep(2);
      return;
    }
    await createDeck(true);
  }

  if (localDeckId) {
    return (
      <section aria-labelledby="offline-deck-composer" className="deck-creation-shell">
        <header>
          <p className="eyebrow">Saved on this browser</p>
          <h1 id="offline-deck-composer">{title}</h1>
          <p>
            Add cards now. This deck and its cards keep their causal order and receive canonical IDs
            after reconnection.
          </p>
        </header>
        <NoteEditor deckId={localDeckId} deckTitle={title} initialKind={cardType} />
      </section>
    );
  }

  return (
    <ProductPage className="editor-shell deck-creation-shell" data-guide-id="new-deck-wizard">
      <header className="editor-titlebar deck-creation-header">
        <div>
          <ol aria-label="Breadcrumb" className="breadcrumb-list">
            <li>
              <a href="/app">Library</a>
            </li>
            <li aria-current="page">New deck</li>
          </ol>
          <h1>Create a deck</h1>
          <p>Give it a name, then choose how you want to start studying.</p>
        </div>
        <ol className="deck-creation-steps" aria-label="Deck creation progress">
          <li aria-current={step === 1 ? "step" : undefined} data-complete={step > 1}>
            <span>{step > 1 ? <CheckIcon /> : "1"}</span> Details
          </li>
          <li aria-current={step === 2 ? "step" : undefined}>
            <span>2</span> First cards
          </li>
        </ol>
      </header>

      <form className="deck-creation-form" onSubmit={submit}>
        <p aria-atomic="true" aria-live="polite" className="visually-hidden">
          Step {step} of 2: {step === 1 ? "Name the deck" : "Choose what to add first"}
        </p>
        {step === 1 ? (
          <section aria-labelledby="deck-details-heading">
            <h2 id="deck-details-heading">Name the deck</h2>
            <div className="deck-details-fields">
              <FormField label="Deck title" required>
                <Input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  required
                  value={title}
                />
              </FormField>
              <FormField label="Description" description="Optional">
                <Textarea
                  maxLength={2_000}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                  rows={3}
                  value={description}
                />
              </FormField>
              <FormField label="Folder" description="Optional">
                <Select
                  onValueChange={setFolderId}
                  options={[
                    { label: "No folder", value: "none" },
                    ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
                  ]}
                  value={folderId}
                />
              </FormField>
            </div>
          </section>
        ) : (
          <section aria-labelledby="card-type-heading">
            <div className="deck-creation-section-heading">
              <div>
                <h2 id="card-type-heading" ref={stepTwoHeadingRef} tabIndex={-1}>
                  Choose what to add first
                </h2>
                <p>Basic is a great default. You can mix formats later.</p>
              </div>
              <span className="selected-card-type">
                Selected: {CARD_TYPE_BY_CODE[cardType].shortLabel}
              </span>
            </div>
            <div className="card-type-groups">
              {CARD_TYPE_GROUPS.map((group) => (
                <fieldset key={group.label}>
                  <legend>{group.label}</legend>
                  <div className="card-type-grid">
                    {group.types.map((code) => {
                      const descriptor = CARD_TYPE_BY_CODE[code];
                      return (
                        <button
                          aria-describedby={`card-type-${code}-detail`}
                          aria-pressed={cardType === code}
                          className="card-type-option"
                          key={code}
                          onClick={() => setCardType(code)}
                          type="button"
                        >
                          <span className="card-type-option__check" aria-hidden="true">
                            {cardType === code && <CheckIcon />}
                          </span>
                          <strong>{descriptor.shortLabel}</strong>
                          <span id={`card-type-${code}-detail`}>{descriptor.description}</span>
                          <small>
                            {descriptor.generatedCards}
                            {code === "basic" ? " · Recommended" : ""}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="deck-creation-error">
            {error}
          </p>
        )}
        {savedLocally && (
          <p className="offline-notice" role="status">
            Deck saved on this browser. It is waiting to sync before cards can be added online.
          </p>
        )}

        <footer className="deck-creation-actions">
          {step === 1 ? (
            <a href="/app">Cancel</a>
          ) : (
            <Button
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              variant="ghost"
            >
              Back
            </Button>
          )}
          <div className="deck-creation-actions__primary">
            {step === 2 && (
              <Button
                disabled={submitting || savedLocally}
                onClick={() => void createDeck(false)}
                variant="ghost"
              >
                Create deck without adding cards
              </Button>
            )}
            <Button
              disabled={savedLocally}
              loading={submitting}
              loadingLabel="Creating deck"
              size="lg"
              type="submit"
            >
              {savedLocally
                ? "Waiting to sync"
                : step === 1
                  ? "Continue"
                  : "Create deck and add cards"}
            </Button>
          </div>
        </footer>
      </form>
    </ProductPage>
  );
}
