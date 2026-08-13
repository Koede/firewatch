import { useMemo } from 'react';
import type { FireIncident, FirePerimeter } from '@firewatch/shared';
import {
  acresToSquareMiles,
  formatAbsoluteTime,
  formatAcres,
  formatCauseChain,
  formatCoordinates,
  formatCount,
  formatCurrency,
  formatRelativeTime,
  humanizeLabel,
} from '@firewatch/shared';

/**
 * The detail panel shown when a fire is clicked.
 *
 * Wildfire records are sparse — a fire discovered an hour ago may have a name
 * and nothing else — so every section hides itself when it has no data rather
 * than printing a column of "Not reported". The fields that always matter
 * (size, containment, cause, freshness) stay pinned at the top.
 */

export interface FireDetailPanelProps {
  fire: FireIncident;
  perimeter?: FirePerimeter | undefined;
  onClose: () => void;
  onZoomTo: (fire: FireIncident) => void;
  /** True when this record came from the bundled sample dataset. */
  isSampleData: boolean;
}

/** A labelled value row, rendered only when there is something to show. */
function Row({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value === undefined || value === null || value === '' || value === 'Not reported') return null;
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** A section wrapper that disappears when all of its rows are empty. */
function Section({
  title,
  children,
  hasContent,
}: {
  title: string;
  children: React.ReactNode;
  hasContent: boolean;
}) {
  if (!hasContent) return null;
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

/** Containment shown as a labelled progress bar rather than a bare number. */
function ContainmentBar({ percent }: { percent: number | undefined }) {
  const known = percent !== undefined && Number.isFinite(percent);
  const value = known ? Math.round(percent) : 0;

  return (
    <div className="containment">
      <div className="containment-header">
        <span>Containment</span>
        <strong>{known ? `${value}%` : 'Not reported'}</strong>
      </div>
      <div
        className="containment-track"
        role="progressbar"
        aria-valuenow={known ? value : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Percent contained"
      >
        <div
          className="containment-fill"
          style={{
            width: `${value}%`,
            // Red while uncontrolled, warming to yellow as crews gain ground.
            background:
              value >= 90
                ? 'linear-gradient(90deg, #ffd60a, #a3e635)'
                : value >= 50
                  ? 'linear-gradient(90deg, #ff9500, #ffd60a)'
                  : 'linear-gradient(90deg, #ff3b30, #ff9500)',
          }}
        />
      </div>
    </div>
  );
}

export function FireDetailPanel({
  fire,
  perimeter,
  onClose,
  onZoomTo,
  isSampleData,
}: FireDetailPanelProps) {
  const {
    cause,
    responsibleParties: parties,
    resources,
    impacts,
    location,
    timestamps,
  } = fire;

  /**
   * Resource counts as a list, so the grid can render only what exists.
   * A fire with three engines and nothing else shows one tile, not seven blanks.
   */
  const resourceTiles = useMemo(
    () =>
      [
        { label: 'Total personnel', value: resources.totalPersonnel, emphasis: true },
        { label: 'Crews', value: resources.crews },
        { label: 'Engines', value: resources.engines },
        { label: 'Helicopters', value: resources.helicopters },
        { label: 'Airtankers', value: resources.airtankers },
        { label: 'Dozers', value: resources.dozers },
        { label: 'Water tenders', value: resources.waterTenders },
      ].filter((tile) => tile.value !== undefined && tile.value !== null),
    [resources],
  );

  const hasParties = Boolean(
    parties.jurisdictionalAgency ||
      parties.protectingAgency ||
      parties.landownerCategory ||
      parties.gacc ||
      parties.dispatchCenter ||
      parties.jurisdictionalUnit,
  );

  const hasImpacts = Boolean(
    impacts.structuresDestroyed !== undefined ||
      impacts.structuresThreatened !== undefined ||
      impacts.residencesDestroyed !== undefined ||
      impacts.injuries !== undefined ||
      impacts.fatalities !== undefined ||
      impacts.estimatedCostToDate !== undefined ||
      impacts.evacuationStatus,
  );

  const hasLocation = Boolean(
    location.county || location.state || location.city || location.fuelGroup,
  );

  const acresLabel = formatAcres(fire.acres);
  const squareMiles =
    fire.acres !== undefined && fire.acres >= 640
      ? `${acresToSquareMiles(fire.acres).toFixed(1)} sq mi`
      : null;

  return (
    <aside className="detail-panel" aria-label={`Details for ${fire.name}`}>
      <header className="detail-header">
        <div className="detail-title">
          <div className="detail-eyebrow">
            <span className={`status-dot ${fire.isActive ? 'active' : 'inactive'}`} aria-hidden />
            {fire.isActive ? 'Active incident' : 'No longer active'}
            {fire.incidentType === 'RX' && <span className="chip">Prescribed burn</span>}
          </div>
          <h2>{fire.name}</h2>
          {fire.complexName && <p className="detail-subtitle">Part of the {fire.complexName}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </header>

      {isSampleData && (
        <div className="sample-banner" role="note">
          Sample data — the live incident feed is unreachable, so this is a bundled example.
        </div>
      )}

      <div className="detail-highlights">
        <div className="highlight">
          <span className="highlight-label">Size</span>
          <strong className="highlight-value">{acresLabel}</strong>
          {squareMiles && <span className="highlight-sub">{squareMiles}</span>}
        </div>
        <div className="highlight">
          <span className="highlight-label">Cause</span>
          <strong className="highlight-value cause">
            {formatCauseChain(cause.category, cause.general, cause.specific)}
          </strong>
          {cause.underInvestigation && <span className="highlight-sub">Under investigation</span>}
        </div>
      </div>

      <ContainmentBar percent={fire.percentContained} />

      <div className="detail-actions">
        <button className="button primary" onClick={() => onZoomTo(fire)}>
          Zoom to fire
        </button>
        {fire.inciWebUrl && (
          <a className="button" href={fire.inciWebUrl} target="_blank" rel="noreferrer noopener">
            InciWeb page ↗
          </a>
        )}
      </div>

      <div className="detail-updated">
        Last updated {formatRelativeTime(timestamps.lastUpdated)}
        <span className="detail-updated-abs">{formatAbsoluteTime(timestamps.lastUpdated)}</span>
      </div>

      {fire.shortDescription && <p className="detail-narrative">{fire.shortDescription}</p>}

      <Section title="Fire behavior & fuels" hasContent={Boolean(fire.fireBehavior || location.fuelGroup)}>
        <Row label="Observed behavior" value={fire.fireBehavior} />
        <Row label="Predominant fuel" value={humanizeLabel(location.fuelGroup)} />
        <Row label="Fuel model" value={location.primaryFuelModel} />
        <Row
          label="Growth since initial response"
          value={
            fire.initialResponseAcres !== undefined && fire.acres !== undefined
              ? `${formatAcres(fire.initialResponseAcres)} → ${formatAcres(fire.acres)}`
              : undefined
          }
        />
      </Section>

      <Section title="Assigned resources" hasContent={resourceTiles.length > 0 || Boolean(resources.managementOrganization)}>
        {resources.managementOrganization && (
          <Row label="Managing organization" value={resources.managementOrganization} />
        )}
        {resources.complexityLevel && (
          <Row label="Complexity" value={resources.complexityLevel} />
        )}
        {resourceTiles.length > 0 && (
          <div className="resource-grid">
            {resourceTiles.map((tile) => (
              <div key={tile.label} className={`resource-tile${tile.emphasis ? ' emphasis' : ''}`}>
                <span className="resource-value">{formatCount(tile.value)}</span>
                <span className="resource-label">{tile.label}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Responsible parties" hasContent={hasParties}>
        <Row label="Jurisdictional agency" value={humanizeLabel(parties.jurisdictionalAgency)} />
        <Row label="Jurisdictional unit" value={parties.jurisdictionalUnit} />
        <Row label="Protecting agency" value={humanizeLabel(parties.protectingAgency)} />
        <Row label="Protecting unit" value={parties.protectingUnit} />
        <Row label="Land ownership" value={humanizeLabel(parties.landownerCategory)} />
        <Row label="Coordination center" value={parties.gacc} />
        <Row label="Dispatch center" value={parties.dispatchCenter} />
        <Row label="Command" value={parties.unifiedCommand ? 'Unified command' : undefined} />
        <Row
          label="Jurisdiction"
          value={parties.multiJurisdictional ? 'Multi-jurisdictional' : undefined}
        />
      </Section>

      <Section title="Impacts" hasContent={hasImpacts}>
        <Row label="Evacuations" value={impacts.evacuationStatus} />
        <Row label="Structures destroyed" value={formatCount(impacts.structuresDestroyed)} />
        <Row label="Structures threatened" value={formatCount(impacts.structuresThreatened)} />
        <Row label="Residences destroyed" value={formatCount(impacts.residencesDestroyed)} />
        <Row label="Residences threatened" value={formatCount(impacts.residencesThreatened)} />
        <Row label="Injuries" value={formatCount(impacts.injuries)} />
        <Row label="Fatalities" value={formatCount(impacts.fatalities)} />
        <Row label="Cost to date" value={formatCurrency(impacts.estimatedCostToDate)} />
      </Section>

      <Section title="Location" hasContent={hasLocation}>
        <Row
          label="County"
          value={
            location.county
              ? `${location.county}${location.state ? ` County, ${location.state}` : ''}`
              : location.state
          }
        />
        <Row label="Nearest community" value={location.city} />
        <Row label="Coordinates" value={formatCoordinates(fire.position[0], fire.position[1])} />
        {perimeter?.gisAcres !== undefined && (
          <Row label="Mapped perimeter" value={formatAcres(perimeter.gisAcres)} />
        )}
      </Section>

      <Section
        title="Timeline"
        hasContent={Boolean(timestamps.discovered || timestamps.contained || timestamps.out)}
      >
        <Row label="Discovered" value={formatAbsoluteTime(timestamps.discovered)} />
        <Row label="Contained" value={formatAbsoluteTime(timestamps.contained)} />
        <Row label="Controlled" value={formatAbsoluteTime(timestamps.controlled)} />
        <Row label="Declared out" value={formatAbsoluteTime(timestamps.out)} />
      </Section>

      <Section title="Record" hasContent={Boolean(fire.uniqueFireId || fire.irwinId)}>
        <Row label="Fire ID" value={fire.uniqueFireId} />
        <Row label="IRWIN ID" value={fire.irwinId} />
        <Row label="Incident type" value={fire.incidentTypeRaw} />
      </Section>

      <footer className="detail-footer">
        Incident data from the National Interagency Fire Center (WFIGS). Figures are reported by the
        managing agency and can lag the fire on the ground.
      </footer>
    </aside>
  );
}
