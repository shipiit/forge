const BASE =
  'w-full rounded-lg border bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-text placeholder:text-muted/70 ' +
  'transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

/** Single-line text input. `invalid` paints the border, never hides the value. */
export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  mono,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${BASE} ${mono ? 'font-mono' : ''} ${
        invalid ? 'border-rose-400/50 hover:border-rose-400/70' : 'border-white/[0.09] hover:border-white/20'
      }`}
    />
  );
}

/** Multi-line input for prompts and instruction blocks. */
export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${BASE} resize-y border-white/[0.09] font-mono leading-relaxed hover:border-white/20`}
    />
  );
}
