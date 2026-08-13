/**
 * Display formatting shared by the map, the incident list and the detail panel,
 * so a value like acreage looks identical everywhere it appears.
 */

/** Format acreage with thousands separators, e.g. `12,480 acres`. */
export function formatAcres(acres: number | undefined | null): string {
  if (acres == null || !Number.isFinite(acres)) return 'Not reported';
  if (acres < 1) return '< 1 acre';
  const rounded = acres < 10 ? Math.round(acres * 10) / 10 : Math.round(acres);
  return `${rounded.toLocaleString('en-US')} acre${rounded === 1 ? '' : 's'}`;
}

/** Acres to square miles, shown alongside large fires for a sense of scale. */
export function acresToSquareMiles(acres: number): number {
  return acres / 640;
}

/** Format containment as a percentage, distinguishing 0% from "not reported". */
export function formatContainment(percent: number | undefined | null): string {
  if (percent == null || !Number.isFinite(percent)) return 'Not reported';
  return `${Math.round(percent)}% contained`;
}

/** Format USD without cents, e.g. `$4.2M`. */
export function formatCurrency(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return 'Not reported';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** Integer counts with a fallback for missing values. */
export function formatCount(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Relative time such as `12 minutes ago`. Wildfire feeds update on wildly
 * different cadences, so freshness is shown relatively rather than absolutely.
 */
export function formatRelativeTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return 'Unknown';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'Unknown';

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  return `${Math.round(months / 12)} year${Math.round(months / 12) === 1 ? '' : 's'} ago`;
}

/** Absolute timestamp in the viewer's local timezone, e.g. `Aug 13, 2026, 2:14 PM`. */
export function formatAbsoluteTime(iso: string | undefined | null): string {
  if (!iso) return 'Not reported';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Coordinates in the degrees-with-hemisphere form used on incident reports. */
export function formatCoordinates(lng: number, lat: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/**
 * Join the three WFIGS cause levels into one readable phrase, dropping repeats.
 * `Human · Equipment and vehicle use · Vehicle` reads better than three rows.
 */
export function formatCauseChain(
  category?: string,
  general?: string,
  specific?: string,
): string {
  const parts = [category, general, specific]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p) && p!.toLowerCase() !== 'null');

  const deduped: string[] = [];
  for (const part of parts) {
    if (!deduped.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      deduped.push(part);
    }
  }
  return deduped.length > 0 ? deduped.join(' · ') : 'Under investigation';
}

/** Title-case an agency code or SCREAMING_CASE label for display. */
export function humanizeLabel(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  // Preserve acronyms like USFS, BLM, CAL FIRE, NPS.
  if (/^[A-Z0-9\s-]+$/.test(trimmed) && trimmed.length <= 12) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
