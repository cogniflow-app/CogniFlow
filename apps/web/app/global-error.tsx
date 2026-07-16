"use client";

import { brandConfig } from "@lumen/config/brand";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#f7f8fc",
          color: "#182035",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "2rem",
        }}
      >
        <main style={{ margin: "10vh auto", maxWidth: "42rem" }}>
          <p style={{ color: "#5b4ce0", fontWeight: 800 }}>{brandConfig.name}</p>
          <h1>Something went wrong.</h1>
          <p>Try the page again. No changes are assumed to have succeeded.</p>
          <button
            onClick={reset}
            style={{
              background: "#5b4ce0",
              border: 0,
              borderRadius: "0.7rem",
              color: "white",
              cursor: "pointer",
              minHeight: "44px",
              padding: "0 1rem",
            }}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
