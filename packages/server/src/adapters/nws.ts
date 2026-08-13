import type { AlertKind, AlertSeverity, WeatherAlert } from '@firewatch/shared';
import { FIRE_WEATHER_EVENTS, HEAT_EVENTS } from '@firewatch/shared';

/**
 * Normalizes the NWS active-alerts feed into the heat advisory and fire danger
 * overlays.
 *
 * The awkward part is geometry. NWS returns a polygon only for storm-based
 * warnings; heat and red-flag products are issued against UGC forecast zones
 * and arrive with `geometry: null` plus a list of zone URLs. Rendering the feed
 * as-is drops most of both layers, so zone geometry is joined in separately.
 */

interface NwsAlertFeature {
  id?: string;
  geometry: GeoJSON.Geometry | null;
  properties?: {
    '@id'?: string;
    id?: string;
    event?: string;
    headline?: string;
    description?: string;
    instruction?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    areaDesc?: string;
    senderName?: string;
    onset?: string;
    expires?: string;
    ends?: string;
    effective?: string;
    affectedZones?: string[];
    geocode?: { UGC?: string[]; SAME?: string[] };
  };
}

interface NwsAlertCollection {
  features?: NwsAlertFeature[];
}

/** Zone geometry keyed by UGC code, e.g. `CAZ017`. */
export type ZoneGeometryIndex = Map<string, GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const HEAT_SET = new Set(HEAT_EVENTS.map((e) => e.toLowerCase()));
const FIRE_SET = new Set(FIRE_WEATHER_EVENTS.map((e) => e.toLowerCase()));

/**
 * Classify an alert into one of our two overlays, or null to discard it.
 * The exact-name sets are checked first, then a keyword fallback so newly
 * introduced product names (NWS renamed "Excessive Heat" to "Extreme Heat" in
 * 2025) still land in the right layer.
 */
export function classifyAlert(event: string | undefined): AlertKind | null {
  if (!event) return null;
  const normalized = event.trim().toLowerCase();

  if (HEAT_SET.has(normalized)) return 'heat';
  if (FIRE_SET.has(normalized)) return 'fire';

  if (normalized.includes('heat')) return 'heat';
  if (normalized.includes('red flag') || normalized.includes('fire weather')) return 'fire';
  if (normalized.includes('fire danger')) return 'fire';

  return null;
}

function normalizeSeverity(raw: string | undefined): AlertSeverity {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'extreme':
      return 'Extreme';
    case 'severe':
      return 'Severe';
    case 'moderate':
      return 'Moderate';
    case 'minor':
      return 'Minor';
    default:
      return 'Unknown';
  }
}

/**
 * Pull the UGC zone codes an alert applies to.
 * `affectedZones` holds API URLs like `.../zones/forecast/CAZ017`; the trailing
 * path segment is the code. `geocode.UGC` carries the same codes directly and
 * is used as a fallback.
 */
function extractZoneCodes(properties: NwsAlertFeature['properties']): string[] {
  const codes = new Set<string>();

  for (const url of properties?.affectedZones ?? []) {
    const segment = url.split('/').pop();
    if (segment) codes.add(segment.toUpperCase());
  }
  for (const code of properties?.geocode?.UGC ?? []) {
    if (code) codes.add(code.toUpperCase());
  }

  return [...codes];
}

/**
 * Merge several zone polygons into one MultiPolygon footprint.
 *
 * This is a geometric union only in the loose sense — the rings are collected
 * rather than dissolved, so interior borders between adjacent zones remain.
 * Rendered with a flat fill and a single outline pass that is invisible, and it
 * avoids pulling in a full topology library for a cosmetic detail.
 */
function combineZoneGeometries(
  codes: string[],
  zoneIndex: ZoneGeometryIndex,
): GeoJSON.MultiPolygon | null {
  const polygons: GeoJSON.Position[][][] = [];

  for (const code of codes) {
    const geometry = zoneIndex.get(code);
    if (!geometry) continue;

    if (geometry.type === 'Polygon') {
      polygons.push(geometry.coordinates);
    } else {
      polygons.push(...geometry.coordinates);
    }
  }

  if (polygons.length === 0) return null;
  return { type: 'MultiPolygon', coordinates: polygons };
}

/**
 * Build the UGC → geometry lookup from the NWS zones endpoint.
 * Zones without geometry are skipped rather than stored as null so callers can
 * treat a hit as guaranteed-usable.
 */
export function buildZoneIndex(payload: unknown): ZoneGeometryIndex {
  const index: ZoneGeometryIndex = new Map();
  const collection = payload as { features?: Array<{ geometry: GeoJSON.Geometry | null; properties?: { id?: string } }> };

  for (const feature of collection?.features ?? []) {
    const code = feature.properties?.id;
    const geometry = feature.geometry;
    if (!code || !geometry) continue;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
    index.set(code.toUpperCase(), geometry);
  }

  return index;
}

/**
 * Convert the alerts feed into the shared model, keeping only heat and fire
 * weather products and resolving zone-based geometry where possible.
 *
 * Alerts that end up with no geometry are still returned: they carry real
 * information (the area description and headline), and the UI lists them even
 * when it cannot draw them.
 */
export function normalizeAlerts(
  payload: unknown,
  zoneIndex: ZoneGeometryIndex = new Map(),
): WeatherAlert[] {
  const collection = payload as NwsAlertCollection;
  const alerts: WeatherAlert[] = [];

  for (const feature of collection?.features ?? []) {
    const properties = feature.properties;
    const event = properties?.event;
    const kind = classifyAlert(event);
    if (!kind || !event) continue;

    const zoneCodes = extractZoneCodes(properties);

    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
    const raw = feature.geometry;
    if (raw?.type === 'Polygon' || raw?.type === 'MultiPolygon') {
      geometry = raw;
    } else if (zoneCodes.length > 0) {
      geometry = combineZoneGeometries(zoneCodes, zoneIndex);
    }

    const alert: WeatherAlert = {
      id: properties?.id ?? properties?.['@id'] ?? feature.id ?? `${event}-${alerts.length}`,
      kind,
      event,
      severity: normalizeSeverity(properties?.severity),
      geometry,
    };

    if (properties?.headline) alert.headline = properties.headline;
    if (properties?.description) alert.description = properties.description;
    if (properties?.instruction) alert.instruction = properties.instruction;
    if (properties?.certainty) alert.certainty = properties.certainty;
    if (properties?.urgency) alert.urgency = properties.urgency;
    if (properties?.areaDesc) alert.areaDescription = properties.areaDesc;
    if (properties?.senderName) alert.senderName = properties.senderName;
    if (properties?.onset) alert.onset = properties.onset;
    if (properties?.effective) alert.effective = properties.effective;

    const expires = properties?.expires ?? properties?.ends;
    if (expires) alert.expires = expires;
    if (zoneCodes.length > 0) alert.zoneCodes = zoneCodes;

    alerts.push(alert);
  }

  return alerts;
}
