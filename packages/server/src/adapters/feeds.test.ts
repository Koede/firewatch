import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmoke, normalizeSmokeKml, parseDensity, parseHmsTimestamp } from './hms.js';
import { normalizeDetections } from './firms.js';
import { buildZoneIndex, classifyAlert, normalizeAlerts } from './nws.js';
import { normalizeAirQuality } from './airnow.js';

/**
 * Tests for the smoke, satellite, weather-alert and air-quality adapters.
 *
 * Each fixture mirrors the encoding its real provider uses, including the
 * awkward parts: NOAA's day-of-year timestamps, FIRMS' CSV-with-a-plain-text-
 * error-body behavior, and NWS alerts that carry no geometry at all.
 */

describe('HMS smoke', () => {
  test('classifies density from the published µg/m³ midpoints', () => {
    assert.equal(parseDensity(5), 'light');
    assert.equal(parseDensity(16), 'medium');
    assert.equal(parseDensity(27), 'heavy');
  });

  test('classifies density from word encodings used by the mirrors', () => {
    assert.equal(parseDensity('Heavy'), 'heavy');
    assert.equal(parseDensity('medium'), 'medium');
    assert.equal(parseDensity('Light Smoke'), 'light');
  });

  test('parses NOAA year + day-of-year timestamps', () => {
    // `2026227 1750` is 2026, day 227, 17:50 UTC — day 227 of 2026 is Aug 15.
    const iso = parseHmsTimestamp('2026227 1750');
    assert.equal(iso, '2026-08-15T17:50:00.000Z');
  });

  test('still accepts ISO timestamps from the Esri mirror', () => {
    assert.equal(parseHmsTimestamp('2026-08-13T12:00:00Z'), '2026-08-13T12:00:00.000Z');
  });

  test('orders plumes so heavy smoke paints over light', () => {
    const plumes = normalizeSmoke({
      type: 'FeatureCollection',
      features: [
        makeSmokeFeature(27),
        makeSmokeFeature(5),
        makeSmokeFeature(16),
      ],
    });
    assert.deepEqual(
      plumes.map((p) => p.density),
      ['light', 'medium', 'heavy'],
    );
  });

  test('parses polygons out of the KML fallback', () => {
    const kml = `<?xml version="1.0"?><kml><Document>
      <Placemark>
        <name>Heavy Smoke</name>
        <ExtendedData><SchemaData>
          <SimpleData name="Density">27.000</SimpleData>
          <SimpleData name="Satellite">GOES-EAST</SimpleData>
          <SimpleData name="Start">2026227 1750</SimpleData>
        </SchemaData></ExtendedData>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          -120.5,39.1 -120.2,39.1 -120.2,39.4 -120.5,39.4 -120.5,39.1
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </Document></kml>`;

    const plumes = normalizeSmokeKml(kml);
    assert.equal(plumes.length, 1);
    assert.equal(plumes[0]!.density, 'heavy');
    assert.equal(plumes[0]!.satellite, 'GOES-EAST');
    assert.equal(plumes[0]!.geometry.type, 'Polygon');
    assert.equal((plumes[0]!.geometry as GeoJSON.Polygon).coordinates[0]!.length, 5);
  });

  test('ignores KML placemarks with no usable ring', () => {
    const kml = '<kml><Placemark><name>Light</name></Placemark></kml>';
    assert.equal(normalizeSmokeKml(kml).length, 0);
  });
});

function makeSmokeFeature(density: number) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-120, 39],
          [-119, 39],
          [-119, 40],
          [-120, 40],
          [-120, 39],
        ],
      ],
    },
    properties: { Density: density, Satellite: 'GOES-WEST' },
  };
}

describe('FIRMS detections', () => {
  const csv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
    '39.32145,-120.62210,331.2,0.42,0.38,2026-08-13,1012,N,VIIRS,n,2.0NRT,289.4,18.7,D',
    '39.33001,-120.61002,367.9,0.42,0.38,2026-08-13,1012,N,VIIRS,h,2.0NRT,301.1,142.3,D',
  ].join('\n');

  test('parses rows into detections with intensity and timing', () => {
    const detections = normalizeDetections(csv, 'VIIRS_NOAA20');
    assert.equal(detections.length, 2);
    assert.deepEqual(detections[0]!.position, [-120.6221, 39.32145]);
    assert.equal(detections[0]!.brightnessK, 331.2);
    assert.equal(detections[0]!.frpMw, 18.7);
    assert.equal(detections[0]!.daynight, 'D');
    assert.equal(detections[0]!.acquiredAt, '2026-08-13T10:12:00.000Z');
  });

  test('expands the single-letter confidence codes', () => {
    const detections = normalizeDetections(csv, 'VIIRS_NOAA20');
    assert.equal(detections[0]!.confidence, 'nominal');
    assert.equal(detections[1]!.confidence, 'high');
  });

  test('rejects the plain-text error body FIRMS returns for a bad key', () => {
    // FIRMS answers 200 with prose when a key is invalid or over quota.
    // Parsing that as an empty CSV would render "no fires detected".
    assert.throws(
      () => normalizeDetections('Invalid MAP_KEY. Please check your key.', 'VIIRS'),
      /not a detection CSV/,
    );
  });

  test('returns nothing for a header-only response', () => {
    assert.deepEqual(normalizeDetections('latitude,longitude,frp', 'VIIRS'), []);
  });
});

describe('NWS alerts', () => {
  test('routes heat and fire-weather products to their own layers', () => {
    assert.equal(classifyAlert('Red Flag Warning'), 'fire');
    assert.equal(classifyAlert('Fire Weather Watch'), 'fire');
    assert.equal(classifyAlert('Extreme Heat Warning'), 'heat');
    assert.equal(classifyAlert('Heat Advisory'), 'heat');
  });

  test('still routes renamed products by keyword', () => {
    // NWS replaced "Excessive Heat" with "Extreme Heat"; an unrecognized but
    // clearly heat-related product should not vanish from the map.
    assert.equal(classifyAlert('Excessive Heat Warning'), 'heat');
    assert.equal(classifyAlert('Exceptional Heat Emergency'), 'heat');
  });

  test('discards products belonging to neither layer', () => {
    assert.equal(classifyAlert('Winter Storm Warning'), null);
    assert.equal(classifyAlert(undefined), null);
  });

  test('joins zone geometry onto alerts that arrive without any', () => {
    // Heat and red-flag products are zone-based and carry `geometry: null`.
    // Without the join, both layers would be nearly empty.
    const zoneIndex = buildZoneIndex({
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[-122, 38], [-121, 38], [-121, 39], [-122, 39], [-122, 38]]],
          },
          properties: { id: 'CAZ017' },
        },
      ],
    });

    const alerts = normalizeAlerts(
      {
        features: [
          {
            geometry: null,
            properties: {
              id: 'urn:oid:demo.1',
              event: 'Red Flag Warning',
              severity: 'Severe',
              areaDesc: 'Northern Sacramento Valley',
              affectedZones: ['https://api.weather.gov/zones/forecast/CAZ017'],
            },
          },
        ],
      },
      zoneIndex,
    );

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.geometry?.type, 'MultiPolygon');
    assert.deepEqual(alerts[0]!.zoneCodes, ['CAZ017']);
  });

  test('keeps an alert with unresolvable geometry so its text still surfaces', () => {
    const alerts = normalizeAlerts({
      features: [
        {
          geometry: null,
          properties: {
            id: 'urn:oid:demo.2',
            event: 'Heat Advisory',
            severity: 'Moderate',
            areaDesc: 'Maricopa County',
            affectedZones: ['https://api.weather.gov/zones/forecast/AZZ999'],
          },
        },
      ],
    });

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.geometry, null);
    assert.equal(alerts[0]!.areaDescription, 'Maricopa County');
  });

  test('prefers a storm-based polygon over the zone join', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[-120, 39], [-119, 39], [-119, 40], [-120, 40], [-120, 39]]],
    };
    const alerts = normalizeAlerts({
      features: [
        {
          geometry: polygon,
          properties: { id: 'x', event: 'Red Flag Warning', severity: 'Severe' },
        },
      ],
    });
    assert.equal(alerts[0]!.geometry?.type, 'Polygon');
  });
});

describe('AirNow observations', () => {
  test('keeps the worst reading when a site reports several pollutants', () => {
    // AirNow emits one row per parameter; a station should render as one marker
    // at its headline AQI, matching how airnow.gov reports it.
    const observations = normalizeAirQuality([
      {
        Latitude: 38.58,
        Longitude: -121.49,
        UTC: '2026-08-13T17:00',
        Parameter: 'OZONE',
        Unit: 'PPB',
        Value: 44,
        AQI: 41,
        Category: 1,
        FullAQSCode: '060670006',
        ReportingArea: 'Sacramento',
        StateCode: 'CA',
      },
      {
        Latitude: 38.58,
        Longitude: -121.49,
        UTC: '2026-08-13T17:00',
        Parameter: 'PM2.5',
        Unit: 'UG/M3',
        Value: 42.8,
        AQI: 118,
        Category: 3,
        FullAQSCode: '060670006',
        ReportingArea: 'Sacramento',
        StateCode: 'CA',
      },
    ]);

    assert.equal(observations.length, 1);
    assert.equal(observations[0]!.aqi, 118);
    assert.equal(observations[0]!.parameter, 'PM2.5');
    assert.equal(observations[0]!.category, 3);
  });

  test('treats -999 as a missing reading', () => {
    const observations = normalizeAirQuality([
      {
        Latitude: 40.58,
        Longitude: -122.39,
        Parameter: 'PM2.5',
        Value: -999,
        AQI: -999,
        FullAQSCode: '060890009',
      },
    ]);
    assert.equal(observations[0]!.aqi, undefined);
    assert.equal(observations[0]!.concentration, undefined);
  });

  test('skips rows with no position', () => {
    assert.deepEqual(normalizeAirQuality([{ Parameter: 'PM2.5', AQI: 50 }]), []);
  });

  test('handles a non-array payload without throwing', () => {
    assert.deepEqual(normalizeAirQuality({ error: 'bad key' }), []);
  });
});
