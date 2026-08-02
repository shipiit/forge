/** A switch. `role="switch"` so assistive tech announces on/off, not "button". */
export function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3.5 py-3 text-left transition-colors duration-150 hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-[18px] w-[32px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none ${
          checked ? 'bg-[rgb(var(--syn-keyword))]' : 'bg-white/15'
        }`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-full bg-white transition-transform duration-200 motion-reduce:transition-none ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{hint}</span>}
      </span>
    </button>
  );
}

/** Multi-select chips — used for tool allowlists and event lists. */
export function ChipGroup({
  options,
  selected,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11.5px] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.97] motion-reduce:transition-none ${
              on
                ? 'border-[rgb(var(--syn-keyword))]/40 bg-[rgb(var(--syn-keyword))]/10 text-[rgb(var(--syn-keyword))]'
                : 'border-white/[0.09] text-muted hover:border-white/25 hover:text-text'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
