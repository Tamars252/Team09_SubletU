import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { Reference, Settings as SettingsShape } from "../api/types.ts";
import { useAuth } from "../state/AuthContext.tsx";
import { IconCheck, IconLogout, IconShield, IconStar } from "../components/Icons.tsx";

type Props = { reference: Reference | null };

export function Settings({ reference }: Props) {
  const { user, logout, refresh } = useAuth();
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [stats, setStats] = useState<{ likes: number; passes: number; remaining: number } | null>(
    null,
  );
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then(({ settings: s }) => setSettings(s))
      .catch(() => undefined);
    api
      .swipeStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function patchSettings(patch: Partial<SettingsShape>) {
    if (!settings) return;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    try {
      const { settings: saved } = await api.saveSettings(patch);
      setSettings(saved);
      if (patch.university) await refresh();
    } catch (err) {
      setSettings(settings);
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save that setting",
      });
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await api.updateProfile({ name, bio });
      await refresh();
      setNotice({ kind: "success", text: "Profile updated" });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save your profile",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetBrowsing() {
    try {
      await api.resetSwipes(true);
      const fresh = await api.swipeStats();
      setStats(fresh);
      setNotice({ kind: "success", text: "Browsing history cleared — saved listings kept" });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not reset browsing",
      });
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="header">
        <div className="header-title">Profile</div>
      </div>

      <div className="section">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="avatar lg">{user.avatarInitials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 16 }}>
                {user.name}
                {user.verified && (
                  <span className="chip good" style={{ padding: "2px 7px", fontSize: 10.5 }}>
                    <IconCheck size={10} strokeWidth={3} />
                    Verified
                  </span>
                )}
              </div>
              <div className="tiny">{user.email}</div>
              <div className="tiny">{user.university}</div>
            </div>
            {user.reviewCount > 0 && (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontWeight: 700,
                    color: "var(--gold)",
                  }}
                >
                  <IconStar size={13} />
                  {user.rating.toFixed(1)}
                </div>
                <div className="tiny">{user.reviewCount} reviews</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className={`banner ${notice.kind}`}>{notice.text}</div>
        </div>
      )}

      {stats && (
        <div className="section" style={{ paddingTop: 0 }}>
          <h2 className="section-title">Your browsing</h2>
          <div className="fact-grid">
            <div className="fact">
              <b>{stats.likes}</b>
              <span>saved</span>
            </div>
            <div className="fact">
              <b>{stats.passes}</b>
              <span>passed</span>
            </div>
            <div className="fact">
              <b>{stats.remaining}</b>
              <span>left to see</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-block btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => void resetBrowsing()}
          >
            Reset browsing history
          </button>
        </div>
      )}

      <div className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">Edit profile</h2>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Bio</span>
          <textarea
            className="input"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell hosts a little about yourself — year, major, habits."
            maxLength={600}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={saving || (name === user.name && bio === user.bio)}
          onClick={() => void saveProfile()}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      {settings && (
        <>
          <div className="section" style={{ paddingTop: 0 }}>
            <h2 className="section-title">Search defaults</h2>
            <label className="field">
              <span className="field-label">Campus</span>
              <select
                className="input"
                value={settings.university}
                onChange={(e) => void patchSettings({ university: e.target.value })}
              >
                {(reference?.universities ?? [settings.university]).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Distances and the map's starting view are measured from here.
              </span>
            </label>

            <div className="field">
              <span className="field-label">
                Default search radius — {settings.searchRadiusMiles} mi
              </span>
              <div className="range-row">
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={settings.searchRadiusMiles}
                  onChange={(e) =>
                    setSettings({ ...settings, searchRadiusMiles: Number(e.target.value) })
                  }
                  onPointerUp={() =>
                    void patchSettings({ searchRadiusMiles: settings.searchRadiusMiles })
                  }
                />
              </div>
            </div>
          </div>

          <div className="section" style={{ paddingTop: 0 }}>
            <h2 className="section-title">Notifications</h2>
            <div className="card">
              <Toggle
                label="New matches"
                on={settings.notifyNewMatches}
                onToggle={() => void patchSettings({ notifyNewMatches: !settings.notifyNewMatches })}
              />
              <Toggle
                label="Messages"
                on={settings.notifyMessages}
                onToggle={() => void patchSettings({ notifyMessages: !settings.notifyMessages })}
              />
              <Toggle
                label="Price drops on saved listings"
                on={settings.notifyPriceDrops}
                onToggle={() => void patchSettings({ notifyPriceDrops: !settings.notifyPriceDrops })}
              />
              <Toggle
                label="Only show verified hosts"
                on={settings.showOnlyVerifiedHosts}
                onToggle={() =>
                  void patchSettings({ showOnlyVerifiedHosts: !settings.showOnlyVerifiedHosts })
                }
              />
            </div>
            <div className="tiny" style={{ marginTop: 8 }}>
              Preferences are encrypted before they're stored.
            </div>
          </div>
        </>
      )}

      <div className="section" style={{ paddingTop: 0 }}>
        <div className="banner info">
          <IconShield size={17} />
          <div>
            <strong>Stay safe.</strong> Tour in person before you pay anything, never wire money or
            send gift cards, and keep the conversation in SubletU so we can help if something goes
            wrong.
          </div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0, paddingBottom: 32 }}>
        <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
          <IconLogout size={17} />
          Sign out
        </button>
      </div>
    </>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="switch" style={{ width: "100%" }} onClick={onToggle}>
      <span className="switch-label">{label}</span>
      <span className={`toggle${on ? " on" : ""}`} />
    </button>
  );
}
