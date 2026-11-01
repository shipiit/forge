import type { ReactNode } from "react";

interface GroupProps {
  title: string;
  children: ReactNode;
}

/** One titled fieldset of the builder form. */
export function Group({ title, children }: GroupProps) {
  return (
    <fieldset className="border border-white/[0.08] bg-white/[0.015] p-5">
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </legend>
      <div className="mt-3 space-y-5">{children}</div>
    </fieldset>
  );
}
