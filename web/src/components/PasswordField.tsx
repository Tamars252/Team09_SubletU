import { useId, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: "current-password" | "new-password";
  showStrength?: boolean;
  minLength?: number;
};

/**
 * Scores a password for the meter only. The server is the authority on whether
 * a password is acceptable — this is feedback while typing, not a gate, and it
 * deliberately rewards length over punctuation the way NIST recommends.
 */
export function scorePassword(value: string, minLength: number): { score: number; label: string } {
  if (!value) return { score: 0, label: "" };

  let score = 0;
  if (value.length >= minLength) score += 2;
  else if (value.length >= Math.max(8, minLength - 4)) score += 1;
  if (value.length >= minLength + 6) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  if (new Set(value).size >= 10) score += 1;

  // Obvious shapes shouldn't read as strong however long they are.
  if (/^(.)\1+$/.test(value) || /^(?:1234|abcd|qwer|password)/i.test(value)) score = Math.min(score, 1);

  const capped = Math.min(score, 5);
  const labels = ["Too weak", "Too weak", "Weak", "Fair", "Good", "Strong"];
  return { score: capped, label: labels[capped] };
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showStrength = false,
  minLength = 12,
}: Props) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const strength = showStrength ? scorePassword(value, minLength) : null;

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <div className="password-wrap">
        <input
          id={id}
          className="input"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          // Typos are the main reason sign-in fails; letting people look is
          // better practice than forcing blind entry.
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      {strength && (
        <div className="strength" aria-live="polite">
          <div className="strength-track">
            <div
              className={`strength-fill s${strength.score}`}
              style={{ width: `${(strength.score / 5) * 100}%` }}
            />
          </div>
          <span className="strength-label">
            {value ? strength.label : `At least ${minLength} characters`}
          </span>
        </div>
      )}
    </label>
  );
}
