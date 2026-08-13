import { useMemo, useState } from 'react';
import type { FireIncident } from '@firewatch/shared';
import { formatAcres, formatRelativeTime } from '@firewatch/shared';

/**
 * The searchable incident sidebar.
 *
 * Panning a national map hunting for a named fire is painful, so this is the
 * text-first way in: type a name, county or state and jump straight to it.
 * Sorting defaults to largest-first because that is the question people
 * usually arrive with.
 */

export interface IncidentListProps {
  fires: FireIncident[];
  selectedFireId: string | null;
  onSelect: (fire: FireIncident) => void;
  /** True when the incident feed is serving bundled sample data. */
  isSampleData: boolean;
  loading: boolean;
}

type SortKey = 'size' | 'containment' | 'updated' | 'name';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'size', label: 'Largest' },
  { key: 'containment', label: 'Least contained' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'name', label: 'Name' },
];

export function IncidentList({
  fires,
  selectedFireId,
  onSelect,
  isSampleData,
  loading,
}: IncidentListProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('size');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = needle
      ? fires.filter((fire) =>
          [fire.name, fire.location.county, fire.location.state, fire.location.city]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(needle)),
        )
      : [...fires];

    switch (sortKey) {
      case 'containment':
        // Unknown containment sorts with the least-contained: it is not evidence
        // of progress, and burying it would hide fires that need attention.
        return matches.sort((a, b) => (a.percentContained ?? -1) - (b.percentContained ?? -1));
      case 'updated':
        return matches.sort(
          (a, b) =>
            Date.parse(b.timestamps.lastUpdated ?? '0') - Date.parse(a.timestamps.lastUpdated ?? '0'),
        );
      case 'name':
        return matches.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return matches.sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
    }
  }, [fires, query, sortKey]);

  return (
    <div className="incident-list" role="region" aria-label="Incident list">
      <div className="incident-search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search fires, counties, states"
          aria-label="Search incidents"
        />
      </div>

      <div className="incident-sorts" role="group" aria-label="Sort incidents">
        {SORTS.map((sort) => (
          <button
            key={sort.key}
            className={`sort-chip${sortKey === sort.key ? ' active' : ''}`}
            onClick={() => setSortKey(sort.key)}
            aria-pressed={sortKey === sort.key}
          >
            {sort.label}
          </button>
        ))}
      </div>

      <div className="incident-count">
        {loading
          ? 'Loading incidents…'
          : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'incident' : 'incidents'}`}
        {isSampleData && <span className="sample-tag">sample data</span>}
      </div>

      <ul className="incident-items">
        {filtered.map((fire) => {
          const contained = fire.percentContained;
          return (
            <li key={fire.id}>
              <button
                className={`incident-item${selectedFireId === fire.id ? ' selected' : ''}`}
                onClick={() => onSelect(fire)}
              >
                <span className="incident-name">{fire.name}</span>
                <span className="incident-meta">
                  <span className="incident-acres">{formatAcres(fire.acres)}</span>
                  {contained !== undefined && (
                    <span className="incident-contained">{Math.round(contained)}% contained</span>
                  )}
                </span>
                <span className="incident-sub">
                  {[fire.location.county, fire.location.state].filter(Boolean).join(', ')}
                  {fire.timestamps.lastUpdated && (
                    <span className="incident-updated">
                      {formatRelativeTime(fire.timestamps.lastUpdated)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}

        {!loading && filtered.length === 0 && (
          <li className="incident-empty">
            {query
              ? `No incidents match “${query}”.`
              : 'No active incidents in the current feed.'}
          </li>
        )}
      </ul>
    </div>
  );
}
