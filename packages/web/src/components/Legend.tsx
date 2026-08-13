import { AQI_CATEGORIES, ALERT_COLORS, SMOKE_STYLE } from '@firewatch/shared';
import type { LayerVisibility } from '../map/layerCatalog';

/**
 * A legend that shows only what is currently on the map.
 *
 * A static legend listing every possible symbol is noise; this one reacts to
 * layer visibility so the reader only decodes symbols they can actually see.
 */

export interface LegendProps {
  visibility: LayerVisibility;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Legend({ visibility, collapsed, onToggleCollapsed }: LegendProps) {
  const showFires = visibility.fires;
  const showSmoke = visibility.smoke;
  const showAqi = visibility.airQualityStations || visibility.airQualityContours;
  const showAlerts = visibility.heatAdvisories || visibility.fireDanger;
  const showDetections = visibility.detections;

  const hasAnything = showFires || showSmoke || showAqi || showAlerts || showDetections;
  if (!hasAnything) return null;

  return (
    <div className={`legend${collapsed ? ' collapsed' : ''}`} aria-label="Map legend">
      <button className="legend-toggle" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
        <span>Legend</span>
        <span aria-hidden>{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="legend-body">
          {showFires && (
            <section>
              <h4>Incidents</h4>
              <p className="legend-hint">Marker size is fire size; color is containment.</p>
              <div className="legend-ramp">
                <span className="ramp-swatch" style={{ background: '#ff3b30' }} />
                <span className="ramp-swatch" style={{ background: '#ff9500' }} />
                <span className="ramp-swatch" style={{ background: '#ffd60a' }} />
              </div>
              <div className="legend-ramp-labels">
                <span>0% contained</span>
                <span>100%</span>
              </div>
            </section>
          )}

          {showDetections && (
            <section>
              <h4>Satellite hotspots</h4>
              <div className="legend-ramp">
                <span className="ramp-swatch" style={{ background: '#ffd166' }} />
                <span className="ramp-swatch" style={{ background: '#ff8c00' }} />
                <span className="ramp-swatch" style={{ background: '#ff2d00' }} />
              </div>
              <div className="legend-ramp-labels">
                <span>Low intensity</span>
                <span>High</span>
              </div>
            </section>
          )}

          {showSmoke && (
            <section>
              <h4>Smoke density</h4>
              {(['light', 'medium', 'heavy'] as const).map((density) => (
                <div key={density} className="legend-item">
                  <span
                    className="legend-swatch"
                    style={{
                      background: SMOKE_STYLE[density].color,
                      opacity: Math.max(0.4, SMOKE_STYLE[density].opacity + 0.25),
                    }}
                  />
                  {SMOKE_STYLE[density].label}
                </div>
              ))}
            </section>
          )}

          {showAqi && (
            <section>
              <h4>Air quality index</h4>
              {AQI_CATEGORIES.map((category) => (
                <div key={category.category} className="legend-item" title={category.guidance}>
                  <span className="legend-swatch" style={{ background: category.color }} />
                  <span className="legend-item-text">
                    {category.label}
                    <span className="legend-range">
                      {category.range[0]}–{category.range[1]}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}

          {showAlerts && (
            <section>
              <h4>Weather hazards</h4>
              {visibility.fireDanger &&
                ['Red Flag Warning', 'Fire Weather Watch'].map((event) => (
                  <div key={event} className="legend-item">
                    <span className="legend-swatch" style={{ background: ALERT_COLORS[event] }} />
                    {event}
                  </div>
                ))}
              {visibility.heatAdvisories &&
                ['Extreme Heat Warning', 'Extreme Heat Watch', 'Heat Advisory'].map((event) => (
                  <div key={event} className="legend-item">
                    <span className="legend-swatch" style={{ background: ALERT_COLORS[event] }} />
                    {event}
                  </div>
                ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
