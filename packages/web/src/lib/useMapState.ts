import { useCallback, useEffect, useRef, useState } from 'react';
import type { BasemapId } from '../map/basemaps';
import { DEFAULT_BASEMAP } from '../map/basemaps';
import {
  LAYERS,
  defaultOpacity,
  defaultVisibility,
  type LayerId,
  type LayerOpacity,
  type LayerVisibility,
} from '../map/layerCatalog';

/**
 * Map view state, mirrored into the URL so any view is shareable.
 *
 * A link to a specific fire with a specific set of layers is the thing people
 * actually send each other during an incident — "look at the smoke over here" —
 * so position, basemap, active layers and selection all round-trip.
 */

export interface MapPosition {
  lng: number;
  lat: number;
  zoom: number;
}

export interface MapState {
  position: MapPosition;
  basemap: BasemapId;
  visibility: LayerVisibility;
  opacity: LayerOpacity;
  selectedFireId: string | null;
}

/** Continental US, the default view. */
const DEFAULT_POSITION: MapPosition = { lng: -98.5, lat: 39.5, zoom: 4 };

const LAYER_IDS = new Set(LAYERS.map((l) => l.id as string));

/** Read state from the URL hash, falling back to defaults for anything absent. */
function readFromHash(): MapState {
  const state: MapState = {
    position: { ...DEFAULT_POSITION },
    basemap: DEFAULT_BASEMAP,
    visibility: defaultVisibility(),
    opacity: defaultOpacity(),
    selectedFireId: null,
  };

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return state;

  const params = new URLSearchParams(hash);

  const at = params.get('at');
  if (at) {
    const [lat, lng, zoom] = at.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      state.position = {
        lat: lat!,
        lng: lng!,
        zoom: Number.isFinite(zoom) ? zoom! : DEFAULT_POSITION.zoom,
      };
    }
  }

  const basemap = params.get('basemap');
  if (basemap && ['streets', 'satellite', 'terrain', 'dark'].includes(basemap)) {
    state.basemap = basemap as BasemapId;
  }

  // `layers` is an explicit allowlist: anything absent is off. This makes a
  // shared link reproduce exactly what the sender saw, defaults included.
  const layers = params.get('layers');
  if (layers !== null) {
    const enabled = new Set(layers.split(',').filter((id) => LAYER_IDS.has(id)));
    for (const layer of LAYERS) {
      state.visibility[layer.id] = enabled.has(layer.id);
    }
  }

  const fire = params.get('fire');
  if (fire) state.selectedFireId = fire;

  return state;
}

/** Serialize state back into a compact hash. */
function writeToHash(state: MapState): void {
  const params = new URLSearchParams();

  const { lat, lng, zoom } = state.position;
  params.set('at', `${lat.toFixed(4)},${lng.toFixed(4)},${zoom.toFixed(1)}`);
  params.set('basemap', state.basemap);

  const visible = LAYERS.filter((l) => state.visibility[l.id]).map((l) => l.id);
  params.set('layers', visible.join(','));

  if (state.selectedFireId) params.set('fire', state.selectedFireId);

  const next = `#${params.toString()}`;
  if (next !== window.location.hash) {
    window.history.replaceState(null, '', next);
  }
}

export function useMapState() {
  const [state, setState] = useState<MapState>(readFromHash);

  // Debounce hash writes: map movement fires continuously while panning, and
  // a history write per frame makes the map stutter.
  const writeTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => writeToHash(state), 250);
    return () => window.clearTimeout(writeTimer.current);
  }, [state]);

  const setPosition = useCallback((position: MapPosition) => {
    setState((current) => ({ ...current, position }));
  }, []);

  const setBasemap = useCallback((basemap: BasemapId) => {
    setState((current) => ({ ...current, basemap }));
  }, []);

  const setSelectedFireId = useCallback((selectedFireId: string | null) => {
    setState((current) => ({ ...current, selectedFireId }));
  }, []);

  /**
   * Toggle a layer. Turning on an exclusive imagery layer switches the others
   * in its group off, since two global composites just occlude each other.
   */
  const toggleLayer = useCallback((id: LayerId) => {
    setState((current) => {
      const definition = LAYERS.find((l) => l.id === id);
      const nextValue = !current.visibility[id];
      const visibility = { ...current.visibility, [id]: nextValue };

      if (nextValue && definition?.exclusiveWithinGroup) {
        for (const other of LAYERS) {
          if (other.id !== id && other.group === definition.group && other.exclusiveWithinGroup) {
            visibility[other.id] = false;
          }
        }
      }

      return { ...current, visibility };
    });
  }, []);

  const setLayerOpacity = useCallback((id: LayerId, value: number) => {
    setState((current) => ({
      ...current,
      opacity: { ...current.opacity, [id]: Math.min(1, Math.max(0, value)) },
    }));
  }, []);

  return {
    state,
    setPosition,
    setBasemap,
    toggleLayer,
    setLayerOpacity,
    setSelectedFireId,
  };
}
