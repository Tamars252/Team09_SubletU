import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Listing } from "../api/types.ts";
import { money } from "../lib/format.ts";

/**
 * Raster style backed by OpenStreetMap's standard tiles. No API key and no
 * account required, which keeps the map genuinely live out of the box. Swap
 * `tiles` for a Mapbox/MapTiler/Stadia URL if you'd rather use vector tiles.
 *
 * This has to be a factory, not a shared constant: MapLibre takes ownership of
 * the style object and mutates it, so handing the same object to a second Map
 * (two map screens, or StrictMode's double mount in dev) leaves the second one
 * with no raster source and a blank basemap.
 */
function createOsmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
  };
}

/** Keeps the auto-fit camera in a range where individual pins stay readable. */
const MIN_NEIGHBORHOOD_ZOOM = 13.4;
const MAX_FIT_ZOOM = 15.5;

export type MapCanvasProps = {
  listings: Listing[];
  center: { lat: number; lng: number };
  campus: { name: string; lat: number; lng: number } | null;
  activeId: string | null;
  onSelect: (listing: Listing | null) => void;
  onMoveEnd?: (bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number }) => void;
  /** Zoom to fit all pins the next time the listing set changes. */
  fitOnChange?: boolean;
  interactive?: boolean;
  zoom?: number;
  /** Bump `nonce` to fly the camera somewhere (used by the search box). */
  flyTo?: { lat: number; lng: number; zoom?: number; nonce: number } | null;
};

export function MapCanvas({
  listings,
  center,
  campus,
  activeId,
  onSelect,
  onMoveEnd,
  fitOnChange = true,
  interactive = true,
  zoom = 14,
  flyTo = null,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const campusMarker = useRef<maplibregl.Marker | null>(null);
  const onMoveEndRef = useRef(onMoveEnd);
  const onSelectRef = useRef(onSelect);

  onMoveEndRef.current = onMoveEnd;
  onSelectRef.current = onSelect;

  /* ------------------------------------------------------------ create map */

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new maplibregl.Map({
      container: container.current,
      style: createOsmStyle(),
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
      interactive,
    });

    if (interactive) {
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      instance.addControl(
        new maplibregl.GeolocateControl({ trackUserLocation: false }),
        "bottom-right",
      );
      // A click on open water/land clears the selected pin.
      instance.on("click", () => onSelectRef.current(null));
      instance.on("moveend", () => {
        const b = instance.getBounds();
        onMoveEndRef.current?.({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth(),
        });
      });
    }

    map.current = instance;
    instance.on("error", (event) => console.error("[map]", event.error?.message ?? event));
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: MapLibreMap }).__map = instance;
    }

    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current.clear();
      campusMarker.current?.remove();
      campusMarker.current = null;
      instance.remove();
      map.current = null;
    };
    // Intentionally mount-only: later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- campus marker */

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    campusMarker.current?.remove();
    campusMarker.current = null;
    if (!campus) return;

    const el = document.createElement("div");
    el.className = "map-campus";
    el.title = campus.name;
    el.textContent = "★";

    campusMarker.current = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([campus.lng, campus.lat])
      .addTo(instance);
  }, [campus]);

  /* -------------------------------------------------------- listing pins */

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const wanted = new Set<string>();

    for (const listing of listings) {
      if (listing.lat === null || listing.lng === null) continue;
      wanted.add(listing.id);

      let marker = markers.current.get(listing.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "map-pin";
        el.textContent = money(listing.pricing?.monthlyRent);
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current(listing);
        });
        marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([listing.lng, listing.lat])
          .addTo(instance);
        markers.current.set(listing.id, marker);
      } else {
        marker.setLngLat([listing.lng, listing.lat]);
        marker.getElement().textContent = money(listing.pricing?.monthlyRent);
      }
    }

    // Drop pins for listings that filtered out.
    for (const [id, marker] of markers.current) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    if (fitOnChange && listings.length > 0) {
      const points = listings.filter((l) => l.lat !== null && l.lng !== null);
      if (points.length > 0) {
        const bounds = new maplibregl.LngLatBounds(
          [points[0].lng as number, points[0].lat as number],
          [points[0].lng as number, points[0].lat as number],
        );
        for (const p of points) bounds.extend([p.lng as number, p.lat as number]);
        if (campus) bounds.extend([campus.lng, campus.lat]);

        // Fit, but keep the result inside a readable range. Left alone, a
        // single far-off listing pulls the camera out to the whole metro area
        // and every pin collapses into one unreadable cluster.
        const camera = instance.cameraForBounds(bounds, { padding: 56 });
        if (camera?.center) {
          const fitted = camera.zoom ?? MIN_NEIGHBORHOOD_ZOOM;
          instance.easeTo({
            center: camera.center,
            zoom: Math.min(MAX_FIT_ZOOM, Math.max(MIN_NEIGHBORHOOD_ZOOM, fitted)),
            duration: 600,
          });
        }
      }
    }
  }, [listings, fitOnChange, campus]);

  /* ----------------------------------------------------- active pin state */

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.getElement().classList.toggle("active", id === activeId);
    }
    const instance = map.current;
    if (!instance || !activeId) return;
    const marker = markers.current.get(activeId);
    if (marker) {
      instance.easeTo({ center: marker.getLngLat(), duration: 420, offset: [0, -60] });
    }
  }, [activeId]);

  /* ------------------------------------------------------- external recenter */

  useEffect(() => {
    const instance = map.current;
    if (!instance || fitOnChange) return;
    instance.easeTo({ center: [center.lng, center.lat], duration: 500 });
  }, [center.lat, center.lng, fitOnChange]);

  /* ---------------------------------------------------------- imperative fly */

  useEffect(() => {
    const instance = map.current;
    if (!instance || !flyTo) return;
    instance.flyTo({
      center: [flyTo.lng, flyTo.lat],
      zoom: flyTo.zoom ?? 15,
      duration: 900,
    });
  }, [flyTo?.nonce, flyTo?.lat, flyTo?.lng, flyTo?.zoom]);

  // The position/size live inline on purpose. maplibre-gl.css sets
  // `.maplibregl-map { position: relative }` on this very element, and because
  // that stylesheet arrives with the lazy chunk it would otherwise land after
  // theme.css and win the cascade, collapsing the map to zero height.
  return (
    <div
      ref={container}
      className="map-canvas"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
