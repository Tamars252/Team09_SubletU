import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client.ts";
import type { Reference } from "./api/types.ts";

type ApiState =
  | { kind: "loading" }
  | { kind: "ok"; reference: Reference }
  | { kind: "error"; message: string };

/**
 * Front-end shell. Screens (sign-in, browse deck, map, post, saved, messages,
 * profile) plug into `app-main` in later stories. For now it proves the three
 * pieces this scaffold is for: the theme loads, the Vite proxy reaches the
 * API, and the typed client parses the reply.
 */
export function App() {
  const [state, setState] = useState<ApiState>({ kind: "loading" });

  useEffect(() => {
    api
      .reference()
      .then((reference) => setState({ kind: "ok", reference }))
      .catch((err: unknown) =>
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Something went wrong.",
        }),
      );
  }, []);

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">SubletU</span>
      </header>

      <main className="app-main">
        <div className="center-state">
          {state.kind === "loading" && <div className="spinner" />}

          {state.kind === "ok" && (
            <>
              <h3>Connected to the SubletU API</h3>
              <p className="muted">
                {state.reference.universities.length} campuses ·{" "}
                {state.reference.amenities.length} amenities ·{" "}
                {state.reference.sorts.length} sort options
              </p>
            </>
          )}

          {state.kind === "error" && (
            <>
              <h3>Can't reach the API</h3>
              <p className="muted">{state.message}</p>
              <p className="muted">
                Start it with <code>npm run dev</code> from the repo root.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
