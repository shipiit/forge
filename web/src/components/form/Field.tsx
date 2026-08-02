import type { ReactNode } from "react";

/**
 * Label + hint + required marker wrapper shared by every control.
 *
 * `required` is shown, not just enforced, so a reader can see what they must
 * supply before they start filling anything in.
 */
export function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-2 text-[13px] font-semibold text-text"
      >
        {label}
        {required ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[rgb(var(--syn-prop))]">
            required
          </span>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            optional
          </span>
        )}
      </label>
      {hint && (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
