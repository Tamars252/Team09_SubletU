import { useState } from "react";
import { ApiError, api } from "../api/client.ts";
import { IconHeart, IconHeartFilled } from "./Icons.tsx";

export type SaveButtonProps = {
  listingId: string;
  /** Whether the listing is saved right now — usually `listing.saved`. */
  saved: boolean;
  /**
   * Told the new state after the API confirms it, so the owning screen can
   * update its own copy of the listing.
   */
  onChange?: (saved: boolean) => void;
  /** Told when the call fails, so the screen can show its own message. */
  onError?: (message: string) => void;
  size?: number;
};

/**
 * TM09-101 (AC4): the save toggle, reusable by any card.
 *
 * It owns only the in-flight flag; the saved state itself is passed in, so the
 * screen that holds the listing stays the single source of truth. The swipe
 * deck and the listing detail screen can drop this in as their stories land —
 * it is deliberately not wired to cards that do not exist on main yet.
 *
 * Both endpoints are idempotent (docs/api-contract.md), so a double tap cannot
 * produce a duplicate save or a failed unsave.
 */
export function SaveButton({
  listingId,
  saved,
  onChange,
  onError,
  size = 20,
}: SaveButtonProps) {
  const [busy, setBusy] = useState(false);
  const Icon = saved ? IconHeartFilled : IconHeart;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !saved;
    try {
      if (next) await api.save(listingId);
      else await api.unsave(listingId);
      onChange?.(next);
    } catch (err: unknown) {
      onError?.(
        err instanceof ApiError
          ? err.message
          : next
            ? "Couldn't save that listing."
            : "Couldn't remove that listing.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`icon-btn${saved ? " active" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save listing"}
    >
      <Icon size={size} />
    </button>
  );
}
