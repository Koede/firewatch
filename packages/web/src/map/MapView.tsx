import { useCallback, useEffect, useRef } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import type {
  AirQualityObservation,
  FireDetection,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  WeatherAlert,
} from '@firewatch/shared';
import { ALERT_COLORS, SMOKE_STYLE } from '@firewatch/shared';
import {
  AIRNOW_CONTOUR_TILES,
  BASEMAPS,
  GIBS_LAYERS,
  gibsDate,
  gibsTileUrl,
  type BasemapId,
} from './basemaps';
import type { LayerId, LayerOpacity, LayerVisibility } from './layerCatalog';
import {
  airQualityToGeoJson,
  alertsToGeoJson,
  detectionsToGeoJson,
  firesToGeoJson,
  hashId,
  perimetersToGeoJson,
  smokeToGeoJson,
} from './geojson';
import type { MapPosition } from '../lib/useMapState';

/**
 * The map surface.
 *
 * MapLibre owns imperative state that React should not try to re-render, so the
 * map instance lives in a ref and prop changes are pushed into it through
 * targeted effects — updating a GeoJSON source's data or a layer's paint
 * property, never tearing down and rebuilding the map.
 */

export interface MapViewProps {
  position: MapPosition;
  basemap: BasemapId;
  visibility: LayerVisibility;
  opacity: LayerOpacity;
  fires: FireIncident[];
  perimeters: FirePerimeter[];
  smoke: SmokePlume[];
  heatAlerts: WeatherAlert[];
  fireAlerts: WeatherAlert[];
  airQuality: AirQualityObservation[];
  detections: FireDetection[];
  selectedFireId: string | null;
  onSelectFire: (id: string | null) => void;
  onPositionChange: (position: MapPosition) => void;
  onMapReady?: (map: MapLibreMap) => void;
}

/** Source ids, kept in one place so effects and layer definitions agree. */
const SRC = {
  fires: 'firewatch-fires',
  perimeters: 'firewatch-perimeters',
  smoke: 'firewatch-smoke',
  heat: 'firewatch-heat-alerts',
  fireDanger: 'firewatch-fire-alerts',
  airQuality: 'firewatch-air-quality',
  detections: 'firewatch-detections',
  aqiContours: 'firewatch-aqi-contours',
  gibs: 'firewatch-gibs',
} as const;

/** Which imagery layer each catalog id maps to. */
const GIBS_BY_LAYER: Partial<Record<LayerId, keyof typeof GIBS_LAYERS>> = {
  gibsFireBands721: 'fireBands721',
  gibsTrueColor: 'trueColor',
  gibsThermalAnomalies: 'thermalAnomalies',
  gibsAerosolDepth: 'aerosolDepth',
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Build a `match` expression that colors a feature by its `event` property.
 *
 * MapLibre types `match` as a fixed-arity tuple, which a spread of
 * `Object.entries` cannot satisfy structurally even though the runtime shape is
 * correct. The array is assembled here and asserted once, rather than casting at
 * each of the four call sites.
 */
function eventColorExpression(fallback: string): ExpressionSpecification {
  const pairs = Object.entries(ALERT_COLORS).flatMap(([event, color]) => [event, color]);
  return ['match', ['get', 'event'], ...pairs, fallback] as unknown as ExpressionSpecification;
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const hoveredRef = useRef<number | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Callbacks change identity on every render; a ref keeps the map's event
  // handlers pointing at the current ones without rebinding them each time.
  const handlersRef = useRef({
    onSelectFire: props.onSelectFire,
    onPositionChange: props.onPositionChange,
  });
  handlersRef.current = {
    onSelectFire: props.onSelectFire,
    onPositionChange: props.onPositionChange,
  };

  /** Add every source and layer once the style has loaded. */
  const installLayers = useCallback((map: MapLibreMap) => {
    // --- Raster overlays --------------------------------------------------
    // Imagery sits directly above the basemap so vector overlays stay readable.
    if (!map.getSource(SRC.gibs)) {
      map.addSource(SRC.gibs, {
        type: 'raster',
        tiles: [gibsTileUrl(GIBS_LAYERS.fireBands721!, gibsDate())],
        tileSize: 256,
        maxzoom: GIBS_LAYERS.fireBands721!.maxNativeZoom,
        attribution: 'NASA EOSDIS GIBS',
      });
      map.addLayer({
        id: 'gibs-imagery',
        type: 'raster',
        source: SRC.gibs,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85 },
      });
    }

    if (!map.getSource(SRC.aqiContours)) {
      map.addSource(SRC.aqiContours, {
        type: 'raster',
        tiles: [AIRNOW_CONTOUR_TILES],
        tileSize: 256,
        maxzoom: 10,
        attribution: 'U.S. EPA AirNow',
      });
      map.addLayer({
        id: 'aqi-contours',
        type: 'raster',
        source: SRC.aqiContours,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.6 },
      });
    }

    // --- Weather alerts ---------------------------------------------------
    // Drawn low in the stack: they are broad area washes and would otherwise
    // bury the fires and smoke that sit on top of them.
    for (const [sourceId, layerPrefix] of [
      [SRC.heat, 'heat'],
      [SRC.fireDanger, 'fire-danger'],
    ] as const) {
      if (map.getSource(sourceId)) continue;
      map.addSource(sourceId, { type: 'geojson', data: EMPTY_FC });

      map.addLayer({
        id: `${layerPrefix}-fill`,
        type: 'fill',
        source: sourceId,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': eventColorExpression('#9aa0a6'),
          'fill-opacity': 0.35,
        },
      });

      map.addLayer({
        id: `${layerPrefix}-outline`,
        type: 'line',
        source: sourceId,
        layout: { visibility: 'none' },
        paint: {
          'line-color': eventColorExpression('#9aa0a6'),
          'line-width': 1.2,
          'line-opacity': 0.9,
        },
      });
    }

    // --- Smoke ------------------------------------------------------------
    if (!map.getSource(SRC.smoke)) {
      map.addSource(SRC.smoke, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'smoke-fill',
        type: 'fill',
        source: SRC.smoke,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'match',
            ['get', 'density'],
            'heavy', SMOKE_STYLE.heavy.color,
            'medium', SMOKE_STYLE.medium.color,
            SMOKE_STYLE.light.color,
          ],
          'fill-opacity': [
            'match',
            ['get', 'density'],
            'heavy', SMOKE_STYLE.heavy.opacity,
            'medium', SMOKE_STYLE.medium.opacity,
            SMOKE_STYLE.light.opacity,
          ],
        },
      });
      map.addLayer({
        id: 'smoke-outline',
        type: 'line',
        source: SRC.smoke,
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#e8e0d4',
          'line-width': 0.6,
          'line-opacity': 0.35,
        },
      });
    }

    // --- Fire perimeters --------------------------------------------------
    if (!map.getSource(SRC.perimeters)) {
      map.addSource(SRC.perimeters, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'perimeter-fill',
        type: 'fill',
        source: SRC.perimeters,
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#ff4d1c', 'fill-opacity': 0.28 },
      });
      map.addLayer({
        id: 'perimeter-outline',
        type: 'line',
        source: SRC.perimeters,
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ff6b35', 'line-width': 1.8, 'line-opacity': 0.95 },
      });
    }

    // --- Satellite hotspots ----------------------------------------------
    if (!map.getSource(SRC.detections)) {
      map.addSource(SRC.detections, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'detections-heat',
        type: 'heatmap',
        source: SRC.detections,
        layout: { visibility: 'none' },
        maxzoom: 9,
        paint: {
          // Weight by fire radiative power so intense clusters dominate.
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0.1, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(120,20,0,0.5)',
            0.4, 'rgba(220,70,0,0.7)',
            0.6, 'rgba(255,140,0,0.85)',
            1, 'rgba(255,235,160,0.95)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 9, 24],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.9, 9, 0.4],
        },
      });
      map.addLayer({
        id: 'detections-point',
        type: 'circle',
        source: SRC.detections,
        layout: { visibility: 'none' },
        minzoom: 7,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2, 14, 6],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'frp'],
            0, '#ffd166',
            50, '#ff8c00',
            200, '#ff2d00',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
        },
      });
    }

    // --- Air quality stations --------------------------------------------
    if (!map.getSource(SRC.airQuality)) {
      map.addSource(SRC.airQuality, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'aqi-halo',
        type: 'circle',
        source: SRC.airQuality,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 9, 10, 18],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.22,
          'circle-blur': 0.6,
        },
      });
      map.addLayer({
        id: 'aqi-point',
        type: 'circle',
        source: SRC.airQuality,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 11],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.4,
          'circle-stroke-color': 'rgba(10,12,15,0.85)',
        },
      });
    }

    // --- Fire incidents (top of the stack, they are the clickable layer) ---
    if (!map.getSource(SRC.fires)) {
      map.addSource(SRC.fires, { type: 'geojson', data: EMPTY_FC });

      // A soft glow under each marker so fires stay findable over bright imagery.
      map.addLayer({
        id: 'fire-glow',
        type: 'circle',
        source: SRC.fires,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, ['+', 6, ['*', 3, ['get', 'sizeClass']]],
            10, ['+', 14, ['*', 7, ['get', 'sizeClass']]],
          ],
          'circle-color': '#ff5a1f',
          'circle-opacity': 0.2,
          'circle-blur': 0.8,
        },
      });

      map.addLayer({
        id: 'fire-point',
        type: 'circle',
        source: SRC.fires,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, ['+', 4, ['*', 1.6, ['get', 'sizeClass']]],
            10, ['+', 8, ['*', 3.5, ['get', 'sizeClass']]],
          ],
          // Containment reads as color: red is uncontrolled, amber is progress.
          'circle-color': [
            'case',
            ['<', ['get', 'percentContained'], 0], '#ff3b30',
            ['interpolate', ['linear'], ['get', 'percentContained'],
              0, '#ff3b30',
              50, '#ff9500',
              100, '#ffd60a',
            ],
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            ['boolean', ['feature-state', 'hover'], false], '#ffe8d6',
            'rgba(20,10,5,0.75)',
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 3,
            ['boolean', ['feature-state', 'hover'], false], 2,
            1,
          ],
          'circle-opacity': 0.95,
        },
      });
    }
  }, []);

  // --- Map construction ---------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAPS[props.basemap].style,
      center: [props.position.lng, props.position.lat],
      zoom: props.position.zoom,
      attributionControl: false,
      maxZoom: 18,
      // Fires are read off terrain shape; a little pitch capability helps.
      maxPitch: 60,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'bottom-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left',
    );

    map.on('load', () => {
      installLayers(map);
      readyRef.current = true;
      props.onMapReady?.(map);
    });

    // Report view changes only when the user finishes, not on every frame.
    map.on('moveend', () => {
      const center = map.getCenter();
      handlersRef.current.onPositionChange({
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
      });
    });

    // --- Interaction ------------------------------------------------------
    map.on('click', 'fire-point', (event) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id === 'string') handlersRef.current.onSelectFire(id);
    });

    // Clicking empty map dismisses the panel, matching Google Maps' behavior.
    map.on('click', (event) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ['fire-point'] });
      if (hits.length === 0) handlersRef.current.onSelectFire(null);
    });

    map.on('mousemove', 'fire-point', (event) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = event.features?.[0];
      if (feature?.id === undefined) return;

      if (hoveredRef.current !== null && hoveredRef.current !== feature.id) {
        map.setFeatureState({ source: SRC.fires, id: hoveredRef.current }, { hover: false });
      }
      hoveredRef.current = feature.id as number;
      map.setFeatureState({ source: SRC.fires, id: feature.id }, { hover: true });
    });

    map.on('mouseleave', 'fire-point', () => {
      map.getCanvas().style.cursor = '';
      if (hoveredRef.current !== null) {
        map.setFeatureState({ source: SRC.fires, id: hoveredRef.current }, { hover: false });
        hoveredRef.current = null;
      }
    });

    // Non-fire layers get lightweight popups rather than the full side panel.
    const popupLayers: Array<{ layer: string; render: (p: Record<string, unknown>) => string }> = [
      {
        layer: 'aqi-point',
        render: (p) =>
          `<strong>${escapeHtml(String(p.areaName ?? 'Monitoring station'))}</strong>` +
          `<div class="popup-metric" style="color:${escapeHtml(String(p.color))}">AQI ${escapeHtml(String(p.label))}</div>` +
          `<div class="popup-sub">${escapeHtml(String(p.parameter ?? ''))}</div>`,
      },
      {
        layer: 'smoke-fill',
        render: (p) =>
          `<strong>${escapeHtml(String(p.density ?? 'Smoke'))} smoke</strong>` +
          (p.pm25 ? `<div class="popup-sub">~${escapeHtml(String(p.pm25))} µg/m³ PM2.5</div>` : '') +
          (p.satellite ? `<div class="popup-sub">${escapeHtml(String(p.satellite))}</div>` : ''),
      },
      {
        layer: 'heat-fill',
        render: (p) =>
          `<strong>${escapeHtml(String(p.event ?? 'Alert'))}</strong>` +
          `<div class="popup-sub">${escapeHtml(String(p.areaDescription ?? ''))}</div>`,
      },
      {
        layer: 'fire-danger-fill',
        render: (p) =>
          `<strong>${escapeHtml(String(p.event ?? 'Alert'))}</strong>` +
          `<div class="popup-sub">${escapeHtml(String(p.areaDescription ?? ''))}</div>`,
      },
    ];

    for (const { layer, render } of popupLayers) {
      map.on('click', layer, (event) => {
        // The fire layer wins any overlapping click; it is the primary object.
        if (map.queryRenderedFeatures(event.point, { layers: ['fire-point'] }).length > 0) return;
        const feature = event.features?.[0];
        if (!feature) return;

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, className: 'firewatch-popup' })
          .setLngLat(event.lngLat)
          .setHTML(render(feature.properties ?? {}))
          .addTo(map);
      });
    }

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // Constructed once. Prop changes are pushed in by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Basemap switching --------------------------------------------------
  // setStyle wipes all custom sources and layers, so they are reinstalled and
  // repopulated once the new style settles.
  const basemap = props.basemap;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    map.setStyle(BASEMAPS[basemap].style);
    map.once('styledata', () => {
      installLayers(map);
      readyRef.current = true;
    });
  }, [basemap, installLayers]);

  // --- Data plumbing ------------------------------------------------------
  const setData = useCallback((sourceId: string, data: GeoJSON.FeatureCollection) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, []);

  useEffect(() => {
    setData(SRC.fires, firesToGeoJson(props.fires));
  }, [props.fires, setData, basemap]);

  useEffect(() => {
    setData(SRC.perimeters, perimetersToGeoJson(props.perimeters));
  }, [props.perimeters, setData, basemap]);

  useEffect(() => {
    setData(SRC.smoke, smokeToGeoJson(props.smoke));
  }, [props.smoke, setData, basemap]);

  useEffect(() => {
    setData(SRC.heat, alertsToGeoJson(props.heatAlerts));
  }, [props.heatAlerts, setData, basemap]);

  useEffect(() => {
    setData(SRC.fireDanger, alertsToGeoJson(props.fireAlerts));
  }, [props.fireAlerts, setData, basemap]);

  useEffect(() => {
    setData(SRC.airQuality, airQualityToGeoJson(props.airQuality));
  }, [props.airQuality, setData, basemap]);

  useEffect(() => {
    setData(SRC.detections, detectionsToGeoJson(props.detections));
  }, [props.detections, setData, basemap]);

  // --- Visibility and opacity --------------------------------------------
  const { visibility, opacity } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    /** Set a layer's visibility, tolerating a style that has not settled yet. */
    const show = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    };
    const setPaint = (layerId: string, property: string, value: unknown) => {
      if (!map.getLayer(layerId)) return;
      map.setPaintProperty(layerId, property, value);
    };

    show('fire-point', visibility.fires);
    show('fire-glow', visibility.fires);

    show('perimeter-fill', visibility.perimeters);
    show('perimeter-outline', visibility.perimeters);
    setPaint('perimeter-fill', 'fill-opacity', (opacity.perimeters ?? 0.55) * 0.5);
    setPaint('perimeter-outline', 'line-opacity', opacity.perimeters ?? 0.55);

    show('smoke-fill', visibility.smoke);
    show('smoke-outline', visibility.smoke);
    // Scale each density's base opacity by the slider rather than overriding it,
    // so light/medium/heavy stay distinguishable at every setting.
    const smokeScale = opacity.smoke ?? 1;
    setPaint('smoke-fill', 'fill-opacity', [
      'match',
      ['get', 'density'],
      'heavy', SMOKE_STYLE.heavy.opacity * smokeScale,
      'medium', SMOKE_STYLE.medium.opacity * smokeScale,
      SMOKE_STYLE.light.opacity * smokeScale,
    ]);

    show('heat-fill', visibility.heatAdvisories);
    show('heat-outline', visibility.heatAdvisories);
    setPaint('heat-fill', 'fill-opacity', opacity.heatAdvisories ?? 0.35);

    show('fire-danger-fill', visibility.fireDanger);
    show('fire-danger-outline', visibility.fireDanger);
    setPaint('fire-danger-fill', 'fill-opacity', opacity.fireDanger ?? 0.35);

    show('aqi-point', visibility.airQualityStations);
    show('aqi-halo', visibility.airQualityStations);

    show('aqi-contours', visibility.airQualityContours);
    setPaint('aqi-contours', 'raster-opacity', opacity.airQualityContours ?? 0.6);

    show('detections-heat', visibility.detections);
    show('detections-point', visibility.detections);

    // One shared raster source serves whichever imagery layer is selected.
    const activeImagery = (Object.keys(GIBS_BY_LAYER) as LayerId[]).find((id) => visibility[id]);
    if (activeImagery) {
      const definition = GIBS_LAYERS[GIBS_BY_LAYER[activeImagery]!]!;
      const source = map.getSource(SRC.gibs) as maplibregl.RasterTileSource | undefined;
      const nextUrl = gibsTileUrl(definition, gibsDate());
      // setTiles refetches, so only call it when the layer actually changed.
      if (source && source.tiles?.[0] !== nextUrl) {
        source.setTiles([nextUrl]);
      }
      show('gibs-imagery', true);
      setPaint('gibs-imagery', 'raster-opacity', opacity[activeImagery] ?? definition.defaultOpacity);
    } else {
      show('gibs-imagery', false);
    }
  }, [visibility, opacity, basemap]);

  // --- Selection ----------------------------------------------------------
  const selectedFireId = props.selectedFireId;
  const previousSelection = useRef<number | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (previousSelection.current !== null) {
      map.setFeatureState({ source: SRC.fires, id: previousSelection.current }, { selected: false });
      previousSelection.current = null;
    }

    if (!selectedFireId) return;
    const id = hashId(selectedFireId);
    map.setFeatureState({ source: SRC.fires, id }, { selected: true });
    previousSelection.current = id;
  }, [selectedFireId, props.fires, basemap]);

  return <div ref={containerRef} className="map-canvas" role="application" aria-label="Wildfire map" />;
}

/** Escape interpolated values before they go into popup HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fly the map to a fire, used by the incident list and search. */
export function flyToFire(map: MapLibreMap | null, fire: FireIncident): void {
  if (!map) return;
  map.flyTo({
    center: fire.position,
    zoom: Math.max(map.getZoom(), 9),
    duration: 1200,
    essential: true,
  });
}

/** Fit the map to a bounding box, used when zooming to a perimeter. */
export function fitBounds(map: MapLibreMap | null, bounds: LngLatBoundsLike): void {
  map?.fitBounds(bounds, { padding: 80, duration: 1000 });
}
