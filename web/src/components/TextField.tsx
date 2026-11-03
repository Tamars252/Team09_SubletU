import { useId } from "react";
import type { HTMLInputAutoCompleteAttribute } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: "text" | "email";
  autoComplete?: HTMLInputAutoCompleteAttribute;
  error?: string;
  inputMode?: "text" | "email";
  autoFocus?: boolean;
};

/** A labelled input that keeps its error wired to the field for screen readers. */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  error,
  inputMode,
  autoFocus,
}: Props) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
