/**
 * Normalized data model shared by the server adapters and the web client.
 *
 * Upstream feeds (NIFC WFIGS, NOAA HMS, EPA AirNow, NWS, NASA FIRMS) each use
 * their own field names, units and casing. Adapters flatten them into the
 * shapes below so the UI never has to know which agency a value came from.
 */

/** [longitude, latitude] — GeoJSON order, not Google's lat/lng order. */
export type LngLat = [number, number];

/** [west, south, east, north] */
export type BBox = [number, number, number, number];

// ---------------------------------------------------------------------------
// Wildfire incidents
// ---------------------------------------------------------------------------

/**
 * How the fire started. WFIGS reports cause at three levels of specificity and
 * any of them can be absent, so all three are optional and rendered as a chain.
 */
export interface FireCause {
  /** "Human", "Natural", "Undetermined", "Unknown". */
  category?: string;
  /** e.g. "Recreation and ceremony", "Natural". */
  general?: string;
  /** e.g. "Campfire", "Lightning", "Equipment and vehicle use". */
  specific?: string;
  /** Whether the cause is still under investigation. */
  underInvestigation?: boolean;
}

/**
 * Who owns the land, who is fighting the fire and who has legal jurisdiction —
 * these are three genuinely different answers and the UI shows all of them.
 */
export interface FireResponsibleParties {
  /** Agency legally responsible for the incident (e.g. "USFS", "CAL FIRE"). */
  jurisdictionalAgency?: string;
  /** Specific unit under that agency (e.g. "CA-KNF" Klamath NF). */
  jurisdictionalUnit?: string;
  /** Agency actually providing suppression, which may differ from jurisdiction. */
  protectingAgency?: string;
  protectingUnit?: string;
  /** Broad landowner class: "Federal", "State", "Private", "Tribal"… */
  landownerCategory?: string;
  landownerKind?: string;
  /** Geographic Area Coordination Center, e.g. "NOCC" (Northern California). */
  gacc?: string;
  /** Dispatch center identifier, e.g. "CARRCC". */
  dispatchCenter?: string;
  /** True when multiple agencies share command of the incident. */
  unifiedCommand?: boolean;
  multiJurisdictional?: boolean;
}

/**
 * Crews and equipment assigned to the incident. Every field is optional: point
 * feeds carry only personnel totals, while ICS-209 situation reports carry the
 * full resource breakdown. The UI renders whichever counts are present.
 */
export interface FireResources {
  /** Total personnel assigned across all resources. */
  totalPersonnel?: number;
  /** Number of hand/hotshot crews assigned. */
  crews?: number;
  engines?: number;
  helicopters?: number;
  airtankers?: number;
  dozers?: number;
  waterTenders?: number;
  /**
   * Managing organization, e.g. "Type 1 IMT", "Type 3 Organization".
   * A rough proxy for how serious the incident is considered.
   */
  managementOrganization?: string;
  /** Incident complexity level, e.g. "Type 1"–"Type 5". */
  complexityLevel?: string;
}

/** Damage and casualty counts reported for the incident. */
export interface FireImpacts {
  structuresDestroyed?: number;
  structuresThreatened?: number;
  residencesDestroyed?: number;
  residencesThreatened?: number;
  otherStructuresDestroyed?: number;
  injuries?: number;
  fatalities?: number;
  /** Suppression cost to date, USD. */
  estimatedCostToDate?: number;
  /** Evacuation status text when the feed provides it. */
  evacuationStatus?: string;
}

/** Where the fire is burning, in human terms. */
export interface FireLocation {
  state?: string;
  county?: string;
  city?: string;
  /** Free-text description of the point of origin. */
  description?: string;
  /** Predominant fuel carrying the fire, e.g. "Timber", "Chaparral". */
  fuelGroup?: string;
  primaryFuelModel?: string;
}

/** Milestone timestamps, all ISO 8601 UTC strings. */
export interface FireTimestamps {
  /** When the fire was discovered/reported. */
  discovered?: string;
  /** When the fire was declared contained. */
  contained?: string;
  /** When the fire was declared controlled. */
  controlled?: string;
  /** When the fire was declared out. */
  out?: string;
  /** When the source record was last modified — the "last updated" the UI shows. */
  lastUpdated?: string;
}

/**
 * `WF` wildfire, `RX` prescribed burn, `CX` complex. Prescribed burns share the
 * feed with wildfires and are filtered separately in the UI.
 */
export type IncidentTypeCategory = 'WF' | 'RX' | 'CX' | 'OT';

/** A single wildfire incident, normalized from WFIGS incident locations. */
export interface FireIncident {
  /** Stable id — IRWIN ID when available, otherwise a synthesized fallback. */
  id: string;
  /** IRWIN (Integrated Reporting of Wildland-Fire Information) UUID. */
  irwinId?: string;
  /** Agency-unique fire identifier, e.g. "2026-CAKNF-000123". */
  uniqueFireId?: string;
  name: string;
  position: LngLat;

  incidentType?: IncidentTypeCategory;
  /** Raw incident type string when it does not map to a known category. */
  incidentTypeRaw?: string;

  /** Current size in acres. */
  acres?: number;
  /** Acres at initial response, useful for showing growth. */
  initialResponseAcres?: number;
  /** Containment as a percentage, 0–100. */
  percentContained?: number;

  cause: FireCause;
  responsibleParties: FireResponsibleParties;
  resources: FireResources;
  impacts: FireImpacts;
  location: FireLocation;
  timestamps: FireTimestamps;

  /** Short narrative description when the feed supplies one. */
  shortDescription?: string;
  /** General fire behavior narrative, e.g. "Creeping. Smoldering.". */
  fireBehavior?: string;
  /** InciWeb public incident page, when the fire is published there. */
  inciWebUrl?: string;
  /** Name of the parent complex, if this fire has been rolled into one. */
  complexName?: string;

  /** True when the fire has no containment/out date and is still burning. */
  isActive: boolean;
  /** Where this record came from, for attribution in the UI. */
  sourceId: string;
}

/** A mapped fire perimeter polygon, keyed back to its incident where possible. */
export interface FirePerimeter {
  id: string;
  irwinId?: string;
  name?: string;
  /** Acres computed from the mapped polygon (may differ from reported acres). */
  gisAcres?: number;
  /** ISO 8601 timestamp of the perimeter survey. */
  lastUpdated?: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * A satellite thermal detection (NASA FIRMS). These are *not* incidents — they
 * are individual hot pixels, and many detections can belong to one fire.
 */
export interface FireDetection {
  id: string;
  position: LngLat;
  /** Brightness temperature, Kelvin. */
  brightnessK?: number;
  /** Fire radiative power, megawatts — a proxy for intensity. */
  frpMw?: number;
  /** Detection confidence: "low" | "nominal" | "high", or 0–100 for MODIS. */
  confidence?: string | number;
  /** Acquisition time, ISO 8601. */
  acquiredAt?: string;
  /** Satellite/sensor, e.g. "VIIRS NOAA-20". */
  satellite?: string;
  /** Day or night overpass. */
  daynight?: 'D' | 'N';
}

// ---------------------------------------------------------------------------
// Smoke
// ---------------------------------------------------------------------------

/** NOAA HMS classifies smoke plumes into three density bands. */
export type SmokeDensity = 'light' | 'medium' | 'heavy';

/** A smoke plume polygon analyzed from satellite imagery. */
export interface SmokePlume {
  id: string;
  density: SmokeDensity;
  /** Estimated near-surface PM2.5 contribution, µg/m³, when provided. */
  pm25?: number;
  /** Start of the observation window, ISO 8601. */
  start?: string;
  /** End of the observation window, ISO 8601. */
  end?: string;
  /** Satellite the analysis was drawn from. */
  satellite?: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

// ---------------------------------------------------------------------------
// Air quality
// ---------------------------------------------------------------------------

/** EPA AQI categories, 1–6. */
export type AqiCategory = 1 | 2 | 3 | 4 | 5 | 6;

/** A ground monitoring station observation. */
export interface AirQualityObservation {
  id: string;
  position: LngLat;
  /** Reporting area name, e.g. "Sacramento". */
  areaName?: string;
  stateCode?: string;
  /** Pollutant measured, e.g. "PM2.5", "OZONE". */
  parameter: string;
  /** Raw concentration in the parameter's native units. */
  concentration?: number;
  unit?: string;
  /** Computed AQI value, 0–500+. */
  aqi?: number;
  category?: AqiCategory;
  /** Observation time, ISO 8601. */
  observedAt?: string;
}

/** Static metadata for rendering an AQI category — label, color, guidance. */
export interface AqiCategoryInfo {
  category: AqiCategory;
  label: string;
  /** Inclusive AQI range for this category. */
  range: [number, number];
  color: string;
  /** Health guidance shown in the legend and popups. */
  guidance: string;
}

// ---------------------------------------------------------------------------
// Weather alerts (heat advisories + fire danger)
// ---------------------------------------------------------------------------

/**
 * Which overlay an NWS alert belongs to. One alerts feed drives two distinct
 * layers, so each alert is tagged as it is normalized.
 */
export type AlertKind = 'heat' | 'fire';

/** NWS severity ladder. */
export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

/** A National Weather Service watch/warning/advisory. */
export interface WeatherAlert {
  id: string;
  kind: AlertKind;
  /** Event name, e.g. "Red Flag Warning", "Extreme Heat Warning". */
  event: string;
  headline?: string;
  description?: string;
  /** Protective action guidance from the issuing office. */
  instruction?: string;
  severity: AlertSeverity;
  /** "Observed" | "Likely" | "Possible" | … */
  certainty?: string;
  /** "Immediate" | "Expected" | "Future" | … */
  urgency?: string;
  /** Plain-language list of affected areas. */
  areaDescription?: string;
  /** Issuing NWS office, e.g. "NWS Sacramento CA". */
  senderName?: string;
  onset?: string;
  expires?: string;
  effective?: string;
  /**
   * Alert footprint. NWS returns null geometry for zone-based alerts, in which
   * case the server resolves it from the affected forecast zones.
   */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  /** UGC zone codes this alert applies to, kept for debugging/attribution. */
  zoneCodes?: string[];
}

// ---------------------------------------------------------------------------
// Source health
// ---------------------------------------------------------------------------

export type SourceStatus = 'ok' | 'stale' | 'degraded' | 'unavailable' | 'disabled';

/**
 * Per-feed health, surfaced in the UI so a blank layer is never ambiguous —
 * the user can always tell "no fires here" from "this feed is down".
 */
export interface SourceHealth {
  id: string;
  label: string;
  status: SourceStatus;
  /** Which candidate URL actually served the data. */
  resolvedUrl?: string;
  /** When data was last successfully retrieved, ISO 8601. */
  lastSuccessAt?: string;
  /** Age of the served data in seconds. */
  ageSeconds?: number;
  /** Number of records in the last successful response. */
  featureCount?: number;
  /** Error summary when the fetch failed. */
  error?: string;
  /** True when the response was served from the bundled demo dataset. */
  usingFallback?: boolean;
  /** Human-readable attribution for the data provider. */
  attribution: string;
  /** True when the source needs an API key that has not been configured. */
  requiresApiKey?: boolean;
}

/** Envelope returned by every data route. */
export interface ApiResponse<T> {
  data: T;
  health: SourceHealth;
}
