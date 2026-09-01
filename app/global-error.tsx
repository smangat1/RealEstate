"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ margin: "0 auto", maxWidth: 560, padding: "64px 24px", fontFamily: "system-ui" }}>
          <p>Homeboard hit an unexpected problem.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
