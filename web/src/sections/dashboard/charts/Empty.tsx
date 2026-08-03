/** What a card shows when its query came back with nothing. */
export function Empty({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="grid place-items-center gap-1.5 px-5 py-11 text-center text-sm text-muted">
      {title && <b className="text-[14px] font-semibold text-text">{title}</b>}
      <span>{children}</span>
    </div>
  );
}
