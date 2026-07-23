export interface GuideStep {
  readonly actionLabel?: string;
  readonly body: string;
  readonly creatorOnly?: boolean;
  readonly href: string;
  readonly target: string;
  readonly title: string;
}

export interface GuideDefinition {
  readonly key: string;
  readonly label: string;
  readonly learnerScoped: boolean;
  readonly steps: readonly GuideStep[];
  readonly version: number;
}

export const globalGuide: GuideDefinition = Object.freeze({
  key: "global-tour",
  label: "Lumen essentials",
  learnerScoped: false,
  version: 1,
  steps: Object.freeze([
    {
      body: "Move between learning, content, account settings, and Help without losing your place.",
      href: "/app",
      target: "workspace-navigation",
      title: "Your workspace",
    },
    {
      body: "Your private decks, folders, and recent work live here.",
      href: "/app",
      target: "library-main",
      title: "Library and decks",
    },
    {
      actionLabel: "Try creating a deck",
      body: "A card entry stores your content. Lumen can generate one or more study cards from it.",
      creatorOnly: true,
      href: "/app/decks/new",
      target: "new-deck-wizard",
      title: "Add study material",
    },
    {
      body: "Choose adaptive Learn, Flashcards, Write, Test, Match, language, or diagram practice in one place.",
      href: "/app/study",
      target: "study-modes",
      title: "Practice your way",
    },
    {
      body: "Review updates due dates. Learn builds separate mastery and asks before any eligible SRS update.",
      href: "/app/study",
      target: "review-today",
      title: "Review and Learn are different",
    },
    {
      body: "Statistics explain canonical review history, workload, and recall trends.",
      href: "/app/stats",
      target: "statistics-overview",
      title: "See your progress",
    },
    {
      body: "Change scheduling and accessibility preferences in Settings, or restart any tour from Help & guide.",
      href: "/app/getting-started",
      target: "getting-started-center",
      title: "Settings and Help",
    },
  ]),
});

function mini(
  key: string,
  label: string,
  href: string,
  target: string,
  body: string,
  creatorOnly = false,
): GuideDefinition {
  return Object.freeze({
    key,
    label,
    learnerScoped: true,
    version: 1,
    steps: Object.freeze([
      { body, creatorOnly, href, target, title: label },
      {
        body: "Use the visible primary action when you are ready. You can restart this guide from Getting Started.",
        creatorOnly,
        href,
        target,
        title: "Try it with real content",
      },
    ]),
  });
}

export const miniGuides: readonly GuideDefinition[] = Object.freeze([
  mini(
    "first-deck",
    "Create your first deck",
    "/app/decks/new",
    "new-deck-wizard",
    "Name a deck, choose a starting path, then save real material.",
    true,
  ),
  mini(
    "basic-card",
    "Add a Basic card",
    "/app",
    "library-main",
    "Open a deck and add a prompt and answer. Saving creates the generated study card.",
    true,
  ),
  mini(
    "entries-vs-cards",
    "Card entries and study cards",
    "/app",
    "library-main",
    "A card entry is editable source content; generated study cards are what sessions present.",
    true,
  ),
  mini(
    "srs-review",
    "Start SRS Review",
    "/app/study",
    "review-today",
    "Review due cards when you want answers to update the long-term schedule.",
  ),
  mini(
    "adaptive-learn",
    "Use adaptive Learn",
    "/app/study",
    "mode-learn",
    "Learn changes question type as recognition and recall evidence grow.",
  ),
  mini(
    "flashcards",
    "Use Flashcards",
    "/app/study",
    "mode-flashcards",
    "Flip, swipe, sort, and autoplay without changing due dates.",
  ),
  mini(
    "practice-test",
    "Create a Test",
    "/app/study",
    "mode-test",
    "Choose a seeded question mix, timing, and scope. Scores stay in practice.",
  ),
  mini(
    "match",
    "Play Match",
    "/app/study",
    "mode-match",
    "Pair prompts and answers with touch, pointer, or the keyboard list.",
  ),
  mini(
    "write",
    "Use Write",
    "/app/study",
    "mode-write",
    "Type what you remember, review differences, and complete a spaced second pass.",
  ),
  mini(
    "language-practice",
    "Spell and pronounce",
    "/app/study",
    "mode-spell",
    "Use local speech and optional local-only recording with text alternatives.",
  ),
  mini(
    "diagram-practice",
    "Study a diagram",
    "/app/study",
    "mode-diagram",
    "Use visual regions or the equivalent keyboard label flow.",
  ),
  mini(
    "study-statistics",
    "Understand Statistics",
    "/app/stats",
    "statistics-overview",
    "See review activity, recall, workload, and scheduling trends.",
  ),
  mini(
    "scheduling",
    "Desired retention",
    "/app/settings/scheduling",
    "scheduling-settings",
    "Desired retention balances review frequency and memory reliability.",
  ),
  mini(
    "publishing",
    "Publish a deck",
    "/app/published",
    "published-decks",
    "Public and unlisted publishing use frozen safe projections of your deck.",
    true,
  ),
  mini(
    "install-app",
    "Install the app",
    "/app/offline",
    "offline-sync-center",
    "Install when your browser offers it. Installation opens Lumen like an app; it does not download every deck.",
  ),
  mini(
    "pin-offline",
    "Pin a deck offline",
    "/app",
    "library-main",
    "Choose Pin for offline on a deck. Ready appears only after its current card projections are verified.",
  ),
  mini(
    "pinned-vs-unpinned",
    "Pinned and unpinned decks",
    "/app/offline",
    "offline-sync-center",
    "Pinned decks are promised for offline use on this browser. Unpinned decks still require a connection.",
  ),
  mini(
    "study-offline",
    "Study without a connection",
    "/app/offline",
    "offline-sync-center",
    "Open a pinned deck from the offline shell. Review and practice evidence wait locally until the server acknowledges it.",
  ),
  mini(
    "pending-changes",
    "Understand pending changes",
    "/app/offline",
    "offline-sync-center",
    "Waiting to sync means the operation is durable on this browser but is not yet acknowledged by the server.",
  ),
  mini(
    "sync-now",
    "Synchronize now",
    "/app/offline",
    "offline-sync-center",
    "Use Sync now after reconnecting. One tab becomes the short-lived sync leader and other tabs observe its result.",
  ),
  mini(
    "resolve-conflicts",
    "Resolve a sync conflict",
    "/app/offline",
    "conflict-center",
    "Compare the plain-language choices. Lumen preserves the pending event until you resolve or deliberately abandon it.",
  ),
  mini(
    "offline-devices",
    "Manage offline devices",
    "/app/offline",
    "offline-device",
    "Review sessions and devices online. A revocation reaches an offline browser only after it reconnects.",
  ),
  mini(
    "clear-offline-data",
    "Clear local offline data",
    "/app/offline",
    "offline-device",
    "Clear one profile or all profiles for this account on this browser. Explicit sign-out clears private offline data.",
  ),
  mini(
    "app-updates",
    "Apply an app update",
    "/app/offline",
    "offline-sync-center",
    "Update available is nonblocking. Apply it after current work is durable; unsynced outbox records remain in IndexedDB.",
  ),
]);

export const guideDefinitions: readonly GuideDefinition[] = Object.freeze([
  globalGuide,
  ...miniGuides,
]);

export function guideByKey(key: string): GuideDefinition | undefined {
  return guideDefinitions.find((guide) => guide.key === key);
}
