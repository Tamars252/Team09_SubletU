import { useState } from "react";
import type { Filters, Reference } from "../api/types.ts";
import { EMPTY_FILTERS } from "../api/types.ts";
import { IconX } from "./Icons.tsx";

type Props = {
  filters: Filters;
  reference: Reference | null;
  onApply: (filters: Filters) => void;
  onClose: () => void;
};

const BED_OPTIONS = [
  { label: "Any", value: null },
  { label: "Studio+", value: 0 },
  { label: "1+", value: 1 },
  { label: "2+", value: 2 },
  { label: "3+", value: 3 },
  { label: "4+", value: 4 },
];

const BATH_OPTIONS = [
  { label: "Any", value: null },
  { label: "1+", value: 1 },
  { label: "1.5+", value: 1.5 },
  { label: "2+", value: 2 },
  { label: "3+", value: 3 },
];

const RADIUS_OPTIONS = [
  { label: "Any", value: null },
  { label: "0.5 mi", value: 0.5 },
  { label: "1 mi", value: 1 },
  { label: "2 mi", value: 2 },
  { label: "5 mi", value: 5 },
];

export function FilterSheet({ filters, reference, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Filters>(filters);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleAmenity(name: string) {
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(name)
        ? d.amenities.filter((a) => a !== name)
        : [...d.amenities, name],
    }));
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Filters">
        <div className="grip" />
        <div className="sheet-head">
          <h2>Filters</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close filters">
            <IconX size={18} />
          </button>
        </div>

        <div className="sheet-scroll">
          <label className="field">
            <span className="field-label">Search</span>
            <input
              className="input"
              placeholder="Street, neighborhood, or keyword"
              value={draft.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">
              Max rent {draft.maxPrice === null ? "— any" : `— $${draft.maxPrice}/mo`}
            </span>
            <div className="range-row">
              <input
                type="range"
                min={300}
                max={2500}
                step={25}
                value={draft.maxPrice ?? 2500}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set("maxPrice", v >= 2500 ? null : v);
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 54, textAlign: "right" }}>
                {draft.maxPrice === null ? "Any" : `$${draft.maxPrice}`}
              </span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Bedrooms</span>
            <div className="chip-grid">
              {BED_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`chip${draft.minBedrooms === o.value ? " on" : " outline"}`}
                  onClick={() => set("minBedrooms", o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Bathrooms</span>
            <div className="chip-grid">
              {BATH_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`chip${draft.minBathrooms === o.value ? " on" : " outline"}`}
                  onClick={() => set("minBathrooms", o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Distance from campus</span>
            <div className="chip-grid">
              {RADIUS_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`chip${draft.radiusMiles === o.value ? " on" : " outline"}`}
                  onClick={() => set("radiusMiles", o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row field">
            <label>
              <span className="field-label">Move in after</span>
              <input
                type="date"
                className="input"
                value={draft.availableFrom}
                onChange={(e) => set("availableFrom", e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Move out before</span>
              <input
                type="date"
                className="input"
                value={draft.availableTo}
                onChange={(e) => set("availableTo", e.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Must have</span>
            <div className="chip-grid">
              <button
                type="button"
                className={`chip${draft.furnished ? " on" : " outline"}`}
                onClick={() => set("furnished", !draft.furnished)}
              >
                Furnished
              </button>
              <button
                type="button"
                className={`chip${draft.petsAllowed ? " on" : " outline"}`}
                onClick={() => set("petsAllowed", !draft.petsAllowed)}
              >
                Pets allowed
              </button>
              <button
                type="button"
                className={`chip${draft.utilitiesIncluded ? " on" : " outline"}`}
                onClick={() => set("utilitiesIncluded", !draft.utilitiesIncluded)}
              >
                Utilities included
              </button>
            </div>
          </div>

          {reference && (
            <div className="field">
              <span className="field-label">Amenities</span>
              <div className="chip-grid">
                {reference.amenities.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`chip${draft.amenities.includes(a) ? " on" : " outline"}`}
                    onClick={() => toggleAmenity(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reference && (
            <div className="field">
              <span className="field-label">Sort by</span>
              <div className="chip-grid">
                {reference.sorts.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`chip${draft.sort === s.value ? " on" : " outline"}`}
                    onClick={() => set("sort", s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: "0 0 auto" }}
            onClick={() => setDraft({ ...EMPTY_FILTERS, sort: draft.sort })}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Show results
          </button>
        </div>
      </div>
    </>
  );
}
