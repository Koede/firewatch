import type { SmokeDensity, SmokePlume } from '@firewatch/shared';
import { indexAttributes, pickDate, pickNumber, pickString, type Attributes } from './fieldUtils.js';

/**
 * Normalizes NOAA Hazard Mapping System smoke plumes.
 *
 * HMS plumes are drawn by satellite analysts from GOES imagery and classified
 * into three density bands. The published density column is a PM2.5 estimate in
 * µg/m³ (nominally 5 / 16 / 27 for light / medium / heavy) but older files and
 * the Esri mirror use the words instead, so both encodings are handled.
 */

/** Map the density column — numeric µg/m³ or a word — onto the three bands. */
export function parseDensity(value: unknown): SmokeDensity {
  if (value === null || value === undefined) return 'light';

  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isFinite(numeric)) {
    // HMS uses 5 / 16 / 27 µg/m³ as the class midpoints.
    if (numeric >= 22) return 'heavy';
    if (numeric >= 10) return 'medium';
    return 'light';
  }

  const text = String(value).trim().toLowerCase();
  if (text.startsWith('heav')) return 'heavy';
  if (text.startsWith('med')) return 'medium';
  return 'light';
}

/**
 * HMS timestamps look like `2026227 1750` — a zero-padded year + day-of-year,
 * then UTC HHMM. Nothing standard parses that, so convert it explicitly.
 * ISO strings from the Esri mirror pass through the normal date path instead.
 */
export function parseHmsTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();

  const match = /^(\d{4})(\d{3})\s*(\d{2})(\d{2})$/.exec(text);
  if (match) {
    const [, year, dayOfYear, hour, minute] = match;
    const date = new Date(Date.UTC(Number(year), 0, 1, Number(hour), Number(minute)));
    date.setUTCDate(date.getUTCDate() + Number(dayOfYear) - 1);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

type SmokeFeature = {
  geometry: GeoJSON.Geometry | null;
  properties: Attributes | null;
  id?: string | number;
};

/** Convert an HMS smoke GeoJSON document into the shared model. */
export function normalizeSmoke(payload: unknown): SmokePlume[] {
  const collection = payload as { features?: SmokeFeature[] };
  const plumes: SmokePlume[] = [];

  for (const feature of collection?.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;

    const attrs = feature.properties ?? {};
    const index = indexAttributes(attrs);

    const rawDensity = index.get('density') ?? index.get('smoke_density') ?? index.get('dense');
    const density = parseDensity(rawDensity);

    const plume: SmokePlume = {
      id:
        (feature.id !== undefined ? String(feature.id) : undefined) ??
        pickString(index, 'OBJECTID', 'ID') ??
        `smoke-${plumes.length}`,
      density,
      geometry: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    };

    const pm25 = pickNumber(index, {}, 'Density', 'PM25', 'pm25');
    if (pm25 !== undefined) plume.pm25 = pm25;

    const start = parseHmsTimestamp(index.get('start')) ?? pickDate(index, 'Start', 'StartTime');
    if (start) plume.start = start;

    const end = parseHmsTimestamp(index.get('end')) ?? pickDate(index, 'End', 'EndTime');
    if (end) plume.end = end;

    const satellite = pickString(index, 'Satellite', 'SAT');
    if (satellite) plume.satellite = satellite;

    plumes.push(plume);
  }

  // Heavy plumes last so they paint on top of the lighter ones.
  const order: Record<SmokeDensity, number> = { light: 0, medium: 1, heavy: 2 };
  plumes.sort((a, b) => order[a.density] - order[b.density]);
  return plumes;
}

/**
 * Minimal KML → smoke plume parser for the days when NOAA publishes KML but the
 * GeoJSON mirror is missing.
 *
 * Deliberately not a general KML implementation: it walks Placemarks, reads the
 * SimpleData/Data fields HMS writes, and pulls polygon rings. Anything more
 * exotic in the document is ignored rather than throwing, because a partial
 * smoke layer still beats no smoke layer.
 */
export function normalizeSmokeKml(kml: string): SmokePlume[] {
  const plumes: SmokePlume[] = [];
  const placemarks = kml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];

  placemarks.forEach((placemark, i) => {
    // HMS writes attributes as <SimpleData name="Density">…</SimpleData> or
    // <Data name="Density"><value>…</value></Data> depending on the generator.
    const attrs: Attributes = {};
    for (const m of placemark.matchAll(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/g)) {
      attrs[m[1]!] = m[2]!.trim();
    }
    for (const m of placemark.matchAll(
      /<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/g,
    )) {
      attrs[m[1]!] = m[2]!.trim();
    }

    const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(placemark);
    if (nameMatch && attrs.Density === undefined) {
      // Plume name is often just the density word, e.g. "Heavy Smoke".
      attrs.Density = nameMatch[1]!.trim();
    }

    const rings: GeoJSON.Position[][] = [];
    for (const ring of placemark.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const positions: GeoJSON.Position[] = [];
      for (const token of ring[1]!.trim().split(/\s+/)) {
        const [lng, lat] = token.split(',').map(Number);
        if (Number.isFinite(lng) && Number.isFinite(lat)) positions.push([lng!, lat!]);
      }
      // A valid linear ring needs at least four positions and must be closed.
      if (positions.length >= 4) {
        const first = positions[0]!;
        const last = positions[positions.length - 1]!;
        if (first[0] !== last[0] || first[1] !== last[1]) positions.push(first);
        rings.push(positions);
      }
    }

    if (rings.length === 0) return;

    const index = indexAttributes(attrs);
    const plume: SmokePlume = {
      id: `smoke-kml-${i}`,
      density: parseDensity(attrs.Density),
      geometry: { type: 'Polygon', coordinates: rings },
    };

    const start = parseHmsTimestamp(attrs.Start);
    if (start) plume.start = start;
    const end = parseHmsTimestamp(attrs.End);
    if (end) plume.end = end;
    const satellite = pickString(index, 'Satellite');
    if (satellite) plume.satellite = satellite;

    plumes.push(plume);
  });

  return plumes;
}
