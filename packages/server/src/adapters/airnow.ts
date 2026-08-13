import type { AirQualityObservation } from '@firewatch/shared';
import { aqiToCategory } from '@firewatch/shared';

/**
 * Normalizes EPA AirNow ground-monitor observations.
 *
 * During a smoke event PM2.5 is the pollutant that matters, so observations are
 * keyed on it and ozone is kept only as secondary context. AirNow reports one
 * row per monitor per parameter per hour; rows for the same site are collapsed
 * so a station shows one marker at its worst current AQI rather than several
 * stacked markers.
 */

interface AirNowRow {
  Latitude?: number;
  Longitude?: number;
  UTC?: string;
  Parameter?: string;
  Unit?: string;
  Value?: number;
  RawConcentration?: number;
  AQI?: number;
  Category?: number;
  SiteName?: string;
  AgencyName?: string;
  FullAQSCode?: string;
  IntlAQSCode?: string;
  ReportingArea?: string;
  StateCode?: string;
}

/** AirNow marks missing readings with -999 rather than null. */
function cleanNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value <= -900) return undefined;
  return value;
}

/** Normalize AirNow's parameter spellings to a stable label. */
function normalizeParameter(raw: string | undefined): string {
  const text = (raw ?? '').trim().toUpperCase();
  if (text === 'PM2.5' || text === 'PM25') return 'PM2.5';
  if (text === 'PM10') return 'PM10';
  if (text === 'OZONE' || text === 'O3') return 'OZONE';
  return text || 'UNKNOWN';
}

/**
 * Convert AirNow's JSON rows into observations.
 *
 * When a site reports several parameters, the row with the highest AQI wins,
 * matching how AirNow itself reports a location's headline AQI.
 */
export function normalizeAirQuality(payload: unknown): AirQualityObservation[] {
  const rows = Array.isArray(payload) ? (payload as AirNowRow[]) : [];
  const bySite = new Map<string, AirQualityObservation>();

  for (const row of rows) {
    const lat = cleanNumber(row.Latitude);
    const lng = cleanNumber(row.Longitude);
    if (lat === undefined || lng === undefined) continue;

    const aqi = cleanNumber(row.AQI);
    const parameter = normalizeParameter(row.Parameter);

    const siteKey =
      row.FullAQSCode ??
      row.IntlAQSCode ??
      `${lat.toFixed(4)},${lng.toFixed(4)}`;

    const observation: AirQualityObservation = {
      id: siteKey,
      position: [lng, lat],
      parameter,
    };

    const areaName = row.ReportingArea ?? row.SiteName;
    if (areaName) observation.areaName = areaName;
    if (row.StateCode) observation.stateCode = row.StateCode;

    const concentration = cleanNumber(row.RawConcentration) ?? cleanNumber(row.Value);
    if (concentration !== undefined) observation.concentration = concentration;
    if (row.Unit) observation.unit = row.Unit;

    if (aqi !== undefined) {
      observation.aqi = aqi;
      observation.category = aqiToCategory(aqi);
    } else if (row.Category && row.Category >= 1 && row.Category <= 6) {
      observation.category = row.Category as AirQualityObservation['category'];
    }

    if (row.UTC) {
      // AirNow returns `2026-08-13T17:00` with no zone marker; it is always UTC.
      const iso = row.UTC.endsWith('Z') ? row.UTC : `${row.UTC}:00Z`.replace(/:00:00Z$/, ':00Z');
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) observation.observedAt = parsed.toISOString();
    }

    const existing = bySite.get(siteKey);
    if (!existing || (observation.aqi ?? -1) > (existing.aqi ?? -1)) {
      bySite.set(siteKey, observation);
    }
  }

  return [...bySite.values()];
}
