import type { ContentPart, Msg } from '../providers/types.js';

/**
 * Conversation compaction.
 *
 * The agent loop resends the whole transcript every turn. The bulk of it is old
 * tool output — file dumps, search hits, test logs — that mattered for one turn
 * and is dead weight for the next twenty. Compaction replaces the *content* of
 * old tool results with a short stub, leaving every tool_use/tool_result pair
 * intact so the message history stays valid for every provider.
 *
 * Interaction with prompt caching: rewriting old messages invalidates the cached
 * prefix, so compacting on every turn would defeat the cache. It therefore only
 * fires once the transcript is large enough that resending it costs more than
 * rebuilding the cache — governed by {@link COMPACT_THRESHOLD_CHARS}.
 */

/** Recent turns are always kept verbatim — the agent is actively using them. */
export const KEEP_RECENT_MESSAGES = 6;

/** Only compact once the transcript exceeds roughly this many characters. */
export const COMPACT_THRESHOLD_CHARS = 120_000;

/** Tool results longer than this are stubbed when they fall out of the window. */
export const STUB_OVER_CHARS = 600;

export function estimateChars(messages: Msg[]): number {
  let total = 0;
  for (const m of messages) {
    for (const part of m.content) {
      if (part.type === 'text') total += part.text.length;
      else if (part.type === 'tool_result') total += part.content.length;
      else if (part.type === 'tool_use') total += JSON.stringify(part.args).length;
      else if (part.type === 'image') total += part.dataB64.length;
    }
  }
  return total;
}

function stub(part: Extract<ContentPart, { type: 'tool_result' }>): ContentPart {
  const head = part.content.slice(0, 200).trimEnd();
  return {
    ...part,
    content:
      `${head}\n… [${part.content.length - head.length} characters elided to save context. ` +
      `Re-run the tool if you need this output again.]`,
  };
}

export interface CompactionResult {
  messages: Msg[];
  /** True when anything was actually rewritten. */
  compacted: boolean;
  /** Characters removed. */
  savedChars: number;
}

/**
 * Compact a transcript if it has grown past the threshold. Returns the original
 * array untouched when compaction isn't warranted, so the cached prefix survives.
 */
export function compactMessages(
  messages: Msg[],
  opts: { keepRecent?: number; thresholdChars?: number; stubOverChars?: number } = {},
): CompactionResult {
  const keepRecent = opts.keepRecent ?? KEEP_RECENT_MESSAGES;
  const threshold = opts.thresholdChars ?? COMPACT_THRESHOLD_CHARS;
  const stubOver = opts.stubOverChars ?? STUB_OVER_CHARS;

  const before = estimateChars(messages);
  if (before <= threshold) return { messages, compacted: false, savedChars: 0 };

  const cutoff = messages.length - keepRecent;
  if (cutoff <= 0) return { messages, compacted: false, savedChars: 0 };

  let changed = false;
  const out = messages.map((m, i) => {
    if (i >= cutoff) return m;
    let touched = false;
    const content = m.content.map((part) => {
      // Images are the single largest thing in a transcript; drop the payload
      // once they are out of the window, keeping a note that one was here.
      if (part.type === 'image') {
        touched = true;
        return { type: 'text', text: '[image elided to save context]' } as ContentPart;
      }
      if (part.type === 'tool_result' && part.content.length > stubOver) {
        touched = true;
        return stub(part);
      }
      return part;
    });
    if (!touched) return m;
    changed = true;
    return { ...m, content };
  });

  if (!changed) return { messages, compacted: false, savedChars: 0 };
  return { messages: out, compacted: true, savedChars: before - estimateChars(out) };
}
