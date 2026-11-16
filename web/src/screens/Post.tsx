import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { HOME_PATH } from "../auth/guard.ts";
import { useShell } from "../components/AppShell.tsx";
import { IconCamera, IconPin, IconX } from "../components/Icons.tsx";
import { compressPhoto } from "../lib/compressPhoto.ts";
import type { CompressedPhoto } from "../lib/compressPhoto.ts";
import {
  EMPTY_DRAFT,
  MAX_LONG_EDGE,
  MAX_PHOTOS,
  addressQuery,
  draftToBody,
  formatBytes,
  pinEmbedUrl,
  validateDraft,
} from "../lib/postListing.ts";
import type { DraftErrors, ListingDraft } from "../lib/postListing.ts";

type Pin =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; lat: number; lng: number; label: string }
  | { kind: "missing"; message: string };

type Submit =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "error"; message: string; problems: string[] }
  | { kind: "done"; listing: Listing };

/**
 * TM09-98: Post a listing.
 *
 * AC1  The form runs validateDraft(), which mirrors ListingManager's rules, and
 *      shows every problem next to its field before anything is sent.
 * AC2  Each picked photo goes through compressPhoto(): long edge capped at
 *      1600px and re-encoded as JPEG in the browser, before upload.
 * AC3  "Check on map" geocodes the typed address and drops a pin. The server
 *      geocodes the same address on submit, and the success screen shows where
 *      the listing was actually pinned.
 */
export function Post() {
  const { reference } = useShell();
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [photos, setPhotos] = useState<CompressedPhoto[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [pin, setPin] = useState<Pin>({ kind: "idle" });
  const [submit, setSubmit] = useState<Submit>({ kind: "editing" });

  function set<K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === "address" || key === "city" || key === "state") setPin({ kind: "idle" });
  }

  function toggleAmenity(name: string) {
    set(
      "amenities",
      draft.amenities.includes(name)
        ? draft.amenities.filter((a) => a !== name)
        : [...draft.amenities, name],
    );
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoNotice(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setPhotoNotice(`Only ${MAX_PHOTOS} photos per listing — the rest were skipped.`);
    setCompressing((n) => n + picked.length);
    for (const file of picked) {
      try {
        const photo = await compressPhoto(file);
        setPhotos((current) => [...current, photo].slice(0, MAX_PHOTOS));
      } catch (err) {
        setPhotoNotice((err as Error).message);
      } finally {
        setCompressing((n) => n - 1);
      }
    }
  }

  async function checkAddress() {
    const query = addressQuery(draft);
    if (draft.address.trim().length < 5) {
      setErrors((e) => ({ ...e, address: "Street address looks too short" }));
      return;
    }
    setPin({ kind: "looking" });
    try {
      const { results } = await api.geoSearch(query);
      const hit = results[0];
      if (hit) setPin({ kind: "found", lat: hit.lat, lng: hit.lng, label: hit.displayName ?? hit.name });
      else setPin({ kind: "missing", message: "We couldn't find that address. Check the street and city." });
    } catch {
      setPin({ kind: "missing", message: "Address lookup is unavailable right now. You can still post." });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateDraft(draft, photos.length);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSubmit({ kind: "error", message: "Fix the highlighted fields first.", problems: [] });
      return;
    }
    setSubmit({ kind: "saving" });
    try {
      const { listing } = await api.createListing(draftToBody(draft, photos.map((p) => p.dataUrl)));
      setSubmit({ kind: "done", listing });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmit({ kind: "error", message: err.message, problems: err.problems });
      } else {
        setSubmit({ kind: "error", message: "Something went wrong. Try again.", problems: [] });
      }
    }
  }

  if (submit.kind === "done") {
    return <Posted listing={submit.listing} onAnother={() => {
      setDraft(EMPTY_DRAFT);
      setPhotos([]);
      setPin({ kind: "idle" });
      setSubmit({ kind: "editing" });
    }} />;
  }

  const saving = submit.kind === "saving";

  return (
    <form className="section" onSubmit={onSubmit} noValidate data-testid="post-form">
      <h2 className="section-title">Post your sublet</h2>

      {submit.kind === "error" && (
        <div className="banner error" role="alert" style={{ marginBottom: 14 }}>
          <div>
            {submit.message}
            {submit.problems.length > 0 && (
              <ul>
                {submit.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Field label="Title" error={errors.title}>
        {(id, invalid) => (
          <input id={id} className="input" value={draft.title} maxLength={120}
            placeholder="Sunny room two blocks from the quad"
            aria-invalid={invalid} onChange={(e) => set("title", e.target.value)} />
        )}
      </Field>

      <Field label="Street address" error={errors.address}>
        {(id, invalid) => (
          <input id={id} className="input" value={draft.address} autoComplete="street-address"
            placeholder="742 Ostrom Ave" aria-invalid={invalid}
            onChange={(e) => set("address", e.target.value)} />
        )}
      </Field>
      <div className="row">
        <Field label="City" error={errors.city}>
          {(id, invalid) => (
            <input id={id} className="input" value={draft.city} aria-invalid={invalid}
              onChange={(e) => set("city", e.target.value)} />
          )}
        </Field>
        <Field label="State" error={errors.state}>
          {(id, invalid) => (
            <input id={id} className="input" value={draft.state} maxLength={2} aria-invalid={invalid}
              onChange={(e) => set("state", e.target.value.toUpperCase())} />
          )}
        </Field>
        <Field label="ZIP" error={errors.zip}>
          {(id, invalid) => (
            <input id={id} className="input" value={draft.zip} inputMode="numeric" maxLength={10}
              aria-invalid={invalid} onChange={(e) => set("zip", e.target.value)} />
          )}
        </Field>
      </div>

      <div className="field">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void checkAddress()}
          disabled={pin.kind === "looking"}>
          <IconPin size={16} /> {pin.kind === "looking" ? "Looking up…" : "Check on map"}
        </button>
        {pin.kind === "found" && (
          <div style={{ marginTop: 10 }} data-testid="pin-preview">
            <iframe
              title="Where your listing will be pinned"
              src={pinEmbedUrl(pin.lat, pin.lng)}
              style={{ width: "100%", height: 170, border: 0, borderRadius: 12 }}
              loading="lazy"
            />
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>
              Pinned at {pin.label}
            </p>
          </div>
        )}
        {pin.kind === "missing" && (
          <p className="field-hint" role="status">{pin.message}</p>
        )}
      </div>

      <Field label="Description" error={errors.description}>
        {(id, invalid) => (
          <textarea id={id} className="input" rows={4} value={draft.description} maxLength={4000}
            placeholder="What's the room like, who are the roommates, what's nearby?"
            aria-invalid={invalid} onChange={(e) => set("description", e.target.value)} />
        )}
      </Field>

      <h3 className="section-title" style={{ marginTop: 18 }}>Price and dates</h3>
      <div className="row">
        <Field label="Monthly rent ($)" error={errors.monthlyRent}>
          {(id, invalid) => (
            <input id={id} className="input" inputMode="decimal" value={draft.monthlyRent}
              aria-invalid={invalid} onChange={(e) => set("monthlyRent", e.target.value)} />
          )}
        </Field>
        <Field label="Deposit ($)" error={errors.deposit}>
          {(id, invalid) => (
            <input id={id} className="input" inputMode="decimal" value={draft.deposit} placeholder="0"
              aria-invalid={invalid} onChange={(e) => set("deposit", e.target.value)} />
          )}
        </Field>
      </div>
      <div className="row">
        <Field label="Available from" error={errors.availableFrom}>
          {(id, invalid) => (
            <input id={id} className="input" type="date" value={draft.availableFrom}
              aria-invalid={invalid} onChange={(e) => set("availableFrom", e.target.value)} />
          )}
        </Field>
        <Field label="Available to" error={errors.availableTo}>
          {(id, invalid) => (
            <input id={id} className="input" type="date" value={draft.availableTo}
              aria-invalid={invalid} onChange={(e) => set("availableTo", e.target.value)} />
          )}
        </Field>
      </div>
      <Toggle label="Utilities included" on={draft.utilitiesIncluded} onChange={(v) => set("utilitiesIncluded", v)} />

      <h3 className="section-title" style={{ marginTop: 18 }}>The room</h3>
      <div className="row">
        <Field label="Bedrooms" error={errors.bedrooms}>
          {(id, invalid) => (
            <input id={id} className="input" inputMode="numeric" value={draft.bedrooms}
              aria-invalid={invalid} onChange={(e) => set("bedrooms", e.target.value)} />
          )}
        </Field>
        <Field label="Bathrooms" error={errors.bathrooms}>
          {(id, invalid) => (
            <input id={id} className="input" inputMode="decimal" value={draft.bathrooms}
              aria-invalid={invalid} onChange={(e) => set("bathrooms", e.target.value)} />
          )}
        </Field>
        <Field label="Roommates" error={errors.maxRoommates}>
          {(id, invalid) => (
            <input id={id} className="input" inputMode="numeric" value={draft.maxRoommates}
              aria-invalid={invalid} onChange={(e) => set("maxRoommates", e.target.value)} />
          )}
        </Field>
      </div>
      <Toggle label="Furnished" on={draft.furnished} onChange={(v) => set("furnished", v)} />
      <Toggle label="Pets allowed" on={draft.petsAllowed} onChange={(v) => set("petsAllowed", v)} />
      <Toggle label="Private bathroom" on={draft.privateBath} onChange={(v) => set("privateBath", v)} />

      {reference && reference.amenities.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 18 }}>Amenities</h3>
          <div className="chip-grid">
            {reference.amenities.map((a) => (
              <button type="button" key={a} className={`chip${draft.amenities.includes(a) ? " on" : ""}`}
                onClick={() => toggleAmenity(a)} aria-pressed={draft.amenities.includes(a)}>
                {a}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title" style={{ marginTop: 18 }}>
        Photos <span className="tiny muted">({photos.length}/{MAX_PHOTOS})</span>
      </h3>
      <p className="tiny muted" style={{ margin: "0 0 10px" }}>
        Resized to {MAX_LONG_EDGE}px on the long edge before upload, and location data is removed.
      </p>
      <div className="photo-grid" data-testid="photo-grid">
        {photos.map((p, i) => (
          <div key={i} className="photo-slot" style={{ backgroundImage: `url(${JSON.stringify(p.dataUrl)})` }}
            title={`${p.originalWidth}×${p.originalHeight} → ${p.width}×${p.height}, ${formatBytes(p.originalBytes)} → ${formatBytes(p.bytes)}`}>
            <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`}
              onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}>
              <IconX size={13} strokeWidth={2.6} />
            </button>
          </div>
        ))}
        {photos.length + compressing < MAX_PHOTOS && <PhotoPicker busy={compressing > 0} onPick={(f) => void addPhotos(f)} />}
      </div>
      {photoNotice && <p className="field-hint" role="status">{photoNotice}</p>}
      {errors.photos && <p className="field-error" role="alert">{errors.photos}</p>}

      <div className="sticky-cta" style={{ margin: "18px -18px -18px" }}>
        <button type="submit" className="btn btn-primary btn-block" disabled={saving || compressing > 0}>
          {saving ? "Posting…" : compressing > 0 ? "Preparing photos…" : "Post listing"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string, invalid: true | undefined) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children(id, error ? true : undefined)}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch">
      <span className="switch-label">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label}
        className={`toggle${on ? " on" : ""}`} onClick={() => onChange(!on)} />
    </div>
  );
}

function PhotoPicker({ busy, onPick }: { busy: boolean; onPick: (files: FileList | null) => void }) {
  const id = useId();
  return (
    <label className="photo-add" htmlFor={id}>
      <IconCamera size={22} />
      <span>{busy ? "Resizing…" : "Add photos"}</span>
      <input id={id} type="file" accept="image/*" multiple hidden
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }} />
    </label>
  );
}

function Posted({ listing, onAnother }: { listing: Listing; onAnother: () => void }) {
  const pinned = listing.lat !== null && listing.lng !== null;
  return (
    <div className="center-state" data-testid="post-done">
      <h3>Your listing is live</h3>
      <p>{listing.title}</p>
      {pinned ? (
        <>
          <iframe
            title="Where your listing is pinned"
            src={pinEmbedUrl(listing.lat as number, listing.lng as number)}
            style={{ width: "100%", maxWidth: 340, height: 180, border: 0, borderRadius: 12 }}
            loading="lazy"
          />
          <p className="tiny">Pinned at {listing.address}, {listing.city}</p>
        </>
      ) : (
        <p className="tiny">
          We couldn't place {listing.address} on the map yet. It still shows in Browse, and the pin
          appears once the address resolves.
        </p>
      )}
      <Link to={HOME_PATH} className="btn btn-secondary">Back to Browse</Link>
      <button type="button" className="btn btn-ghost" onClick={onAnother}>Post another</button>
    </div>
  );
}
