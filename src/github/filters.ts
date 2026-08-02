/**
 * Trigger filters — decide whether an event should actually start a run.
 *
 * Modelled on Claude Code routines' GitHub trigger filters: a list of conditions
 * that must ALL match. Pure functions, no I/O, so the whole matrix is unit-tested.
 */

export type FilterField =
  | 'author'
  | 'title'
  | 'body'
  | 'base_branch'
  | 'head_branch'
  | 'labels'
  | 'is_draft'
  | 'is_merged';

export type FilterOperator =
  | 'equals'
  | 'contains'
  | 'starts_with'
  | 'is_one_of'
  | 'is_not_one_of'
  | 'matches_regex';

export interface TriggerFilter {
  field: FilterField;
  operator: FilterOperator;
  /** String for most operators; array for is_one_of / is_not_one_of; boolean for is_draft / is_merged. */
  value: string | string[] | boolean;
}

/** The event facts a filter can be evaluated against. */
export interface FilterSubject {
  author?: string;
  title?: string;
  body?: string;
  baseBranch?: string;
  headBranch?: string;
  labels?: string[];
  isDraft?: boolean;
  isMerged?: boolean;
}

const BOOLEAN_FIELDS = new Set<FilterField>(['is_draft', 'is_merged']);

function fieldValue(field: FilterField, subject: FilterSubject): string | string[] | boolean | undefined {
  switch (field) {
    case 'author':
      return subject.author;
    case 'title':
      return subject.title;
    case 'body':
      return subject.body;
    case 'base_branch':
      return subject.baseBranch;
    case 'head_branch':
      return subject.headBranch;
    case 'labels':
      return subject.labels;
    case 'is_draft':
      return subject.isDraft;
    case 'is_merged':
      return subject.isMerged;
  }
}

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null) return [];
  return [String(v)];
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return String(v).toLowerCase() === 'true';
}

/**
 * Evaluate one filter.
 *
 * `matches_regex` tests the ENTIRE field, not a substring within it — the same
 * semantics as Claude Code. A filter of `hotfix` matches only a title that is
 * exactly "hotfix"; use `.*hotfix.*`, or the `contains` operator, for substring
 * matching. This is the single most common mistake with these filters.
 *
 * An invalid regex never throws — it simply doesn't match, so a typo in config
 * can't take down the webhook handler.
 */
export function matchesFilter(filter: TriggerFilter, subject: FilterSubject): boolean {
  const actual = fieldValue(filter.field, subject);

  if (BOOLEAN_FIELDS.has(filter.field)) {
    return toBool(actual) === toBool(filter.value);
  }

  const haystack = asStrings(actual);
  const isMulti = filter.field === 'labels';

  switch (filter.operator) {
    case 'equals':
      return haystack.some((h) => h === String(filter.value));
    case 'contains':
      return haystack.some((h) => h.toLowerCase().includes(String(filter.value).toLowerCase()));
    case 'starts_with':
      return haystack.some((h) => h.toLowerCase().startsWith(String(filter.value).toLowerCase()));
    case 'is_one_of': {
      const allowed = asStrings(filter.value);
      return haystack.some((h) => allowed.includes(h));
    }
    case 'is_not_one_of': {
      const denied = asStrings(filter.value);
      // For a multi-valued field, "is not one of" means NONE of the values are denied.
      return isMulti ? haystack.every((h) => !denied.includes(h)) : !haystack.some((h) => denied.includes(h));
    }
    case 'matches_regex': {
      let re: RegExp;
      try {
        // Anchored: the pattern must match the whole value.
        re = new RegExp(`^(?:${String(filter.value)})$`);
      } catch {
        return false; // invalid regex in config never crashes a run
      }
      return haystack.some((h) => re.test(h));
    }
    default:
      return false;
  }
}

/** All filters must match. An empty filter list always matches. */
export function matchesAllFilters(filters: TriggerFilter[], subject: FilterSubject): boolean {
  return filters.every((f) => matchesFilter(f, subject));
}

const FIELDS = new Set<string>([
  'author',
  'title',
  'body',
  'base_branch',
  'head_branch',
  'labels',
  'is_draft',
  'is_merged',
]);
const OPERATORS = new Set<string>([
  'equals',
  'contains',
  'starts_with',
  'is_one_of',
  'is_not_one_of',
  'matches_regex',
]);

/**
 * Parse filters from untrusted repo config, dropping anything malformed rather
 * than throwing — a bad `agent.yml` must never break the app.
 */
export function parseFilters(raw: unknown): TriggerFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: TriggerFilter[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown>;
    if (!r || typeof r !== 'object') continue;
    const field = String(r.field ?? '');
    const operator = String(r.operator ?? 'equals');
    if (!FIELDS.has(field) || !OPERATORS.has(operator)) continue;
    const value = r.value;
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && typeof value !== 'boolean' && !Array.isArray(value)) continue;
    out.push({
      field: field as FilterField,
      operator: operator as FilterOperator,
      value: value as string | string[] | boolean,
    });
  }
  return out;
}
