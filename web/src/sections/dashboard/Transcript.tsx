import { useEffect, useMemo, useState } from 'react';
import { apiBase, apiToken, usageUrl } from '../../lib/usage';
import { fmtNum } from '../../lib/format';
import { Empty } from './charts';

/**
 * The conversation, read as a conversation.
 *
 * The transcript is stored as the raw message array the provider saw, which is
 * the right thing to keep and the wrong thing to read — a 200 KB wall of JSON
 * where the interesting part is four words of tool output. This renders it as
 * turns: what was asked, what the model said, what each tool was given and gave
 * back, with the long parts folded away until you want them.
 */

interface Part {
  type: string;
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
  toolCallId?: string;
}
interface Message {
  role: string;
  content: Part[] | string;
}
interface Segment {
  segment?: number;
  messages: Message[];
  finalText?: string;
}

const ROLE_STYLE: Record<string, { label: string; dot: string; tint: string }> = {
  user: { label: 'Input', dot: 'rgb(var(--info))', tint: 'rgb(var(--info) / 0.1)' },
  assistant: { label: 'Agent', dot: 'rgb(var(--accent))', tint: 'rgb(var(--accent) / 0.1)' },
  system: { label: 'System', dot: 'rgb(var(--muted))', tint: 'rgb(var(--muted) / 0.1)' },
};

/** Long blocks start folded: most of a transcript is file contents. */
function Folded({ text, lines = 14 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const split = text.split('\n');
  const long = split.length > lines || text.length > 1400;
  const shown = open || !long ? text : `${split.slice(0, lines).join('\n').slice(0, 1400)}`;

  return (
    <div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-muted">{shown}</pre>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 text-[11.5px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          {open ? 'Show less' : `Show all ${fmtNum(split.length)} lines · ${fmtNum(text.length)} chars`}
        </button>
      )}
    </div>
  );
}

function ToolUse({ part }: { part: Part }) {
  return (
    <div className="rounded-xl border border-line/[0.08] bg-panelStrong/60 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded-md bg-accent/[0.14] px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">{part.name}</span>
        <span className="text-[11px] text-faint">called</span>
      </div>
      <Folded text={JSON.stringify(part.args ?? {}, null, 2)} lines={8} />
    </div>
  );
}

function ToolResult({ part }: { part: Part }) {
  return (
    <div className={`rounded-xl border p-3 ${part.isError ? 'border-bad/25 bg-bad/[0.06]' : 'border-line/[0.08] bg-panelStrong/60'}`}>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
        {part.isError ? <span className="text-bad">returned an error</span> : 'returned'}
      </div>
      <Folded text={part.content ?? ''} />
    </div>
  );
}

function Bubble({ message, index }: { message: Message; index: number }) {
  const parts: Part[] = Array.isArray(message.content) ? message.content : [{ type: 'text', text: String(message.content) }];
  const style = ROLE_STYLE[message.role] ?? ROLE_STYLE.system!;

  return (
    <div className="grid grid-cols-[76px_1fr] gap-3">
      <div className="pt-0.5 text-right">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: style.dot }}>
          <i className="h-1.5 w-1.5 rounded-full bg-current" />
          {style.label}
        </span>
        <div className="mt-0.5 font-mono text-[10.5px] text-faint">#{index + 1}</div>
      </div>

      <div className="grid gap-2 border-l border-line/[0.07] pl-4">
        {parts.map((p, i) => {
          if (p.type === 'tool_use') return <ToolUse key={i} part={p} />;
          if (p.type === 'tool_result') return <ToolResult key={i} part={p} />;
          if (p.type === 'image') {
            return (
              <div key={i} className="rounded-xl border border-line/[0.08] bg-panelStrong/60 p-3 text-[12px] text-muted">
                (image attached)
              </div>
            );
          }
          return (
            <div key={i} className="rounded-xl border border-line/[0.08] p-3" style={{ background: style.tint }}>
              <Folded text={p.text ?? ''} lines={20} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Transcript({ artifactId }: { artifactId: string }) {
  const [raw, setRaw] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    const token = apiToken();
    fetch(`${apiBase()}/api/artifacts/${artifactId}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`The API returned ${r.status}.`))))
      .then((t) => live && setRaw(t))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [artifactId]);

  const segments = useMemo<Segment[] | undefined>(() => {
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      // Older runs stored a bare message array; newer ones store segments.
      return Array.isArray(parsed) && parsed[0]?.messages ? (parsed as Segment[]) : [{ messages: parsed as Message[] }];
    } catch {
      return [];
    }
  }, [raw]);

  if (error) return <Empty title="Could not load the transcript">{error}</Empty>;
  if (!segments) return <div className="h-24 animate-pulse rounded-xl bg-line/[0.05]" />;
  if (segments.length === 0) {
    return (
      <Empty title="Not a readable transcript">
        <a href={usageUrl(`api/artifacts/${artifactId}`)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Open the raw file ↗
        </a>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6">
      {segments.map((seg, i) => (
        <div key={i} className="grid gap-4">
          {segments.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Segment {seg.segment ?? i + 1}</span>
              <span className="h-px flex-1 bg-line/[0.07]" />
            </div>
          )}
          {seg.messages.map((m, j) => (
            <Bubble key={j} message={m} index={j} />
          ))}
          {seg.finalText && (
            <div className="grid grid-cols-[76px_1fr] gap-3">
              <div className="pt-0.5 text-right text-[11px] font-semibold text-ok">Answer</div>
              <div className="rounded-xl border border-ok/20 bg-ok/[0.06] p-3 pl-4">
                <Folded text={seg.finalText} lines={30} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
