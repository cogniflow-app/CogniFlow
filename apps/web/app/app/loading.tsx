import { Skeleton } from "@lumen/ui";

export default function WorkspaceLoading() {
  return (
    <div className="library-shell" role="status" aria-label="Loading your library">
      <div className="library-hero">
        <Skeleton className="max-w-2xl" label="Loading library summary" lines={3} />
      </div>
      <div className="library-metrics" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="library-metric" key={index}>
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
      <div className="deck-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="deck-tile" key={index}>
            <Skeleton lines={4} />
          </div>
        ))}
      </div>
    </div>
  );
}
