import type { SourceHealth } from '@firewatch/shared';
import { BASEMAPS, type BasemapId } from '../map/basemaps';
import {
  LAYERS,
  LAYER_GROUPS,
  type LayerDefinition,
  type LayerId,
  type LayerOpacity,
  type LayerVisibility,
} from '../map/layerCatalog';

/**
 * The layer switcher: basemap selection plus every overlay, grouped.
 *
 * Each row carries its own health indicator. On a map where a missing layer can
 * mean "nothing is burning here", silently rendering an empty overlay is worse
 * than useless, so a failed or key-gated feed says so on the control itself.
 */

export interface LayerPanelProps {
  basemap: BasemapId;
  visibility: LayerVisibility;
  opacity: LayerOpacity;
  health: Record<string, SourceHealth>;
  onBasemapChange: (id: BasemapId) => void;
  onToggleLayer: (id: LayerId) => void;
  onOpacityChange: (id: LayerId, value: number) => void;
  onClose: () => void;
}

/** Short status text for a layer, or null when the feed is healthy. */
function healthNote(layer: LayerDefinition, health: Record<string, SourceHealth>): string | null {
  if (!layer.sourceId) return null;
  const entry = health[layer.sourceId];
  if (!entry) return null;

  switch (entry.status) {
    case 'disabled':
      return layer.requiresApiKey ? `Needs ${layer.requiresApiKey}` : 'Disabled';
    case 'unavailable':
      return 'Feed unavailable';
    case 'degraded':
      return entry.usingFallback ? 'Showing sample data' : 'Degraded';
    case 'stale':
      return 'Data may be stale';
    default:
      return null;
  }
}

function LayerRow({
  layer,
  visible,
  opacity,
  note,
  onToggle,
  onOpacityChange,
}: {
  layer: LayerDefinition;
  visible: boolean;
  opacity: number;
  note: string | null;
  onToggle: () => void;
  onOpacityChange: (value: number) => void;
}) {
  return (
    <div className={`layer-row${visible ? ' active' : ''}`}>
      <label className="layer-toggle">
        <input type="checkbox" checked={visible} onChange={onToggle} />
        <span className="layer-text">
          <span className="layer-label">
            {layer.label}
            {note && <span className="layer-note">{note}</span>}
          </span>
          <span className="layer-description">{layer.description}</span>
        </span>
      </label>

      {layer.adjustableOpacity && visible && (
        <div className="opacity-control">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(event) => onOpacityChange(Number(event.target.value) / 100)}
            aria-label={`${layer.label} opacity`}
          />
          <span className="opacity-value">{Math.round(opacity * 100)}%</span>
        </div>
      )}
    </div>
  );
}

export function LayerPanel({
  basemap,
  visibility,
  opacity,
  health,
  onBasemapChange,
  onToggleLayer,
  onOpacityChange,
  onClose,
}: LayerPanelProps) {
  return (
    <div className="layer-panel" role="region" aria-label="Map layers">
      <header className="panel-header">
        <h2>Layers</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close layers panel">
          ✕
        </button>
      </header>

      <section className="basemap-section">
        <h3>Base map</h3>
        <div className="basemap-grid">
          {Object.values(BASEMAPS).map((option) => (
            <button
              key={option.id}
              className={`basemap-option${basemap === option.id ? ' selected' : ''}`}
              onClick={() => onBasemapChange(option.id)}
              title={option.description}
              aria-pressed={basemap === option.id}
            >
              <span className={`basemap-swatch ${option.id}`} aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {LAYER_GROUPS.map((group) => {
        const layers = LAYERS.filter((layer) => layer.group === group.id);
        if (layers.length === 0) return null;

        return (
          <section key={group.id} className="layer-group">
            <h3>{group.label}</h3>
            <p className="group-description">{group.description}</p>
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                visible={visibility[layer.id]}
                opacity={opacity[layer.id] ?? layer.defaultOpacity ?? 1}
                note={healthNote(layer, health)}
                onToggle={() => onToggleLayer(layer.id)}
                onOpacityChange={(value) => onOpacityChange(layer.id, value)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
