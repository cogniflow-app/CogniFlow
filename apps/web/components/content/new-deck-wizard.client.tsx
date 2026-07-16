"use client";

import { Button, FormField, Input, Textarea } from "@lumen/ui";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { CARD_TYPE_DESCRIPTORS } from "@/lib/content/card-types";
import type {
  CardTypeCode,
  ContentApiError,
  ContentMutationResult,
  DeckSummary,
} from "@/lib/content/view-models";

export function NewDeckWizard() {
  const router = useRouter();
  const [cardType, setCardType] = useState<CardTypeCode>("basic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/content/decks", {
      body: JSON.stringify({
        description: String(form.get("description") ?? ""),
        folderId: null,
        idempotencyKey: crypto.randomUUID(),
        title: String(form.get("title") ?? ""),
        visibility: "private",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = body as Partial<ContentApiError> | null;
      setError(failure?.message ?? "The deck could not be created.");
      setSubmitting(false);
      return;
    }
    const result = body as ContentMutationResult<DeckSummary>;
    router.push(`/app/decks/${result.data.id}/edit?type=${encodeURIComponent(cardType)}` as Route);
  }

  return (
    <div className="editor-shell">
      <header className="editor-titlebar">
        <div>
          <ol aria-label="Breadcrumb" className="breadcrumb-list">
            <li>
              <a href="/app">Library</a>
            </li>
            <li aria-current="page">Create deck</li>
          </ol>
          <h1>Start with the way you want to recall</h1>
          <p>
            Name the deck, then choose the first card type. You can mix all seventeen types in the
            same deck and change types without combining note content with future scheduling.
          </p>
        </div>
      </header>
      <form className="editor-layout" onSubmit={submit}>
        <div className="editor-main">
          <section className="editor-panel" aria-labelledby="deck-details-heading">
            <h2 id="deck-details-heading">Deck details</h2>
            <div className="mt-5 grid gap-5">
              <FormField label="Deck title" required>
                <Input autoFocus maxLength={120} name="title" required />
              </FormField>
              <FormField
                label="Description"
                description="Describe what belongs here. This becomes the public summary only if you later publish."
              >
                <Textarea maxLength={2_000} name="description" rows={4} />
              </FormField>
            </div>
          </section>
          <section className="editor-panel" aria-labelledby="card-type-heading">
            <h2 id="card-type-heading">First card type</h2>
            <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              Recognition, recall, visual, audio, and self-review formats are separate contracts; no
              scheduling action occurs while authoring.
            </p>
            <div className="card-type-grid">
              {CARD_TYPE_DESCRIPTORS.map((descriptor) => (
                <button
                  aria-describedby={`card-type-${descriptor.code}-detail`}
                  aria-pressed={cardType === descriptor.code}
                  className="card-type-option"
                  key={descriptor.code}
                  onClick={() => setCardType(descriptor.code)}
                  type="button"
                >
                  <strong>{descriptor.shortLabel}</strong>
                  <span id={`card-type-${descriptor.code}-detail`}>{descriptor.description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="editor-sidebar" aria-label="Creation summary">
          <section className="preview-panel">
            <h2>{CARD_TYPE_DESCRIPTORS.find((item) => item.code === cardType)?.label}</h2>
            <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              {CARD_TYPE_DESCRIPTORS.find((item) => item.code === cardType)?.editorHint}
            </p>
            <p className="text-sm font-bold text-[var(--color-brand)]">
              {CARD_TYPE_DESCRIPTORS.find((item) => item.code === cardType)?.generatedCards}
            </p>
          </section>
          {error && (
            <p
              role="alert"
              className="m-0 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-3 text-sm text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}
          <Button loading={submitting} loadingLabel="Creating deck" size="lg" type="submit">
            Create deck and continue
          </Button>
          <a className="text-center text-sm font-bold text-[var(--color-text-muted)]" href="/app">
            Cancel
          </a>
        </aside>
      </form>
    </div>
  );
}
