export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="loading-layout"
      id="main-content"
      tabIndex={-1}
    >
      <div className="loading-card">
        <div className="loading-line" />
        <div className="loading-line" />
        <span className="visually-hidden">Loading</span>
      </div>
    </main>
  );
}
