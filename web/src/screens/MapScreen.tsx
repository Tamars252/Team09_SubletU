import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { IconLocate, IconSearch, IconX } from "../components/Icons.tsx";
import { useShell } from "../components/AppShell.tsx";
import { LazyMapCanvas } from "../components/LazyMapCanvas.tsx";
import { FALLBACK_CENTER, countLabel, pickCampus, pinnedListings } from "../lib/map.ts";
import type { Campus } from "../lib/map.ts";
import {
  formatAvailability,
  formatLocation,
  formatRent,
  hasRent,
  primaryPhotoUrl,
} from "../lib/saved.ts";
import { useAuth } from "../state/AuthContext.tsx";

type Place = { lat: number; lng: number; displayName: string; name: string };
type FlyTo = { lat: number; lng: number; zoom?: number; nonce: number };

/**
 * TM09-163: the Map tab. Listings from GET /api/listings (the same filters the
 * deck uses, held by the shell) drawn as price pins on an OpenStreetMap
 * basemap, with a campus marker, a place search, and a sheet for the pin you
 * tap. The map itself is MapCanvas, code-split behind LazyMapCanvas.
 */
export function MapScreen() {
  const { filters } = useShell();
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Listing | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
  const nonce = useRef(0);

  useEffect(() => {
    api
      .campuses()
      .then(({ campuses: list }) => setCampuses(list))
      .catch(() => undefined);
  }, []);

  const campus = useMemo(() => pickCampus(campuses, user?.university), [campuses, user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { results } = await api.listings(filters, { limit: "200" });
      setListings(pinnedListings(results));
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced place lookup against the Nominatim proxy.
  useEffect(() => {
    if (query.trim().length < 3) {
      setPlaces([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .geoSearch(query)
        .then(({ results }) => setPlaces(results))
        .catch(() => setPlaces([]))
        .finally(() => setSearching(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  function goTo(lat: number, lng: number, zoom = 15.5) {
    nonce.current += 1;
    setFlyTo({ lat, lng, zoom, nonce: nonce.current });
  }

  const center = campus ?? FALLBACK_CENTER;
  const photo = active ? primaryPhotoUrl(active) : null;

  return (
    <div className="map-wrap">
      <LazyMapCanvas
        listings={listings}
        center={center}
        campus={campus}
        activeId={active?.id ?? null}
        onSelect={setActive}
        fitOnChange={listings.length > 0 && !flyTo}
        flyTo={flyTo}
      />

      <div className="map-search">
        <div className="map-search-bar">
          <IconSearch size={17} className="muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a street, park, or landmark"
            aria-label="Search places"
          />
          {searching && <div className="spinner" style={{ width: 16, height: 16 }} />}
          {query && !searching && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPlaces([]);
              }}
              aria-label="Clear search"
              className="muted"
            >
              <IconX size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => campus && goTo(campus.lat, campus.lng, 14.5)}
            aria-label="Center on campus"
          >
            <IconLocate size={18} />
          </button>
        </div>

        {places.length > 0 && (
          <div className="map-suggestions">
            {places.map((place) => (
              <button
                key={`${place.lat},${place.lng}`}
                type="button"
                className="map-suggestion"
                onClick={() => {
                  goTo(place.lat, place.lng);
                  setQuery(place.name);
                  setPlaces([]);
                }}
              >
                <b>{place.name}</b>
                <span>{place.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!loading && places.length === 0 && (
        <div className="map-count">{countLabel(listings.length)}</div>
      )}

      {active && (
        <div className="map-sheet">
          <div className="list-card" style={{ margin: "10px 12px 0" }}>
            <div
              className="list-thumb"
              style={photo ? { backgroundImage: `url(${photo})` } : undefined}
              role="img"
              aria-label={photo ? `Photo of ${active.title}` : "No photo yet"}
            />
            <div className="list-body">
              <span className="list-price">
                {formatRent(active)}
                {hasRent(active) && <small>/mo</small>}
              </span>
              <span className="list-title">{active.title}</span>
              <span className="tiny">{formatLocation(active)}</span>
              <span className="tiny">{formatAvailability(active)}</span>
            </div>
          </div>
          <div style={{ padding: "8px 12px 10px" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: "100%" }}
              onClick={() => setActive(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
