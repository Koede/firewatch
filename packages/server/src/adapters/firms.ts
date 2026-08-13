import type { FireDetection } from '@firewatch/shared';

/**
 * Normalizes NASA FIRMS satellite thermal anomalies.
 *
 * FIRMS serves CSV, not JSON. Each row is a single hot pixel detected by VIIRS
 * or MODIS — typically 375 m or 1 km across — so a large fire produces hundreds
 * of rows. These are the freshest signal on the map (minutes to a few hours old
 * versus a day for incident reports) but carry no incident metadata, which is
 * why they are rendered as a heat/point layer rather than as clickable fires.
 */

/**
 * Split a CSV line on commas outside double quotes.
 * FIRMS output is simple, but satellite names can contain commas in some
 * datasets, and a naive `split(',')` would shift every later column.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Parse a numeric cell, returning undefined for blanks and non-numbers. */
function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Combine FIRMS' separate date and time columns into one ISO timestamp.
 * `acq_date` is `YYYY-MM-DD` and `acq_time` is UTC `HHMM`, usually unpadded.
 */
function toIso(acqDate: string | undefined, acqTime: string | undefined): string | undefined {
  if (!acqDate) return undefined;
  const padded = (acqTime ?? '0000').padStart(4, '0');
  const iso = `${acqDate}T${padded.slice(0, 2)}:${padded.slice(2, 4)}:00Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Expand FIRMS' single-letter confidence codes used by the VIIRS products. */
function normalizeConfidence(raw: string | undefined): string | number | undefined {
  if (!raw) return undefined;
  const text = raw.trim().toLowerCase();
  if (text === 'l') return 'low';
  if (text === 'n') return 'nominal';
  if (text === 'h') return 'high';
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : text;
}

/**
 * Parse a FIRMS CSV response into detections.
 *
 * FIRMS returns a plain-text error message with HTTP 200 when a key is invalid
 * or over quota, so a response without the expected header is rejected rather
 * than silently yielding zero detections.
 */
export function normalizeDetections(csv: string, satelliteLabel: string): FireDetection[] {
  const lines = csv.trim().split(/\r?\n/);

  // Validate the header before checking row count. A bad key produces a
  // single line of prose, which would otherwise take the "no rows" path and
  // render as "no fires detected" rather than surfacing the error.
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.trim().toLowerCase());
  if (!header.includes('latitude') || !header.includes('longitude')) {
    throw new Error(
      `FIRMS response was not a detection CSV — received: ${(lines[0] ?? '').slice(0, 160)}`,
    );
  }

  if (lines.length < 2) return [];

  const col = (name: string): number => header.indexOf(name);
  const iLat = col('latitude');
  const iLng = col('longitude');
  const iBright = col('bright_ti4') >= 0 ? col('bright_ti4') : col('brightness');
  const iFrp = col('frp');
  const iConfidence = col('confidence');
  const iDate = col('acq_date');
  const iTime = col('acq_time');
  const iSatellite = col('satellite');
  const iDaynight = col('daynight');

  const detections: FireDetection[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;

    const cells = splitCsvLine(line);
    const lat = num(cells[iLat]);
    const lng = num(cells[iLng]);
    if (lat === undefined || lng === undefined) continue;

    const detection: FireDetection = {
      id: `firms-${i}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      position: [lng, lat],
    };

    const brightness = iBright >= 0 ? num(cells[iBright]) : undefined;
    if (brightness !== undefined) detection.brightnessK = brightness;

    const frp = iFrp >= 0 ? num(cells[iFrp]) : undefined;
    if (frp !== undefined) detection.frpMw = frp;

    const confidence = iConfidence >= 0 ? normalizeConfidence(cells[iConfidence]) : undefined;
    if (confidence !== undefined) detection.confidence = confidence;

    const acquiredAt = toIso(cells[iDate], cells[iTime]);
    if (acquiredAt) detection.acquiredAt = acquiredAt;

    const satellite = iSatellite >= 0 ? cells[iSatellite]?.trim() : undefined;
    detection.satellite = satellite ? `${satelliteLabel} (${satellite})` : satelliteLabel;

    const daynight = iDaynight >= 0 ? cells[iDaynight]?.trim().toUpperCase() : undefined;
    if (daynight === 'D' || daynight === 'N') detection.daynight = daynight;

    detections.push(detection);
  }

  return detections;
}
