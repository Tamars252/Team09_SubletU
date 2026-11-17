import { Suspense, lazy } from "react";
import type { MapCanvasProps } from "./MapCanvas.tsx";

/**
 * MapLibre is about a megabyte of JavaScript and only two screens need it, so
 * it loads on demand instead of blocking first paint of the swipe deck.
 */
const MapCanvas = lazy(() =>
  import("./MapCanvas.tsx").then((mod) => ({ default: mod.MapCanvas })),
);

export function LazyMapCanvas(props: MapCanvasProps) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "var(--sand)",
          }}
        >
          <div className="spinner" />
        </div>
      }
    >
      <MapCanvas {...props} />
    </Suspense>
  );
}
