/**
 * Every upstream endpoint the app talks to, in one place.
 *
 * Public agency GIS endpoints move around — services get renamed, versioned or
 * retired between fire seasons. Each source therefore lists *candidate* URLs
 * that are tried in order, and the health endpoint reports which one actually
 * answered. When a service moves, fixing it means editing this file only.
 *
 * Every URL here is documented, keyless and public unless `requiresApiKey` is
 * set. The two keyed sources (NASA FIRMS, EPA AirNow observations) are strictly
 * optional enhancements; the app is fully functional without them.
 */

export interface SourceDefinition {
  id: string;
  label: string;
  /** URLs tried in order until one returns usable data. */
  candidates: string[];
  /** How long a successful response is cached, in seconds. */
  ttlSeconds: number;
  /** Data older than this is reported as `stale` in the health endpoint. */
  staleAfterSeconds: number;
  /** Attribution string shown in the UI. */
  attribution: string;
  /** Provider homepage, linked from the sources panel. */
  homepage: string;
  /** Set when the source needs an API key to work at all. */
  requiresApiKey?: 'FIRMS_MAP_KEY' | 'AIRNOW_API_KEY';
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

const env = process.env;

/** Read an integer env var, falling back when unset or unparseable. */
function envInt(name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * NIFC hosts the interagency wildfire feeds on ArcGIS Online. `outFields=*`
 * keeps the adapter resilient: the schema gains and loses columns between
 * seasons and the adapter maps defensively rather than requesting a fixed list.
 */
const NIFC_ORG = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services';

const ARCGIS_GEOJSON_QUERY = 'where=1%3D1&outFields=*&f=geojson&returnGeometry=true&outSR=4326';

export const SOURCES: Record<string, SourceDefinition> = {
  /**
   * Wildfire incident points. This is the feed behind the click-a-fire panel:
   * cause, acreage, containment, responsible agencies and personnel all live
   * on these features.
   */
  incidents: {
    id: 'incidents',
    label: 'Active wildfire incidents',
    candidates: [
      `${NIFC_ORG}/WFIGS_Incident_Locations_Current/FeatureServer/0/query?${ARCGIS_GEOJSON_QUERY}&resultRecordCount=5000`,
      `${NIFC_ORG}/WFIGS_Incident_Locations_Current/FeatureServer/0/query?${ARCGIS_GEOJSON_QUERY}`,
      // Fallback to the older service name used before the WFIGS rename.
      `${NIFC_ORG}/Current_WildlandFire_Locations/FeatureServer/0/query?${ARCGIS_GEOJSON_QUERY}`,
    ],
    ttlSeconds: envInt('CACHE_TTL_INCIDENTS', 300),
    staleAfterSeconds: 3 * 3600,
    attribution: 'National Interagency Fire Center — WFIGS',
    homepage: 'https://data-nifc.opendata.arcgis.com/',
    timeoutMs: 30_000,
  },

  /** Mapped fire perimeters, drawn as polygons beneath the incident markers. */
  perimeters: {
    id: 'perimeters',
    label: 'Fire perimeters',
    candidates: [
      `${NIFC_ORG}/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?${ARCGIS_GEOJSON_QUERY}&resultRecordCount=3000`,
      `${NIFC_ORG}/Current_WildlandFire_Perimeters/FeatureServer/0/query?${ARCGIS_GEOJSON_QUERY}`,
    ],
    ttlSeconds: envInt('CACHE_TTL_PERIMETERS', 600),
    staleAfterSeconds: 12 * 3600,
    attribution: 'National Interagency Fire Center — WFIGS',
    homepage: 'https://data-nifc.opendata.arcgis.com/',
    timeoutMs: 45_000,
  },

  /**
   * NOAA Hazard Mapping System smoke plumes: analyst-drawn polygons digitized
   * from GOES imagery, classified light/medium/heavy. NOAA publishes them as
   * dated files, so the URL is templated with `{YYYY}`, `{MM}`, `{DD}`.
   */
  smoke: {
    id: 'smoke',
    label: 'Smoke plumes (NOAA HMS)',
    candidates: [
      'https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/GeoJSON/{YYYY}/{MM}/hms_smoke{YYYY}{MM}{DD}.geojson',
      'https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML/{YYYY}/{MM}/hms_smoke{YYYY}{MM}{DD}.kml',
      // Esri Living Atlas mirror, used when the NOAA FTP mirror is unreachable.
      'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NOAA_HMS_Smoke_Forecast/FeatureServer/0/query?' +
        ARCGIS_GEOJSON_QUERY,
    ],
    ttlSeconds: envInt('CACHE_TTL_SMOKE', 900),
    staleAfterSeconds: 24 * 3600,
    attribution: 'NOAA/NESDIS Hazard Mapping System',
    homepage: 'https://www.ospo.noaa.gov/products/land/hms.html',
    timeoutMs: 30_000,
  },

  /**
   * NWS active alerts. One request serves both the heat advisory and the fire
   * danger overlays; the adapter splits them by event name.
   */
  alerts: {
    id: 'alerts',
    label: 'NWS watches, warnings & advisories',
    candidates: [
      'https://api.weather.gov/alerts/active?status=actual&message_type=alert,update',
      'https://api.weather.gov/alerts/active',
    ],
    ttlSeconds: envInt('CACHE_TTL_ALERTS', 300),
    staleAfterSeconds: 2 * 3600,
    attribution: 'NOAA National Weather Service',
    homepage: 'https://www.weather.gov/documentation/services-web-api',
    timeoutMs: 30_000,
  },

  /**
   * Forecast zone geometry. Most heat and red-flag alerts carry a null geometry
   * and reference UGC zones instead, so the polygons have to be joined in from
   * here. Zones change rarely, hence the long TTL.
   */
  zones: {
    id: 'zones',
    label: 'NWS forecast zone geometry',
    candidates: [
      'https://api.weather.gov/zones?type=public&include_geometry=true&limit=3000',
      'https://api.weather.gov/zones?type=fire&include_geometry=true&limit=3000',
    ],
    ttlSeconds: envInt('CACHE_TTL_ZONES', 86_400),
    staleAfterSeconds: 30 * 86_400,
    attribution: 'NOAA National Weather Service',
    homepage: 'https://www.weather.gov/documentation/services-web-api',
    timeoutMs: 60_000,
  },

  /**
   * EPA AirNow ground monitor observations, the PM2.5 half of the smoke story.
   * Free key from https://docs.airnowapi.org/account/request/. Without it the
   * app falls back to the keyless AirNow contour raster tiles.
   */
  airQuality: {
    id: 'airQuality',
    label: 'Air quality observations (AirNow)',
    candidates: [
      'https://www.airnowapi.org/aq/data/?startDate={START}&endDate={END}&parameters=PM25,OZONE' +
        '&BBOX={BBOX}&dataType=B&format=application/json&verbose=1&monitorType=0&includerawconcentrations=1&API_KEY={KEY}',
    ],
    ttlSeconds: envInt('CACHE_TTL_AIR_QUALITY', 900),
    staleAfterSeconds: 3 * 3600,
    attribution: 'U.S. EPA AirNow',
    homepage: 'https://docs.airnowapi.org/',
    requiresApiKey: 'AIRNOW_API_KEY',
    timeoutMs: 30_000,
  },

  /**
   * NASA FIRMS satellite thermal anomalies — individual hot pixels, far more
   * timely than incident reports but with no incident metadata attached.
   * Free key from https://firms.modaps.eosdis.nasa.gov/api/area/.
   */
  detections: {
    id: 'detections',
    label: 'Satellite fire detections (NASA FIRMS)',
    candidates: [
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{DATASET}/{BBOX}/{DAYS}',
    ],
    ttlSeconds: envInt('CACHE_TTL_DETECTIONS', 900),
    staleAfterSeconds: 6 * 3600,
    attribution: 'NASA FIRMS (LANCE/ESDIS)',
    homepage: 'https://firms.modaps.eosdis.nasa.gov/',
    requiresApiKey: 'FIRMS_MAP_KEY',
    timeoutMs: 45_000,
  },
};

/** Server runtime configuration. */
export const CONFIG = {
  port: envInt('PORT', 8787),
  host: env.HOST ?? '0.0.0.0',

  /**
   * Contact identifier sent in User-Agent. api.weather.gov requires a
   * self-identifying User-Agent and may reject anonymous clients.
   */
  userAgent:
    env.FIREWATCH_USER_AGENT ??
    'Firewatch/0.1 (wildfire situational awareness map; set FIREWATCH_USER_AGENT to your contact address)',

  firmsMapKey: env.FIRMS_MAP_KEY ?? '',
  airNowApiKey: env.AIRNOW_API_KEY ?? '',

  /** FIRMS dataset to query. NOAA-21 is the newest VIIRS platform. */
  firmsDataset: env.FIRMS_DATASET ?? 'VIIRS_NOAA20_NRT',
  /** How many days of FIRMS detections to request, 1–10. */
  firmsDays: Math.min(10, Math.max(1, envInt('FIRMS_DAYS', 1))),

  /**
   * Serve the bundled demo dataset when an upstream feed fails, so the map is
   * never mysteriously blank. Set `FIREWATCH_DISABLE_FALLBACK=1` in production
   * if you would rather surface the outage than show sample data.
   */
  fallbackEnabled: env.FIREWATCH_DISABLE_FALLBACK !== '1',

  /** Number of retries per candidate URL before moving to the next one. */
  maxRetries: envInt('FIREWATCH_MAX_RETRIES', 2),

  /** CORS origin for the dev server. */
  corsOrigin: env.CORS_ORIGIN ?? '*',
} as const;

/**
 * Substitute `{YYYY}`-style tokens in a candidate URL template.
 * Unknown tokens are left intact so a misconfigured URL fails loudly.
 */
export function expandUrlTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (match, token: string) => vars[token] ?? match);
}

/** Date tokens for the current UTC day, used by the HMS smoke URLs. */
export function dateTokens(date = new Date()): Record<string, string> {
  return {
    YYYY: String(date.getUTCFullYear()),
    MM: String(date.getUTCMonth() + 1).padStart(2, '0'),
    DD: String(date.getUTCDate()).padStart(2, '0'),
  };
}
