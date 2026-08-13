import type {
  AirQualityObservation,
  FireDetection,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  WeatherAlert,
} from '@firewatch/shared';
import { aqiCategoryInfo } from '@firewatch/shared';

/**
 * Converts the normalized model into GeoJSON for MapLibre.
 *
 * Only the properties the style expressions actually read are copied onto each
 * feature. MapLibre serializes feature properties across to the worker on every
 * update, so shipping the full incident record — a hundred fields per fire —
 * would cost real frame time for data the renderer never looks at. The full
 * record stays in React state and is looked up by id on click.
 */

export function firesToGeoJson(
  fires: FireIncident[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: fires.map((fire) => ({
      type: 'Feature',
      id: hashId(fire.id),
      geometry: { type: 'Point', coordinates: fire.position },
      properties: {
        id: fire.id,
        name: fire.name,
        acres: fire.acres ?? 0,
        percentContained: fire.percentContained ?? -1,
        isActive: fire.isActive,
        // Pre-computed so the style expression stays a simple lookup.
        sizeClass: sizeClass(fire.acres),
        state: fire.location.state ?? '',
      },
    })),
  };
}

export function perimetersToGeoJson(
  perimeters: FirePerimeter[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: perimeters.map((perimeter) => ({
      type: 'Feature',
      id: hashId(perimeter.id),
      geometry: perimeter.geometry,
      properties: {
        id: perimeter.id,
        irwinId: perimeter.irwinId ?? '',
        name: perimeter.name ?? '',
        gisAcres: perimeter.gisAcres ?? 0,
      },
    })),
  };
}

export function smokeToGeoJson(
  plumes: SmokePlume[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: plumes.map((plume) => ({
      type: 'Feature',
      id: hashId(plume.id),
      geometry: plume.geometry,
      properties: {
        id: plume.id,
        density: plume.density,
        pm25: plume.pm25 ?? 0,
        satellite: plume.satellite ?? '',
        start: plume.start ?? '',
        end: plume.end ?? '',
      },
    })),
  };
}

export function alertsToGeoJson(
  alerts: WeatherAlert[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: alerts
      // Alerts whose zone geometry could not be resolved have nothing to draw.
      .filter((alert): alert is WeatherAlert & { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon } =>
        alert.geometry !== null,
      )
      .map((alert) => ({
        type: 'Feature',
        id: hashId(alert.id),
        geometry: alert.geometry,
        properties: {
          id: alert.id,
          event: alert.event,
          kind: alert.kind,
          severity: alert.severity,
          headline: alert.headline ?? '',
          areaDescription: alert.areaDescription ?? '',
        },
      })),
  };
}

export function airQualityToGeoJson(
  observations: AirQualityObservation[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: observations.map((observation) => {
      const info = observation.category ? aqiCategoryInfo(observation.category) : undefined;
      return {
        type: 'Feature',
        id: hashId(observation.id),
        geometry: { type: 'Point', coordinates: observation.position },
        properties: {
          id: observation.id,
          aqi: observation.aqi ?? -1,
          category: observation.category ?? 0,
          color: info?.color ?? '#9aa0a6',
          areaName: observation.areaName ?? '',
          parameter: observation.parameter,
          label: observation.aqi !== undefined ? String(Math.round(observation.aqi)) : '—',
        },
      };
    }),
  };
}

export function detectionsToGeoJson(
  detections: FireDetection[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: detections.map((detection) => ({
      type: 'Feature',
      id: hashId(detection.id),
      geometry: { type: 'Point', coordinates: detection.position },
      properties: {
        id: detection.id,
        frp: detection.frpMw ?? 0,
        brightness: detection.brightnessK ?? 0,
        confidence: typeof detection.confidence === 'string' ? detection.confidence : 'nominal',
        acquiredAt: detection.acquiredAt ?? '',
      },
    })),
  };
}

/** Bucket acreage into the five size classes used for marker sizing. */
function sizeClass(acres: number | undefined): number {
  if (acres === undefined) return 0;
  if (acres >= 100_000) return 4;
  if (acres >= 10_000) return 3;
  if (acres >= 1_000) return 2;
  if (acres >= 100) return 1;
  return 0;
}

/**
 * MapLibre feature state requires numeric or string ids, and `setFeatureState`
 * only accepts the id it was given at load time. Incident ids are UUIDs, so
 * they are hashed to a stable 32-bit integer for hover and selection state.
 */
export function hashId(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
