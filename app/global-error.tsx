"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("Unhandled root layout error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f4f8fd",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            textAlign: "center",
            background: "#ffffff",
            borderRadius: "1rem",
            padding: "2rem",
            boxShadow: "0 1px 3px rgba(16,24,39,0.08)",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#DC2626",
            }}
          >
            Error
          </p>
          <h1 style={{ marginTop: "0.75rem", fontSize: "1.5rem", fontWeight: 800, color: "#101827" }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#43566a" }}>
            The application hit an unexpected error. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.4rem",
              borderRadius: "0.5rem",
              background: "#1f78d1",
              color: "#ffffff",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
