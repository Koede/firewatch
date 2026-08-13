import { useState } from 'react';
import type { SourceHealth } from '@firewatch/shared';
import { formatRelativeTime } from '@firewatch/shared';

/**
 * Data freshness and feed status.
 *
 * The single most important thing to communicate on a live hazard map is how
 * old the data is. This sits in the header, always visible, and expands into a
 * per-source breakdown when something is wrong.
 */

export interface StatusBarProps {
  health: Record<string, SourceHealth>;
  lastRefreshedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<SourceHealth['status'], string> = {
  ok: 'Live',
  stale: 'Stale',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  disabled: 'Off',
};

export function StatusBar({ health, lastRefreshedAt, refreshing, onRefresh }: StatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  const sources = Object.values(health);
  const problems = sources.filter((s) => s.status === 'unavailable' || s.status === 'degraded');
  const stale = sources.filter((s) => s.status === 'stale');
  const usingFallback = sources.some((s) => s.usingFallback);

  const overall: SourceHealth['status'] =
    problems.length > 0 ? 'degraded' : stale.length > 0 ? 'stale' : 'ok';

  return (
    <div className="status-bar">
      <button
        className={`status-summary ${overall}`}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={`status-dot ${overall}`} aria-hidden />
        <span className="status-text">
          {usingFallback
            ? 'Showing sample data'
            : problems.length > 0
              ? `${problems.length} feed${problems.length === 1 ? '' : 's'} degraded`
              : 'All feeds live'}
        </span>
        <span className="status-time">
          {refreshing ? 'Refreshing…' : `Updated ${formatRelativeTime(lastRefreshedAt?.toISOString())}`}
        </span>
      </button>

      <button
        className="icon-button refresh"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh data now"
        title="Refresh data now"
      >
        ⟳
      </button>

      {expanded && (
        <div className="status-detail" role="region" aria-label="Data source status">
          {sources.length === 0 && <p className="status-empty">Checking feeds…</p>}
          {sources.map((source) => (
            <div key={source.id} className="status-source">
              <div className="status-source-head">
                <span className={`status-dot ${source.status}`} aria-hidden />
                <span className="status-source-label">{source.label}</span>
                <span className={`status-badge ${source.status}`}>
                  {STATUS_LABELS[source.status]}
                </span>
              </div>
              <div className="status-source-meta">
                {source.featureCount !== undefined && (
                  <span>{source.featureCount.toLocaleString()} records</span>
                )}
                {source.lastSuccessAt && <span>{formatRelativeTime(source.lastSuccessAt)}</span>}
                <span className="status-attribution">{source.attribution}</span>
              </div>
              {source.error && <p className="status-error">{source.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
