import type {
  AirQualityObservation,
  ApiResponse,
  FireDetection,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  WeatherAlert,
} from '@firewatch/shared';
import { cache } from './cache.js';
import { CONFIG, SOURCES, dateTokens, expandUrlTemplate } from './config.js';
import { fetchFromCandidates, parseText } from './fetcher.js';
import { normalizeAirQuality } from './adapters/airnow.js';
import { normalizeDetections } from './adapters/firms.js';
import { normalizeSmoke, normalizeSmokeKml } from './adapters/hms.js';
import { buildZoneIndex, normalizeAlerts, type ZoneGeometryIndex } from './adapters/nws.js';
import { normalizeIncidents, normalizePerimeters } from './adapters/wfigs.js';
import { getHealth, recordFailure, recordSuccess } from './health.js';
import {
  DEMO_AIR_QUALITY,
  DEMO_ALERTS,
  DEMO_INCIDENTS,
  DEMO_PERIMETERS,
  DEMO_SMOKE,
} from './demo/dataset.js';

/**
 * One loading pipeline shared by every feed: cache → candidate URLs → normalize
 * → record health → fall back to demo data.
 *
 * Centralizing it means a new source only has to describe how to fetch and how
 * to normalize, and it inherits caching, retries, health reporting and graceful
 * degradation for free.
 */
async function loadSource<T>(
  sourceId: string,
  options: {
    /** Cache key, when it varies by request (bounding box, day). */
    cacheKey?: string;
    /** URL templates to expand; defaults to the source's candidates. */
    urls?: string[];
    /** Token substitutions applied to each candidate URL. */
    vars?: Record<string, string>;
    /** Parse + normalize an upstream response into the shared model. */
    normalize: (raw: unknown, resolvedUrl: string) => T[];
    /** Read the response as text rather than JSON (CSV and KML sources). */
    asText?: boolean;
    /** Sample data served when the upstream fails. */
    fallback: T[];
  },
): Promise<ApiResponse<T[]>> {
  const source = SOURCES[sourceId];
  if (!source) throw new Error(`Unknown source "${sourceId}"`);

  // A source needing an unset API key is disabled, not broken — say so plainly.
  if (source.requiresApiKey && !process.env[source.requiresApiKey]) {
    return { data: [], health: getHealth(sourceId) };
  }

  const key = options.cacheKey ? `${sourceId}:${options.cacheKey}` : sourceId;
  const urls = (options.urls ?? source.candidates).map((url) =>
    expandUrlTemplate(url, { ...dateTokens(), ...options.vars }),
  );

  try {
    const result = await cache.get(key, source.ttlSeconds, async () => {
      const outcome = await fetchFromCandidates<unknown>(source, urls, {
        ...(options.asText ? { parse: parseText as (r: Response) => Promise<unknown> } : {}),
      });
      return {
        items: options.normalize(outcome.value, outcome.resolvedUrl),
        resolvedUrl: outcome.resolvedUrl,
      };
    });

    recordSuccess(sourceId, {
      resolvedUrl: result.value.resolvedUrl,
      featureCount: result.value.items.length,
      storedAt: result.storedAt,
      stale: result.stale,
    });

    return { data: result.value.items, health: getHealth(sourceId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const useFallback = CONFIG.fallbackEnabled && options.fallback.length > 0;

    recordFailure(sourceId, message, useFallback);
    console.error(`[firewatch] source "${sourceId}" failed: ${message}`);

    return { data: useFallback ? options.fallback : [], health: getHealth(sourceId) };
  }
}

/** Active wildfire incidents — the feed behind the clickable fire markers. */
export function getIncidents(options: { includePrescribed?: boolean } = {}) {
  return loadSource<FireIncident>('incidents', {
    cacheKey: options.includePrescribed ? 'with-rx' : 'wf-only',
    normalize: (raw) =>
      normalizeIncidents(raw, { includePrescribed: options.includePrescribed ?? false }),
    fallback: DEMO_INCIDENTS,
  });
}

/** Mapped fire perimeters. */
export function getPerimeters() {
  return loadSource<FirePerimeter>('perimeters', {
    normalize: (raw) => normalizePerimeters(raw),
    fallback: DEMO_PERIMETERS,
  });
}

/**
 * NOAA HMS smoke plumes.
 *
 * HMS publishes one file per UTC day and the current day's file does not exist
 * until the first analysis is issued, so today and yesterday are both offered as
 * candidates. The response can be GeoJSON or KML depending on which mirror
 * answered, so the content is sniffed rather than assumed.
 */
export function getSmoke() {
  const today = dateTokens();
  const yesterday = dateTokens(new Date(Date.now() - 86_400_000));

  const source = SOURCES.smoke!;
  const urls = [
    ...source.candidates.map((u) => expandUrlTemplate(u, today)),
    ...source.candidates.map((u) => expandUrlTemplate(u, yesterday)),
  ];

  return loadSource<SmokePlume>('smoke', {
    urls,
    asText: true,
    normalize: (raw) => {
      const text = String(raw).trim();
      if (text.startsWith('<')) return normalizeSmokeKml(text);
      return normalizeSmoke(JSON.parse(text));
    },
    fallback: DEMO_SMOKE,
  });
}

/**
 * NWS forecast zone geometry, cached for a day and used to give zone-based
 * alerts a footprint. A failure here degrades the alert layers rather than
 * failing them, so it never throws.
 */
async function getZoneIndex(): Promise<ZoneGeometryIndex> {
  const source = SOURCES.zones!;
  try {
    const result = await cache.get('zones:index', source.ttlSeconds, async () => {
      const outcome = await fetchFromCandidates<unknown>(source, source.candidates);
      return buildZoneIndex(outcome.value);
    });
    return result.value;
  } catch (error) {
    console.warn(
      `[firewatch] zone geometry unavailable, zone-based alerts will not be drawn: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return new Map();
  }
}

/**
 * Heat advisories and fire danger alerts.
 *
 * Both overlays come from one NWS request. `kind` filters the result rather
 * than triggering a second fetch, so the two layers stay consistent with each
 * other and cost one upstream call.
 */
export async function getAlerts(kind?: 'heat' | 'fire'): Promise<ApiResponse<WeatherAlert[]>> {
  const zoneIndex = await getZoneIndex();

  const response = await loadSource<WeatherAlert>('alerts', {
    normalize: (raw) => normalizeAlerts(raw, zoneIndex),
    fallback: DEMO_ALERTS,
  });

  if (!kind) return response;
  return { ...response, data: response.data.filter((alert) => alert.kind === kind) };
}

/**
 * AirNow ground observations for a bounding box.
 *
 * AirNow requires an explicit time window; the last three hours is requested so
 * a monitor that has not reported this hour still appears.
 */
export function getAirQuality(bbox: string) {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 3_600_000);
  const stamp = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;

  return loadSource<AirQualityObservation>('airQuality', {
    cacheKey: bbox,
    vars: {
      BBOX: bbox,
      START: stamp(start),
      END: stamp(end),
      KEY: CONFIG.airNowApiKey,
    },
    normalize: (raw) => normalizeAirQuality(raw),
    fallback: DEMO_AIR_QUALITY,
  });
}

/** NASA FIRMS satellite thermal detections for a bounding box. */
export function getDetections(bbox: string) {
  return loadSource<FireDetection>('detections', {
    cacheKey: `${bbox}:${CONFIG.firmsDataset}:${CONFIG.firmsDays}`,
    asText: true,
    vars: {
      KEY: CONFIG.firmsMapKey,
      DATASET: CONFIG.firmsDataset,
      BBOX: bbox,
      DAYS: String(CONFIG.firmsDays),
    },
    normalize: (raw) => normalizeDetections(String(raw), CONFIG.firmsDataset.replace(/_NRT$/, '')),
    // No demo detections: the hotspot layer is explicitly opt-in and showing
    // invented satellite detections would misrepresent a measurement product.
    fallback: [],
  });
}
