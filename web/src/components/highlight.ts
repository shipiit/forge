/**
 * A tiny, dependency-free tokenizer for the handful of languages this site
 * shows: yaml, bash, json, markdown, and ts.
 *
 * Deliberately hand-rolled rather than pulling in Shiki or Prism — the surface
 * is five languages of short snippets, and a stock highlighter theme would ship
 * its own neutrals and its own brand hue, making code blocks the one element on
 * the page that ignores the project palette. Every class here maps to a CSS
 * variable derived from that palette (see index.css).
 *
 * Output is a flat token list so the renderer stays a pure map — no innerHTML,
 * so nothing here can inject markup.
 */

export type TokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'fn' | 'type' | 'prop' | 'punct' | 'text';

export interface Token {
  kind: TokenKind;
  value: string;
}

export type Language = 'yaml' | 'bash' | 'json' | 'markdown' | 'ts' | 'text';

/** Ordered rules; the first match at a position wins. */
type Rule = { kind: TokenKind; re: RegExp };

const YAML: Rule[] = [
  { kind: 'comment', re: /^#.*/ },
  { kind: 'string', re: /^(['"])(?:\\.|(?!\1)[^\\])*\1/ },
  { kind: 'prop', re: /^[A-Za-z_][\w-]*(?=\s*:)/ },
  { kind: 'keyword', re: /^\b(?:true|false|null|on|off|yes|no)\b/ },
  { kind: 'number', re: /^\b\d[\d.]*\b/ },
  { kind: 'fn', re: /^\$\{\{[^}]*\}\}/ },
  { kind: 'punct', re: /^[-:[\]{},|>]/ },
];

const BASH: Rule[] = [
  { kind: 'comment', re: /^#.*/ },
  { kind: 'string', re: /^(['"])(?:\\.|(?!\1)[^\\])*\1/ },
  { kind: 'keyword', re: /^\b(?:if|then|fi|for|do|done|export|cd|echo|set|source|sudo)\b/ },
  { kind: 'fn', re: /^\b(?:npm|npx|node|git|gh|docker|curl|jq|forge|aws|gcloud)\b/ },
  { kind: 'prop', re: /^--?[A-Za-z][\w-]*/ },
  { kind: 'number', re: /^\$\{?\w+\}?/ },
  { kind: 'punct', re: /^[|&><;()]/ },
];

const JSON_RULES: Rule[] = [
  { kind: 'prop', re: /^"(?:\\.|[^"\\])*"(?=\s*:)/ },
  { kind: 'string', re: /^"(?:\\.|[^"\\])*"/ },
  { kind: 'keyword', re: /^\b(?:true|false|null)\b/ },
  { kind: 'number', re: /^-?\b\d[\d.eE+-]*\b/ },
  { kind: 'punct', re: /^[{}[\],:]/ },
];

const MARKDOWN: Rule[] = [
  { kind: 'keyword', re: /^#{1,6} .*/ },
  { kind: 'prop', re: /^\*\*[^*]+\*\*/ },
  { kind: 'fn', re: /^`[^`]+`/ },
  { kind: 'comment', re: /^^---$/m },
  { kind: 'punct', re: /^[-*>]/ },
];

const TS: Rule[] = [
  { kind: 'comment', re: /^\/\/.*/ },
  { kind: 'comment', re: /^\/\*[\s\S]*?\*\// },
  { kind: 'string', re: /^(['"`])(?:\\.|(?!\1)[^\\])*\1/ },
  {
    kind: 'keyword',
    re: /^\b(?:const|let|var|function|return|if|else|for|while|import|from|export|await|async|new|class|interface|type|extends|implements)\b/,
  },
  { kind: 'keyword', re: /^\b(?:true|false|null|undefined)\b/ },
  { kind: 'fn', re: /^[A-Za-z_$][\w$]*(?=\()/ },
  { kind: 'type', re: /^\b[A-Z][\w$]*\b/ },
  { kind: 'number', re: /^-?\b\d[\d._]*\b/ },
  { kind: 'punct', re: /^[{}()[\];,.<>=+\-*/!?:&|]/ },
];

const RULES: Record<Language, Rule[]> = {
  yaml: YAML,
  bash: BASH,
  json: JSON_RULES,
  markdown: MARKDOWN,
  ts: TS,
  text: [],
};

/** Guess a language from a label like `.github/workflows/forge.yml` or `bash`. */
export function detectLanguage(label: string): Language {
  const l = label.toLowerCase();
  if (/\.ya?ml|yaml|workflow|agent\.yml/.test(l)) return 'yaml';
  if (/\.json|json/.test(l)) return 'json';
  if (/\.md|markdown|skill/.test(l)) return 'markdown';
  if (/\.tsx?|typescript|\bts\b/.test(l)) return 'ts';
  if (/bash|shell|sh\b|terminal|cli|command|env/.test(l)) return 'bash';
  return 'text';
}

/**
 * Tokenize one line. Lines are independent, which keeps the tokenizer simple and
 * means a block can be rendered incrementally without tracking multi-line state.
 */
export function tokenizeLine(line: string, lang: Language): Token[] {
  const rules = RULES[lang];
  if (!rules.length || !line) return [{ kind: 'text', value: line }];

  const out: Token[] = [];
  let rest = line;
  let plain = '';

  const flush = () => {
    if (plain) {
      out.push({ kind: 'text', value: plain });
      plain = '';
    }
  };

  while (rest) {
    // Preserve leading whitespace verbatim so indentation survives.
    const ws = rest.match(/^\s+/);
    if (ws) {
      plain += ws[0];
      rest = rest.slice(ws[0].length);
      continue;
    }
    const hit = rules.find((r) => r.re.test(rest));
    if (hit) {
      const m = rest.match(hit.re)!;
      flush();
      out.push({ kind: hit.kind, value: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }
    plain += rest[0];
    rest = rest.slice(1);
  }
  flush();
  return out;
}

const CLASS: Record<TokenKind, string> = {
  keyword: 'tok-keyword',
  string: 'tok-string',
  number: 'tok-number',
  comment: 'tok-comment',
  fn: 'tok-fn',
  type: 'tok-type',
  prop: 'tok-prop',
  punct: 'tok-punct',
  text: '',
};

export function tokenClass(kind: TokenKind): string {
  return CLASS[kind];
}
