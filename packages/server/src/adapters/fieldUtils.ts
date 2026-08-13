/**
 * Tolerant field access for agency GIS attributes.
 *
 * WFIGS and friends rename columns between schema revisions, mix casing, and
 * encode "no value" as `null`, `''`, `'null'`, `'Unknown'` or `-1` depending on
 * the column. Reading these tables with `attrs.PercentContained` produces a
 * panel that silently empties out the next time a column is renamed, so every
 * read goes through helpers that accept a list of candidate names and
 * normalize the many spellings of "missing".
 */

export type Attributes = Record<string, unknown>;

/** Values that agency feeds use to mean "not reported". */
const NULLISH_STRINGS = new Set(['', 'null', 'undefined', 'n/a', 'na', 'none', 'unknown', '-']);

function isNullish(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return NULLISH_STRINGS.has(value.trim().toLowerCase());
  return false;
}

/**
 * Build a case-insensitive index of the attribute bag once, so the many
 * `pick()` calls per feature do not each rescan every key.
 */
export function indexAttributes(attrs: Attributes): Map<string, unknown> {
  const index = new Map<string, unknown>();
  for (const [key, value] of Object.entries(attrs)) {
    index.set(key.toLowerCase(), value);
  }
  return index;
}

/** First non-nullish value among the candidate field names. */
export function pick(index: Map<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const value = index.get(name.toLowerCase());
    if (!isNullish(value)) return value;
  }
  return undefined;
}

/** String field, trimmed, or undefined when absent. */
export function pickString(index: Map<string, unknown>, ...names: string[]): string | undefined {
  const value = pick(index, ...names);
  if (value === undefined) return undefined;
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

/**
 * Numeric field. Rejects negative sentinels, which several WFIGS columns use
 * for "unknown" — treating -1 acres as a real value would corrupt sorting and
 * marker sizing.
 */
export function pickNumber(
  index: Map<string, unknown>,
  options: { allowNegative?: boolean } = {},
  ...names: string[]
): number | undefined {
  const value = pick(index, ...names);
  if (value === undefined) return undefined;

  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(num)) return undefined;
  if (!options.allowNegative && num < 0) return undefined;
  return num;
}

/** Convenience wrapper for the common non-negative numeric case. */
export function pickCount(index: Map<string, unknown>, ...names: string[]): number | undefined {
  return pickNumber(index, {}, ...names);
}

/**
 * Boolean field. Agency feeds encode booleans as `true`, `'Y'`, `'Yes'`, `1`
 * and `'true'` interchangeably.
 */
export function pickBoolean(index: Map<string, unknown>, ...names: string[]): boolean | undefined {
  const value = pick(index, ...names);
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const str = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(str)) return true;
  if (['n', 'no', 'false', '0'].includes(str)) return false;
  return undefined;
}

/**
 * Timestamp field to an ISO 8601 string.
 *
 * ArcGIS date columns arrive as epoch milliseconds, but the same logical field
 * can arrive as an ISO string from a different service, so both are handled.
 * Epoch seconds are also accepted and detected by magnitude.
 */
export function pickDate(index: Map<string, unknown>, ...names: string[]): string | undefined {
  const value = pick(index, ...names);
  if (value === undefined) return undefined;

  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(num) || num <= 0) return undefined;
    // Values below ~1e11 are epoch seconds; above are epoch milliseconds.
    const ms = num < 1e11 ? num * 1000 : num;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Percentage field clamped to 0–100. Some records report containment as a
 * fraction (0–1) instead; values in that range with a decimal part are scaled.
 */
export function pickPercent(index: Map<string, unknown>, ...names: string[]): number | undefined {
  const num = pickNumber(index, {}, ...names);
  if (num === undefined) return undefined;
  if (num > 0 && num < 1 && !Number.isInteger(num)) return Math.round(num * 100);
  return Math.min(100, Math.max(0, num));
}
