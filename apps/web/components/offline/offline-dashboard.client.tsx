"use client";

import { Badge, Button, PageHeader } from "@lumen/ui";
import { useEffect, useState } from "react";

import { useOffline } from "./offline-provider.client";

function readableBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function readableDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function conflictFacts(value: unknown, empty: string): readonly [string, string][] {
  const candidate = record(value);
  const facts: [string, string][] = [];
  if (typeof candidate.title === "string") facts.push(["Title", candidate.title]);
  if (typeof candidate.descriptionText === "string")
    facts.push(["Description", candidate.descriptionText || "Empty"]);
  if (Array.isArray(candidate.tags))
    facts.push([
      "Tags",
      candidate.tags.filter((tag): tag is string => typeof tag === "string").join(", ") || "None",
    ]);
  if (candidate.tombstone === true) facts.push(["Change", "Delete this item"]);
  if (typeof candidate.currentVersion === "number")
    facts.push(["Server version", String(candidate.currentVersion)]);
  if (typeof candidate.rating === "string") facts.push(["Rating", candidate.rating]);
  if (typeof candidate.reviewedAt === "string")
    facts.push(["Review time", readableDate(candidate.reviewedAt)]);
  if (typeof candidate.message === "string" && candidate.message)
    facts.push(["Server note", candidate.message]);
  return facts.length ? facts : [["Summary", empty]];
}

export function OfflineDashboard() {
  const offline = useOffline();
  const [quota, setQuota] = useState<{ quota: number | null; usage: number | null }>({
    quota: null,
    usage: null,
  });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [online, setOnline] = useState(true);
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mergeDrafts, setMergeDrafts] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    let active = true;
    const updateConnection = () => setOnline(navigator.onLine);
    const initializeCapabilities = () => {
      if (!active) return;
      setOnline(navigator.onLine);
      setPersistenceAvailable(typeof navigator.storage?.persist === "function");
    };
    queueMicrotask(initializeCapabilities);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    void navigator.storage?.estimate?.().then((estimate) => {
      if (active) setQuota({ quota: estimate.quota ?? null, usage: estimate.usage ?? null });
    });
    void navigator.storage?.persisted?.().then((value) => {
      if (active) setPersisted(value);
    });
    return () => {
      active = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [offline.pins]);

  async function operate(label: string, task: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The operation could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = offline.status.state.replaceAll("_", " ");
  return (
    <div className="offline-page" data-guide-id="offline-sync-center">
      <PageHeader
        description="Choose what stays on this browser, review pending work, and resolve changes that need your decision."
        eyebrow="Workspace"
        title="Offline & sync"
      />

      {notice && (
        <p className="offline-notice" role="alert">
          {notice}
        </p>
      )}

      <section aria-labelledby="sync-summary" className="offline-card offline-summary">
        <div>
          <h2 id="sync-summary">Synchronization</h2>
          <p>
            <Badge tone={offline.status.state === "needs_attention" ? "danger" : "neutral"}>
              {statusLabel}
            </Badge>
          </p>
          <p>
            {offline.status.pendingCriticalCount} pending critical{" "}
            {offline.status.pendingCriticalCount === 1 ? "change" : "changes"} · last successful
            sync {readableDate(offline.status.lastSuccessfulSyncAt)}
          </p>
          <dl className="offline-facts">
            <div>
              <dt>Reviews / undo</dt>
              <dd>
                {offline.operationBreakdown.reviews} / {offline.operationBreakdown.reviewUndos}
              </dd>
            </div>
            <div>
              <dt>Practice attempts</dt>
              <dd>{offline.operationBreakdown.practice}</dd>
            </div>
            <div>
              <dt>Content / media</dt>
              <dd>
                {offline.operationBreakdown.content} / {offline.operationBreakdown.media}
              </dd>
            </div>
            <div>
              <dt>Dead letters</dt>
              <dd>{offline.operationBreakdown.deadLetters}</dd>
            </div>
          </dl>
        </div>
        <Button
          disabled={busy !== null || !online}
          onClick={() => void operate("sync", offline.syncNow)}
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
      </section>

      {offline.syncHistory.length > 0 && (
        <section aria-labelledby="sync-history" className="offline-card">
          <div className="offline-card__heading">
            <div>
              <h2 id="sync-history">Recent sync history</h2>
              <p>Only operation outcomes and safely merged field paths are shown here.</p>
            </div>
          </div>
          <ol className="offline-operation-list">
            {offline.syncHistory.map((entry) => (
              <li key={entry.operationId}>
                <div>
                  <strong>
                    {entry.mergedFields.length > 0
                      ? "Independent edits merged"
                      : entry.status === "duplicate"
                        ? "Already synchronized"
                        : "Synchronized"}
                  </strong>
                  <p>
                    {entry.mergedFields.length > 0
                      ? `Preserved both copies of ${entry.mergedFields.join(", ")}.`
                      : "The server acknowledged this queued change."}
                  </p>
                </div>
                <span>{readableDate(entry.acknowledgedAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="offline-grid">
        <section aria-labelledby="offline-install" className="offline-card">
          <h2 id="offline-install">Install</h2>
          <p>
            {offline.installed
              ? "This browser is running the installed app."
              : offline.installAvailable
                ? "Install to open in its own window. Only decks you pin are available offline."
                : "This browser has not offered installation. Online study still works normally."}
          </p>
          {offline.installAvailable && !offline.installed && (
            <Button onClick={() => void offline.install()} variant="secondary">
              Install app
            </Button>
          )}
        </section>

        <section aria-labelledby="offline-storage" className="offline-card">
          <h2 id="offline-storage">Storage on this browser</h2>
          <dl className="offline-facts">
            <div>
              <dt>Tracked offline content</dt>
              <dd>{readableBytes(offline.storageUsageBytes)}</dd>
            </div>
            <div>
              <dt>Browser usage</dt>
              <dd>{quota.usage === null ? "Unavailable" : readableBytes(quota.usage)}</dd>
            </div>
            <div>
              <dt>Browser quota</dt>
              <dd>{quota.quota === null ? "Unavailable" : readableBytes(quota.quota)}</dd>
            </div>
            <div>
              <dt>Persistent storage</dt>
              <dd>{persisted === null ? "Unavailable" : persisted ? "Granted" : "Not granted"}</dd>
            </div>
          </dl>
          {persisted === false && persistenceAvailable && (
            <Button
              onClick={() =>
                void navigator.storage.persist().then((value) => {
                  setPersisted(value);
                  setNotice(
                    value
                      ? "Persistent storage was granted."
                      : "The browser kept its normal storage policy. Pinned data may be removed under storage pressure.",
                  );
                })
              }
              size="sm"
              variant="secondary"
            >
              Request persistent storage
            </Button>
          )}
        </section>
      </div>

      <section aria-labelledby="sync-preferences" className="offline-card">
        <div className="offline-card__heading">
          <div>
            <h2 id="sync-preferences">Device sync preferences</h2>
            <p>
              These settings apply to the active learner on this registered browser. Pausing never
              discards queued work.
            </p>
          </div>
          <Button
            disabled={busy !== null}
            onClick={() =>
              void operate("pause-sync", () =>
                offline.updateSyncPreferences({
                  ...offline.syncPreferences,
                  paused: !offline.syncPreferences.paused,
                }),
              )
            }
            variant="secondary"
          >
            {offline.syncPreferences.paused ? "Resume synchronization" : "Pause synchronization"}
          </Button>
        </div>
        <div className="offline-preferences">
          <label>
            <span>Metered connection</span>
            <select
              disabled={busy !== null}
              onChange={(event) =>
                void operate("metered-preference", () =>
                  offline.updateSyncPreferences({
                    ...offline.syncPreferences,
                    meteredConnectionPreference: event.currentTarget
                      .value as typeof offline.syncPreferences.meteredConnectionPreference,
                  }),
                )
              }
              value={offline.syncPreferences.meteredConnectionPreference}
            >
              <option value="allow">Allow all synchronization</option>
              <option value="avoid_media">Avoid media downloads</option>
              <option value="pause">Pause on metered connections</option>
            </select>
          </label>
          <label>
            <span>Default media download</span>
            <select
              disabled={busy !== null}
              onChange={(event) =>
                void operate("media-preference", () =>
                  offline.updateSyncPreferences({
                    ...offline.syncPreferences,
                    mediaDownloadPreference: event.currentTarget
                      .value as typeof offline.syncPreferences.mediaDownloadPreference,
                  }),
                )
              }
              value={offline.syncPreferences.mediaDownloadPreference}
            >
              <option value="all">Images and audio</option>
              <option value="images_only">Images only</option>
              <option value="none">No automatic media</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="pinned-decks" className="offline-card">
        <div className="offline-card__heading">
          <div>
            <h2 id="pinned-decks">Pinned decks</h2>
            <p>A deck is ready offline only after its content is fully verified here.</p>
          </div>
          <a href="/app">Open Library</a>
        </div>
        {offline.pins.size === 0 ? (
          <p>No decks are pinned. Open Library and choose “Pin for offline.”</p>
        ) : (
          <ul className="offline-list">
            {[...offline.pins.values()].map((pin) => (
              <li key={pin.deckId}>
                <div>
                  <strong>{pin.deckTitle}</strong>
                  <span>
                    {pin.cardCount} cards · {readableBytes(pin.estimatedBytes)} ·{" "}
                    {!pin.includeImages
                      ? "media excluded"
                      : pin.includeAudio
                        ? "images and audio included"
                        : "images included; audio excluded"}
                  </span>
                  <span>
                    Deck updated {readableDate(pin.updatedAt)} · last synchronized{" "}
                    {readableDate(pin.lastSynchronizedAt ?? pin.pinnedAt)}
                    {pin.updateAvailable ? " · update available" : ""}
                  </span>
                </div>
                <div className="offline-conflict-actions">
                  {pin.updateAvailable && (
                    <Button
                      disabled={busy !== null || !online}
                      onClick={() =>
                        void operate(`refresh-pin:${pin.deckId}`, () =>
                          offline.pinDeck(pin.deckId, pin.includeAudio),
                        )
                      }
                      size="sm"
                    >
                      {busy === `refresh-pin:${pin.deckId}` ? "Updating…" : "Update offline copy"}
                    </Button>
                  )}
                  <Button
                    disabled={busy !== null}
                    onClick={() =>
                      void operate(`unpin:${pin.deckId}`, () => offline.unpinDeck(pin.deckId))
                    }
                    size="sm"
                    variant="secondary"
                  >
                    {busy === `unpin:${pin.deckId}` ? "Removing…" : "Remove offline copy"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="conflict-center"
        className="offline-card"
        data-guide-id="conflict-center"
      >
        <div className="offline-card__heading">
          <div>
            <h2 id="conflict-center">Conflict Center</h2>
            <p>Nothing is discarded until a conflict is resolved or deliberately abandoned.</p>
          </div>
          <Badge tone={offline.conflicts.length ? "danger" : "success"}>
            {offline.conflicts.length
              ? `${String(offline.conflicts.length)} needs attention`
              : "Clear"}
          </Badge>
        </div>
        {offline.conflicts.length === 0 ? (
          <p>No unresolved review, content, media, or permission conflicts.</p>
        ) : (
          <ul className="offline-list">
            {offline.conflicts.map((conflict) => (
              <li key={conflict.conflictId}>
                <div>
                  <strong>
                    {conflict.kind === "review_chain"
                      ? "This card was reviewed on another device"
                      : conflict.kind === "delete_edit"
                        ? "An edited item was deleted elsewhere"
                        : "Content changed in another place"}
                  </strong>
                  <span>
                    Local change {readableDate(conflict.localChangedAt)}
                    {conflict.serverChangedAt
                      ? ` · server change ${readableDate(conflict.serverChangedAt)}`
                      : ""}
                  </span>
                  <div
                    aria-label="Local and server change comparison"
                    className="offline-conflict-comparison"
                  >
                    <section>
                      <h3>On this device</h3>
                      <dl>
                        {conflictFacts(
                          conflict.localValue,
                          "The complete local draft is retained.",
                        ).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                    <section>
                      <h3>On the server</h3>
                      <dl>
                        {conflictFacts(
                          conflict.serverValue,
                          "The current server copy remains authoritative.",
                        ).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                  <details>
                    <summary>Technical details</summary>
                    <p>
                      Type: {conflict.kind}. Content and answer text are intentionally omitted from
                      this summary.
                    </p>
                  </details>
                </div>
                <div className="offline-conflict-actions">
                  {conflict.kind === "review_chain" ? (
                    <Button
                      onClick={() =>
                        void operate(`resolve:${conflict.conflictId}`, () =>
                          offline.resolveConflict(conflict.conflictId, "accept_canonical_replay"),
                        )
                      }
                      size="sm"
                    >
                      Accept server schedule
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() =>
                          void operate(`resolve:${conflict.conflictId}`, () =>
                            offline.resolveConflict(conflict.conflictId, "use_server"),
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        Use server
                      </Button>
                      <Button
                        onClick={() =>
                          void operate(`resolve:${conflict.conflictId}`, () =>
                            offline.resolveConflict(conflict.conflictId, "keep_local_revision"),
                          )
                        }
                        size="sm"
                      >
                        Keep local as new revision
                      </Button>
                      {conflict.entity.entityType === "card_entry" && (
                        <Button
                          onClick={() =>
                            void operate(`resolve:${conflict.conflictId}`, () =>
                              offline.resolveConflict(conflict.conflictId, "duplicate_entity"),
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Duplicate card
                        </Button>
                      )}
                      {conflict.entity.entityType === "deck" && (
                        <Button
                          onClick={() =>
                            void operate(`resolve:${conflict.conflictId}`, () =>
                              offline.resolveConflict(conflict.conflictId, "duplicate_entity"),
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Duplicate deck
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Abandon this pending change? The local operation will remain in audit history but will no longer be applied.",
                        )
                      ) {
                        void operate(`resolve:${conflict.conflictId}`, () =>
                          offline.resolveConflict(conflict.conflictId, "abandon"),
                        );
                      }
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Abandon
                  </Button>
                </div>
                {["same_field", "rich_overlap"].includes(conflict.kind) && (
                  <details className="offline-manual-merge">
                    <summary>Manually merge a plain-text title or description</summary>
                    <label>
                      <span>Merged value</span>
                      <textarea
                        onChange={(event) =>
                          setMergeDrafts((current) => ({
                            ...current,
                            [conflict.conflictId]: event.currentTarget.value,
                          }))
                        }
                        rows={4}
                        value={
                          mergeDrafts[conflict.conflictId] ??
                          String(
                            record(conflict.localValue).title ??
                              record(conflict.localValue).descriptionText ??
                              "",
                          )
                        }
                      />
                    </label>
                    <Button
                      disabled={
                        !(
                          mergeDrafts[conflict.conflictId] ??
                          String(
                            record(conflict.localValue).title ??
                              record(conflict.localValue).descriptionText ??
                              "",
                          )
                        ).trim()
                      }
                      onClick={() => {
                        const local = record(conflict.localValue);
                        const field = typeof local.title === "string" ? "title" : "descriptionText";
                        const mergedValue =
                          mergeDrafts[conflict.conflictId] ??
                          String(local.title ?? local.descriptionText ?? "");
                        void operate(`resolve:${conflict.conflictId}`, () =>
                          offline.resolveConflict(conflict.conflictId, "manual_merge", {
                            ...local,
                            [field]: mergedValue,
                          }),
                        );
                      }}
                      size="sm"
                    >
                      Save merged revision
                    </Button>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="failed-operations" className="offline-card">
        <div className="offline-card__heading">
          <div>
            <h2 id="failed-operations">Failed and dead-letter work</h2>
            <p>
              These changes remain on this browser until you retry or deliberately abandon them.
            </p>
          </div>
          <Badge tone={offline.failedOperations.length ? "danger" : "success"}>
            {offline.failedOperations.length
              ? `${String(offline.failedOperations.length)} retained`
              : "Clear"}
          </Badge>
        </div>
        {offline.failedOperations.length === 0 ? (
          <p>No rejected or exhausted operations are retained.</p>
        ) : (
          <ul className="offline-list">
            {offline.failedOperations.map((operation) => (
              <li key={operation.operationId}>
                <div>
                  <strong>{operation.operationLabel.replaceAll(".", " ")}</strong>
                  <span>
                    {operation.status.replaceAll("_", " ")} · {readableDate(operation.occurredAt)}
                  </span>
                  <details>
                    <summary>Safe technical details</summary>
                    <p>
                      Result category: {operation.failure?.code ?? "unknown"}. Private answers and
                      rich content are omitted.
                    </p>
                  </details>
                </div>
                <div className="offline-conflict-actions">
                  <Button
                    onClick={() =>
                      void operate(`retry:${operation.operationId}`, () =>
                        offline.retryOperation(operation.operationId),
                      )
                    }
                    size="sm"
                  >
                    Retry
                  </Button>
                  <Button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Abandon this pending change? Its audit record remains on this browser.",
                        )
                      )
                        void operate(`abandon:${operation.operationId}`, () =>
                          offline.abandonOperation(operation.operationId),
                        );
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Abandon
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="offline-device"
        className="offline-card"
        data-guide-id="offline-device"
      >
        <h2 id="offline-device">Device and cleanup</h2>
        <p>
          Device revocation takes effect when this browser reconnects. Browser storage is protected
          by your browser/operating-system account, not from a malicious extension.
        </p>
        <div className="offline-actions">
          <a href="/app/settings/devices">Manage devices and sessions</a>
          <Button
            onClick={() => {
              if (
                window.confirm(
                  "Clear pinned decks and pending offline data for the active learner on this browser?",
                )
              ) {
                void operate("clear-profile", offline.clearProfileData);
              }
            }}
            variant="secondary"
          >
            Clear current profile data
          </Button>
          <Button
            onClick={() => {
              if (
                window.confirm(
                  "Clear every offline learner profile for this account on this browser?",
                )
              ) {
                void operate("clear-account", offline.clearAccountData);
              }
            }}
            variant="danger"
          >
            Clear all account data
          </Button>
        </div>
      </section>

      <section aria-labelledby="offline-limitations" className="offline-card">
        <h2 id="offline-limitations">What to expect</h2>
        <ul>
          <li>Only explicitly pinned decks are promised to open offline.</li>
          <li>Background synchronization depends on browser and operating-system support.</li>
          <li>
            Permission and device revocation cannot be learned while this browser is disconnected.
          </li>
          <li>Previously cached public content is withdrawn on the next successful connection.</li>
        </ul>
      </section>
    </div>
  );
}
