import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Listing, Reference } from "../api/types.ts";
import { IconCamera, IconCheck, IconPlus, IconX } from "../components/Icons.tsx";
import { compressPhoto } from "../lib/compressPhoto.ts";
import { dateRange, money } from "../lib/format.ts";

type Props = {
  reference: Reference | null;
  onPosted: (listing: Listing) => void;
  onOpenListing: (listing: Listing) => void;
};

type Draft = {
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  monthlyRent: string;
  deposit: string;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  bedrooms: string;
  bathrooms: string;
  maxRoommates: string;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
  amenities: string[];
  photos: string[];
};

const EMPTY: Draft = {
  title: "",
  address: "",
  city: "Syracuse",
  state: "NY",
  zip: "",
  description: "",
  monthlyRent: "",
  deposit: "",
  availableFrom: "",
  availableTo: "",
  utilitiesIncluded: false,
  bedrooms: "1",
  bathrooms: "1",
  maxRoommates: "0",
  petsAllowed: false,
  furnished: false,
  privateBath: false,
  amenities: [],
  photos: [],
};

const STEPS = ["Place", "Rooms & price", "Photos"];

export function Post({ reference, onPosted, onOpenListing }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<Listing[]>([]);
  const [mode, setMode] = useState<"list" | "form">("list");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadMine();
  }, []);

  async function loadMine() {
    try {
      const { results } = await api.myListings();
      setMine(results);
    } catch {
      setMine([]);
    }
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
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

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = 10 - draft.photos.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length === 0) {
      setError("A listing can have at most 10 photos");
      return;
    }
    try {
      const encoded = await Promise.all(chosen.map(compressPhoto));
      setDraft((d) => ({ ...d, photos: [...d.photos, ...encoded] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image");
    }
  }

  /** Local pre-flight so the user isn't sent to the server to be told the obvious. */
  function stepProblems(index: number): string[] {
    const found: string[] = [];
    if (index === 0) {
      if (draft.title.trim().length < 4) found.push("Give the listing a title (4+ characters)");
      if (draft.address.trim().length < 5) found.push("Enter the street address");
      if (!draft.city.trim()) found.push("Enter the city");
      if (!/^[A-Za-z]{2}$/.test(draft.state.trim())) found.push("State should be a 2-letter code");
      if (draft.description.trim().length < 20)
        found.push("Write at least 20 characters describing the place");
    }
    if (index === 1) {
      const rent = Number(draft.monthlyRent);
      if (!Number.isFinite(rent) || rent <= 0) found.push("Enter the monthly rent");
      if (!draft.availableFrom) found.push("Pick an available-from date");
      if (!draft.availableTo) found.push("Pick an available-to date");
      if (
        draft.availableFrom &&
        draft.availableTo &&
        new Date(draft.availableTo) <= new Date(draft.availableFrom)
      ) {
        found.push("The end date has to be after the start date");
      }
    }
    return found;
  }

  function next() {
    const found = stepProblems(step);
    setProblems(found);
    if (found.length === 0) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function submit() {
    const placeProblems = stepProblems(0);
    const found = [...placeProblems, ...stepProblems(1)];
    setProblems(found);
    if (found.length > 0) {
      // Jump back to whichever step actually has the problem.
      setStep(placeProblems.length > 0 ? 0 : 1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { listing } = await api.createListing({
        title: draft.title,
        address: draft.address,
        city: draft.city,
        state: draft.state,
        zip: draft.zip,
        description: draft.description,
        monthlyRent: Number(draft.monthlyRent),
        deposit: draft.deposit === "" ? 0 : Number(draft.deposit),
        availableFrom: draft.availableFrom,
        availableTo: draft.availableTo,
        utilitiesIncluded: draft.utilitiesIncluded,
        bedrooms: Number(draft.bedrooms),
        bathrooms: Number(draft.bathrooms),
        maxRoommates: Number(draft.maxRoommates),
        petsAllowed: draft.petsAllowed,
        furnished: draft.furnished,
        privateBath: draft.privateBath,
        amenities: draft.amenities,
        photos: draft.photos,
      });
      setDraft(EMPTY);
      setStep(0);
      setMode("list");
      await loadMine();
      onPosted(listing);
    } catch (err) {
      const apiErr = err as { message?: string; problems?: string[] };
      setError(apiErr.message ?? "Could not publish the listing");
      setProblems(apiErr.problems ?? []);
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePause(listing: Listing) {
    try {
      await api.updateListing(listing.id, {
        status: listing.status === "active" ? "paused" : "active",
      });
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the listing");
    }
  }

  async function remove(listing: Listing) {
    try {
      await api.deleteListing(listing.id);
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the listing");
    }
  }

  /* ------------------------------------------------------------ my listings */

  if (mode === "list") {
    return (
      <>
        <div className="header">
          <div className="header-title">Your listings</div>
          <button
            type="button"
            className="icon-btn active"
            onClick={() => setMode("form")}
            aria-label="Post a new listing"
          >
            <IconPlus size={20} />
          </button>
        </div>

        {error && (
          <div className="section" style={{ paddingBottom: 0 }}>
            <div className="banner error">{error}</div>
          </div>
        )}

        {mine.length === 0 && (
          <div className="center-state">
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 62,
                height: 62,
                borderRadius: "50%",
                background: "var(--blush)",
                color: "var(--terracotta)",
              }}
            >
              <IconCamera size={28} />
            </div>
            <h3>Post your sublet</h3>
            <p>
              Add photos, set the dates and rent, and we'll place it on the map from the street
              address. Takes about two minutes.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setMode("form")}>
              Create a listing
            </button>
          </div>
        )}

        {mine.length > 0 && (
          <div className="section">
            {mine.map((listing) => (
              <div key={listing.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    className="list-thumb"
                    style={
                      listing.photos[0]
                        ? { backgroundImage: `url(${listing.photos[0].fileUrl})`, width: 72, height: 72 }
                        : { width: 72, height: 72 }
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="list-price">{money(listing.pricing?.monthlyRent)}</span>
                      <span
                        className={`chip ${listing.status === "active" ? "good" : ""}`}
                        style={{ padding: "3px 8px", fontSize: 10.5 }}
                      >
                        {listing.status === "active" ? "Live" : "Paused"}
                      </span>
                    </div>
                    <div className="list-title">{listing.title}</div>
                    <div className="tiny">{listing.address}</div>
                    {listing.pricing && (
                      <div className="tiny">
                        {dateRange(listing.pricing.availableFrom, listing.pricing.availableTo)}
                      </div>
                    )}
                  </div>
                </div>

                {listing.stats && (
                  <div className="fact-grid" style={{ marginTop: 12 }}>
                    <div className="fact">
                      <b>{listing.stats.likes}</b>
                      <span>likes</span>
                    </div>
                    <div className="fact">
                      <b>{listing.stats.saves}</b>
                      <span>saves</span>
                    </div>
                    <div className="fact">
                      <b>{listing.stats.inquiries}</b>
                      <span>inquiries</span>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onOpenListing(listing)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => void togglePause(listing)}
                  >
                    {listing.status === "active" ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void remove(listing)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  /* ------------------------------------------------------------------- form */

  return (
    <>
      <div className="header">
        <button
          type="button"
          className="icon-btn"
          onClick={() => (step === 0 ? setMode("list") : setStep((s) => s - 1))}
          aria-label="Back"
        >
          <IconX size={18} />
        </button>
        <div className="header-title" style={{ flex: 1, fontSize: 17 }}>
          {STEPS[step]}
        </div>
        <span className="tiny">
          {step + 1} of {STEPS.length}
        </span>
      </div>

      <div className="steps">
        {STEPS.map((label, i) => (
          <div key={label} className={`step${i <= step ? " on" : ""}`} />
        ))}
      </div>

      <div className="section" style={{ paddingTop: 0 }}>
        {problems.length > 0 && (
          <div className="banner error" style={{ marginBottom: 16 }}>
            <div>
              <strong>Fix these first:</strong>
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {error && (
          <div className="banner error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === 0 && (
          <>
            <label className="field">
              <span className="field-label">Listing title</span>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Furnished 2BR two blocks from the Quad"
                maxLength={120}
              />
            </label>

            <label className="field">
              <span className="field-label">Street address</span>
              <input
                className="input"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="910 Ackerman Ave"
              />
              <span className="field-hint">
                We geocode this against OpenStreetMap to place your pin on the map.
              </span>
            </label>

            <div className="row field">
              <label>
                <span className="field-label">City</span>
                <input
                  className="input"
                  value={draft.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </label>
              <label style={{ maxWidth: 80 }}>
                <span className="field-label">State</span>
                <input
                  className="input"
                  value={draft.state}
                  onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              </label>
              <label style={{ maxWidth: 110 }}>
                <span className="field-label">ZIP</span>
                <input
                  className="input"
                  value={draft.zip}
                  onChange={(e) => set("zip", e.target.value)}
                  placeholder="13210"
                  maxLength={10}
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Description</span>
              <textarea
                className="input"
                rows={5}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What's the place like, what's included, and what kind of subletter are you looking for?"
                maxLength={4000}
              />
              <span className="field-hint">{draft.description.length} / 4000</span>
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <div className="row field">
              <label>
                <span className="field-label">Monthly rent ($)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={draft.monthlyRent}
                  onChange={(e) => set("monthlyRent", e.target.value)}
                  placeholder="850"
                />
              </label>
              <label>
                <span className="field-label">Deposit ($)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={draft.deposit}
                  onChange={(e) => set("deposit", e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            <div className="row field">
              <label>
                <span className="field-label">Available from</span>
                <input
                  className="input"
                  type="date"
                  value={draft.availableFrom}
                  onChange={(e) => set("availableFrom", e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Available to</span>
                <input
                  className="input"
                  type="date"
                  value={draft.availableTo}
                  onChange={(e) => set("availableTo", e.target.value)}
                />
              </label>
            </div>

            {draft.availableFrom && draft.availableTo && (
              <div className="banner info" style={{ marginBottom: 16 }}>
                {dateRange(draft.availableFrom, draft.availableTo)}
              </div>
            )}

            <div className="row field">
              <label>
                <span className="field-label">Bedrooms</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={12}
                  value={draft.bedrooms}
                  onChange={(e) => set("bedrooms", e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Bathrooms</span>
                <input
                  className="input"
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={draft.bathrooms}
                  onChange={(e) => set("bathrooms", e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Roommates</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={20}
                  value={draft.maxRoommates}
                  onChange={(e) => set("maxRoommates", e.target.value)}
                />
              </label>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <Switch
                label="Utilities included"
                sub="Heat, electric, water and internet covered by rent"
                on={draft.utilitiesIncluded}
                onToggle={() => set("utilitiesIncluded", !draft.utilitiesIncluded)}
              />
              <Switch
                label="Furnished"
                sub="Bed, desk and living room furniture stay"
                on={draft.furnished}
                onToggle={() => set("furnished", !draft.furnished)}
              />
              <Switch
                label="Pets allowed"
                on={draft.petsAllowed}
                onToggle={() => set("petsAllowed", !draft.petsAllowed)}
              />
              <Switch
                label="Private bathroom"
                on={draft.privateBath}
                onToggle={() => set("privateBath", !draft.privateBath)}
              />
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
                      {draft.amenities.includes(a) && <IconCheck size={11} strokeWidth={3} />}
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <span className="field-label">Photos ({draft.photos.length} / 10)</span>
              <div className="photo-grid">
                {draft.photos.map((src, i) => (
                  <div key={src.slice(-32) + i} className="photo-slot" style={{ backgroundImage: `url(${src})` }}>
                    <button
                      type="button"
                      className="photo-remove"
                      aria-label="Remove photo"
                      onClick={() =>
                        setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                {draft.photos.length < 10 && (
                  <button
                    type="button"
                    className="photo-add"
                    onClick={() => fileInput.current?.click()}
                  >
                    <IconCamera size={20} />
                    Add
                  </button>
                )}
              </div>
              <span className="field-hint">
                First photo becomes the cover. Images are resized in your browser before upload.
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="card">
              <div className="field-label">Review</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{draft.title || "Untitled listing"}</div>
              <div className="tiny">
                {draft.address}, {draft.city}, {draft.state}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="chip tint">
                  {draft.monthlyRent ? money(Number(draft.monthlyRent)) : "$—"}/mo
                </span>
                <span className="chip tint">
                  {Number(draft.bedrooms) === 0 ? "Studio" : `${draft.bedrooms} bed`}
                </span>
                <span className="chip tint">{draft.bathrooms} bath</span>
                {draft.utilitiesIncluded && <span className="chip good">Utilities</span>}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sticky-cta">
        {step > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: "0 0 auto", paddingInline: 20 }}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary btn-block" onClick={next}>
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Publishing…" : "Publish listing"}
          </button>
        )}
      </div>
    </>
  );
}

function Switch({
  label,
  sub,
  on,
  onToggle,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="switch" style={{ width: "100%" }} onClick={onToggle}>
      <div style={{ textAlign: "left" }}>
        <div className="switch-label">{label}</div>
        {sub && <div className="switch-sub">{sub}</div>}
      </div>
      <div className={`toggle${on ? " on" : ""}`} />
    </button>
  );
}
