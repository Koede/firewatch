import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap styles.
 *
 * All four are built from keyless raster tile services so the app runs with no
 * signup, no billing account and no token — the thing a Google Maps clone
 * usually can't do. Each style is generated rather than fetched from a style
 * URL, which keeps the layer ids stable so overlays can always be inserted
 * beneath labels.
 */

export type BasemapId = 'streets' | 'satellite' | 'terrain' | 'dark';

export interface BasemapDefinition {
  id: BasemapId;
  label: string;
  /** Short description shown in the basemap switcher. */
  description: string;
  attribution: string;
  /** True when the basemap is dark, so the UI can flip overlay contrast. */
  isDark: boolean;
  style: StyleSpecification;
}

/** Build a single-source raster style from a tile URL template. */
function rasterStyle(
  tiles: string[],
  attribution: string,
  options: { maxzoom?: number; background?: string; tileSize?: number } = {},
): StyleSpecification {
  return {
    version: 8,
    // A local glyph-free style: no text layers, so no glyph server is needed.
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: options.tileSize ?? 256,
        maxzoom: options.maxzoom ?? 19,
        attribution,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': options.background ?? '#0b0d10' },
      },
      {
        id: 'base',
        type: 'raster',
        source: 'base',
        paint: { 'raster-opacity': 1 },
      },
    ],
  };
}

export const BASEMAPS: Record<BasemapId, BasemapDefinition> = {
  streets: {
    id: 'streets',
    label: 'Map',
    description: 'Roads, towns and terrain shading',
    attribution: '© OpenStreetMap contributors',
    isDark: false,
    style: rasterStyle(
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      { maxzoom: 19, background: '#f2efe9' },
    ),
  },

  satellite: {
    id: 'satellite',
    label: 'Satellite',
    description: 'High-resolution aerial and satellite imagery',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    isDark: true,
    style: rasterStyle(
      [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      { maxzoom: 19, background: '#0b0d10' },
    ),
  },

  terrain: {
    id: 'terrain',
    label: 'Terrain',
    description: 'Topographic relief — useful for reading fire spread',
    attribution: '© OpenTopoMap, © OpenStreetMap contributors',
    isDark: false,
    style: rasterStyle(
      ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
      '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), © OpenStreetMap contributors',
      { maxzoom: 17, background: '#f2efe9' },
    ),
  },

  dark: {
    id: 'dark',
    label: 'Dark',
    description: 'Low-glare basemap that lets fire and smoke colors dominate',
    attribution: '© Esri, © OpenStreetMap contributors',
    isDark: true,
    style: rasterStyle(
      [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      'Tiles © Esri — Esri, DeLorme, NAVTEQ',
      { maxzoom: 16, background: '#0b0d10' },
    ),
  },
};

export const DEFAULT_BASEMAP: BasemapId = 'dark';

/**
 * NASA GIBS satellite imagery overlays.
 *
 * GIBS serves daily global composites as WMTS. These are the "satellite imagery
 * of fires" layers: band 7-2-1 renders active flame fronts in vivid red and
 * burn scars in deep red-brown, which true color cannot show, and the thermal
 * anomaly layer marks detected hot pixels directly.
 */
export interface GibsLayerDefinition {
  id: string;
  label: string;
  description: string;
  /** GIBS layer identifier. */
  layer: string;
  format: 'jpg' | 'png';
  /** Deepest zoom GIBS publishes for this layer. */
  maxNativeZoom: number;
  attribution: string;
  /** Default opacity when the layer is switched on. */
  defaultOpacity: number;
}

export const GIBS_LAYERS: Record<string, GibsLayerDefinition> = {
  fireBands721: {
    id: 'fireBands721',
    label: 'Fire & burn scars (Bands 7-2-1)',
    description:
      'Shortwave infrared composite. Active flame fronts glow red-orange and burn scars appear dark red — both invisible in true color.',
    layer: 'MODIS_Terra_CorrectedReflectance_Bands721',
    format: 'jpg',
    maxNativeZoom: 9,
    attribution: 'NASA EOSDIS GIBS — MODIS Terra',
    defaultOpacity: 0.85,
  },
  trueColor: {
    id: 'trueColor',
    label: 'True color imagery',
    description: 'Daily natural-color satellite mosaic — smoke plumes read as they look from space.',
    layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    format: 'jpg',
    maxNativeZoom: 9,
    attribution: 'NASA EOSDIS GIBS — VIIRS NOAA-20',
    defaultOpacity: 0.9,
  },
  thermalAnomalies: {
    id: 'thermalAnomalies',
    label: 'Thermal anomalies',
    description: 'Satellite-detected hot pixels from the VIIRS active fire product.',
    layer: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    format: 'png',
    maxNativeZoom: 7,
    attribution: 'NASA EOSDIS GIBS — VIIRS NOAA-20',
    defaultOpacity: 1,
  },
  aerosolDepth: {
    id: 'aerosolDepth',
    label: 'Aerosol optical depth',
    description:
      'How much sunlight airborne particles block — a satellite view of where smoke is thickest.',
    layer: 'MODIS_Combined_Value_Added_AOD',
    format: 'png',
    maxNativeZoom: 6,
    attribution: 'NASA EOSDIS GIBS — MODIS Combined',
    defaultOpacity: 0.7,
  },
};

/**
 * Build the WMTS tile URL for a GIBS layer on a given day.
 *
 * GIBS publishes on a UTC day boundary and the current day's composite is
 * incomplete until the satellite has finished its passes, so callers default to
 * yesterday for a globally complete image.
 */
export function gibsTileUrl(definition: GibsLayerDefinition, date: string): string {
  return (
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${definition.layer}/default/` +
    `${date}/GoogleMapsCompatible_Level${definition.maxNativeZoom}/{z}/{y}/{x}.${definition.format}`
  );
}

/** `YYYY-MM-DD` for a UTC day offset from today. */
export function gibsDate(daysAgo = 1): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * EPA AirNow AQI contour tiles.
 *
 * A keyless raster service that renders the national AQI surface. This is the
 * baseline air-quality layer; the point observations from the AirNow API are an
 * optional enhancement layered on top when a key is configured.
 */
export const AIRNOW_CONTOUR_TILES =
  'https://gispub.epa.gov/arcgis/rest/services/OAR_OAQPS/AirNowLatestContoursCombined/MapServer/tile/{z}/{y}/{x}';

export const AIRNOW_ATTRIBUTION = 'U.S. EPA AirNow';
