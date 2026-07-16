import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { NoteEditor } from "@/components/content/note-editor.client";
import type { CardTypeCode } from "@/lib/content/view-models";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export const metadata: Metadata = { title: "Note editor" };

export default async function NoteEditorPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ deckId: string }>;
  readonly searchParams: Promise<{ note?: string; type?: string }>;
}) {
  const [{ deckId }, query] = await Promise.all([params, searchParams]);
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}/edit` });
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck) notFound();
  if (deck.status !== "active" || !["owner", "manager", "editor"].includes(deck.role))
    redirect(`/app/decks/${deckId}` as Route);
  const note = query.note ? deck.notes.find((candidate) => candidate.id === query.note) : undefined;
  if (query.note && !note) notFound();
  const allowed = [
    "basic",
    "basic_reversed",
    "optional_reversed",
    "bidirectional",
    "custom",
    "typed_answer",
    "cloze",
    "image_occlusion",
    "multiple_choice",
    "select_all",
    "true_false",
    "ordering",
    "list_answer",
    "diagram",
    "audio_prompt",
    "pronunciation",
    "drawing",
  ];
  const kind = allowed.includes(query.type ?? "") ? (query.type as CardTypeCode) : "basic";
  return (
    <NoteEditor
      deckId={deck.id}
      existingNotes={deck.notes}
      initialKind={kind}
      {...(note ? { note } : {})}
    />
  );
}
