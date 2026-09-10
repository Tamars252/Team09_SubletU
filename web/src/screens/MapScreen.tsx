import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Filters, Listing, Reference } from "../api/types.ts";
import { activeFilterCount } from "../api/types.ts";
import { LazyMapCanvas } from "../components/LazyMapCanvas.tsx";
import { FilterSheet } from "../components/FilterSheet.tsx";
import { ListingRow } from "../components/ListingRow.tsx";
import { IconLocate, IconSearch, IconSliders, IconX } from "../components/Icons.tsx";

type Props = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  reference: Reference | null;
  university: string;
  onOpenListing: (listing: Listing) => void;
};

type Place = { lat: number; lng: number; displayName: string; name: string };

export function MapScreen({
  filters,
  onFiltersChange,
  reference,
  university,
  onOpenListing,
}: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Listing | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [campuses, setCampuses] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(
    null,
  );
  const nonce = useRef(0);

  useEffect(() => {
    api
      .campuses()
      .then(({ campuses: list }) => setCampuses(list))
      .catch(() => undefined);
  }, []);

  const campus = useMemo(
    () => campuses.find((c) => c.name === university) ?? campuses[0] ?? null,
    [campuses, university],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { results } = await api.listings(filters, { limit: "200" });
      setListings(results.filter((l) => l.lat !== null && l.lng !== null));
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

  const filterCount = activeFilterCount(filters);
  const center = campus ?? { lat: 43.0392, lng: -76.1351 };

  return (
    <>
      <div className="header">
        <div className="header-title">Map</div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => campus && goTo(campus.lat, campus.lng, 14.5)}
            aria-label="Center on campus"
          >
            <IconLocate size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn${filterCount > 0 ? " active" : ""}`}
            onClick={() => setShowFilters(true)}
            aria-label="Filters"
          >
            <IconSliders size={19} />
            {filterCount > 0 && <span className="badge">{filterCount}</span>}
          </button>
        </div>
      </div>

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
          <div className="map-count">
            {listings.length} listing{listings.length === 1 ? "" : "s"} on the map
          </div>
        )}

        {active && (
          <div className="map-sheet">
            <div style={{ padding: "10px 12px 2px" }}>
              <ListingRow listing={active} onOpen={onOpenListing} />
              <div style={{ display: "flex", gap: 8, padding: "0 0 10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setActive(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 2 }}
                  onClick={() => onOpenListing(active)}
                >
                  See full listing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showFilters && (
        <FilterSheet
          filters={filters}
          reference={reference}
          onApply={onFiltersChange}
          onClose={() => setShowFilters(false)}
        />
      )}
    </>
  );
}
