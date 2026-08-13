/**
 * The catalog of toggleable overlays.
 *
 * One declarative list drives the layer panel, the URL state, the legend and
 * the default visibility, so adding an overlay does not mean touching five
 * files. Rendering itself lives in `MapView`, keyed by these ids.
 */

export type LayerId =
  | 'perimeters'
  | 'fires'
  | 'detections'
  | 'smoke'
  | 'airQualityContours'
  | 'airQualityStations'
  | 'heatAdvisories'
  | 'fireDanger'
  | 'gibsFireBands721'
  | 'gibsTrueColor'
  | 'gibsThermalAnomalies'
  | 'gibsAerosolDepth';

export type LayerGroupId = 'fire' | 'smokeAir' | 'weather' | 'imagery';

export interface LayerGroup {
  id: LayerGroupId;
  label: string;
  description: string;
}

export const LAYER_GROUPS: LayerGroup[] = [
  { id: 'fire', label: 'Wildfire', description: 'Incidents, perimeters and satellite detections' },
  { id: 'smokeAir', label: 'Smoke & air quality', description: 'Plumes and what they do to the air' },
  { id: 'weather', label: 'Weather hazards', description: 'Heat and fire-weather advisories' },
  { id: 'imagery', label: 'Satellite imagery', description: 'Daily NASA composites' },
];

export interface LayerDefinition {
  id: LayerId;
  group: LayerGroupId;
  label: string;
  /** One line explaining what the layer shows and why it is useful. */
  description: string;
  /** Visible on first load. */
  defaultVisible: boolean;
  /** Data source id in the health registry, when the layer is server-fed. */
  sourceId?: string;
  /** Set when the layer needs an API key that may not be configured. */
  requiresApiKey?: 'FIRMS_MAP_KEY' | 'AIRNOW_API_KEY';
  /** Layers with an adjustable opacity slider in the panel. */
  adjustableOpacity?: boolean;
  defaultOpacity?: number;
  /**
   * Imagery layers are mutually exclusive — stacking two global composites just
   * hides one behind the other, so selecting one clears the rest of its group.
   */
  exclusiveWithinGroup?: boolean;
  attribution: string;
}

export const LAYERS: LayerDefinition[] = [
  // --- Wildfire -------------------------------------------------------------
  {
    id: 'perimeters',
    group: 'fire',
    label: 'Fire perimeters',
    description: 'Mapped edges of active fires, flown or walked by field crews.',
    defaultVisible: true,
    sourceId: 'perimeters',
    adjustableOpacity: true,
    defaultOpacity: 0.55,
    attribution: 'NIFC WFIGS',
  },
  {
    id: 'fires',
    group: 'fire',
    label: 'Active incidents',
    description: 'Reported wildfires. Click any marker for cause, size, containment and crews.',
    defaultVisible: true,
    sourceId: 'incidents',
    attribution: 'NIFC WFIGS',
  },
  {
    id: 'detections',
    group: 'fire',
    label: 'Satellite hotspots',
    description:
      'Individual thermal detections from VIIRS — hours fresher than incident reports, but with no incident detail.',
    defaultVisible: false,
    sourceId: 'detections',
    requiresApiKey: 'FIRMS_MAP_KEY',
    attribution: 'NASA FIRMS',
  },

  // --- Smoke & air ----------------------------------------------------------
  {
    id: 'smoke',
    group: 'smokeAir',
    label: 'Smoke plumes',
    description: 'Analyst-drawn plume outlines classified light, medium and heavy.',
    defaultVisible: true,
    sourceId: 'smoke',
    adjustableOpacity: true,
    defaultOpacity: 1,
    attribution: 'NOAA HMS',
  },
  {
    id: 'airQualityContours',
    group: 'smokeAir',
    label: 'Air quality surface',
    description: 'Interpolated AQI across the country, shaded with the EPA color scale.',
    defaultVisible: false,
    adjustableOpacity: true,
    defaultOpacity: 0.6,
    attribution: 'U.S. EPA AirNow',
  },
  {
    id: 'airQualityStations',
    group: 'smokeAir',
    label: 'AQI monitoring stations',
    description: 'Ground monitor readings — the measured truth behind the interpolated surface.',
    defaultVisible: true,
    sourceId: 'airQuality',
    requiresApiKey: 'AIRNOW_API_KEY',
    attribution: 'U.S. EPA AirNow',
  },

  // --- Weather --------------------------------------------------------------
  {
    id: 'fireDanger',
    group: 'weather',
    label: 'Fire danger',
    description: 'Red Flag Warnings and Fire Weather Watches — where conditions favor rapid spread.',
    defaultVisible: true,
    sourceId: 'alerts',
    adjustableOpacity: true,
    defaultOpacity: 0.35,
    attribution: 'NOAA NWS',
  },
  {
    id: 'heatAdvisories',
    group: 'weather',
    label: 'Heat advisories',
    description: 'Active heat warnings, watches and advisories from the National Weather Service.',
    defaultVisible: false,
    sourceId: 'alerts',
    adjustableOpacity: true,
    defaultOpacity: 0.35,
    attribution: 'NOAA NWS',
  },

  // --- Imagery --------------------------------------------------------------
  {
    id: 'gibsFireBands721',
    group: 'imagery',
    label: 'Fire & burn scars (7-2-1)',
    description: 'Shortwave infrared: flame fronts glow red, burn scars go dark red.',
    defaultVisible: false,
    adjustableOpacity: true,
    defaultOpacity: 0.85,
    exclusiveWithinGroup: true,
    attribution: 'NASA GIBS',
  },
  {
    id: 'gibsTrueColor',
    group: 'imagery',
    label: 'True color',
    description: 'Daily natural-color mosaic — smoke as the human eye would see it.',
    defaultVisible: false,
    adjustableOpacity: true,
    defaultOpacity: 0.9,
    exclusiveWithinGroup: true,
    attribution: 'NASA GIBS',
  },
  {
    id: 'gibsThermalAnomalies',
    group: 'imagery',
    label: 'Thermal anomalies',
    description: 'The VIIRS active fire product rendered as an imagery layer.',
    defaultVisible: false,
    adjustableOpacity: true,
    defaultOpacity: 1,
    exclusiveWithinGroup: true,
    attribution: 'NASA GIBS',
  },
  {
    id: 'gibsAerosolDepth',
    group: 'imagery',
    label: 'Aerosol optical depth',
    description: 'Satellite measure of airborne particle load — where smoke is thickest aloft.',
    defaultVisible: false,
    adjustableOpacity: true,
    defaultOpacity: 0.7,
    exclusiveWithinGroup: true,
    attribution: 'NASA GIBS',
  },
];

export const LAYER_BY_ID = new Map(LAYERS.map((layer) => [layer.id, layer]));

export type LayerVisibility = Record<LayerId, boolean>;
export type LayerOpacity = Partial<Record<LayerId, number>>;

export function defaultVisibility(): LayerVisibility {
  return Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultVisible])) as LayerVisibility;
}

export function defaultOpacity(): LayerOpacity {
  const entries = LAYERS.filter((l) => l.defaultOpacity !== undefined).map((l) => [
    l.id,
    l.defaultOpacity!,
  ]);
  return Object.fromEntries(entries) as LayerOpacity;
}
