import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIncidents, normalizePerimeters } from './wfigs.js';

/**
 * WFIGS adapter tests.
 *
 * The fixtures below reproduce the quirks the real NIFC service actually
 * exhibits — epoch-millisecond dates, `-1` used as "unknown", the string
 * `'Null'` in text columns, and column names that have been renamed across
 * schema revisions. These are the failure modes that silently empty the detail
 * panel, and they cannot be caught by type checking alone.
 */

/** A feature carrying the field names and encodings WFIGS actually returns. */
function wfigsFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [-120.62, 39.32] },
    properties: {
      IrwinID: '8B0A1C3E-0000-4000-8000-000000000001',
      IncidentName: 'Ridgeline',
      UniqueFireIdentifier: '2026-CASHF-000412',
      IncidentTypeCategory: 'WF',
      DailyAcres: 18432.4,
      PercentContained: 35,
      FireCause: 'Human',
      FireCauseGeneral: 'Equipment and vehicle use',
      FireCauseSpecific: 'Vehicle exhaust',
      IsFireCauseInvestigated: 'Y',
      POOJurisdictionalAgency: 'USFS',
      POOProtectingAgency: 'USFS',
      POOLandownerCategory: 'Federal',
      POOState: 'US-CA',
      POOCounty: 'Shasta',
      TotalIncidentPersonnel: 1284,
      IncidentManagementOrganization: 'Type 1 IMT',
      // ArcGIS serves date columns as epoch milliseconds.
      FireDiscoveryDateTime: 1_755_000_000_000,
      ModifiedOnDateTime_dt: Date.now(),
      ...overrides,
    },
  };
}

function collection(features: ReturnType<typeof wfigsFeature>[]) {
  return { type: 'FeatureCollection' as const, features };
}

describe('normalizeIncidents', () => {
  test('maps the core reporting fields a reader asks for first', () => {
    const [fire] = normalizeIncidents(collection([wfigsFeature()]));

    assert.ok(fire);
    assert.equal(fire.name, 'Ridgeline');
    assert.equal(fire.acres, 18432.4);
    assert.equal(fire.percentContained, 35);
    assert.equal(fire.cause.category, 'Human');
    assert.equal(fire.cause.specific, 'Vehicle exhaust');
    assert.equal(fire.cause.underInvestigation, true);
    assert.equal(fire.responsibleParties.jurisdictionalAgency, 'USFS');
    assert.equal(fire.resources.totalPersonnel, 1284);
    assert.equal(fire.resources.managementOrganization, 'Type 1 IMT');
    assert.deepEqual(fire.position, [-120.62, 39.32]);
  });

  test('converts ArcGIS epoch-millisecond dates to ISO strings', () => {
    const [fire] = normalizeIncidents(collection([wfigsFeature()]));
    assert.equal(fire!.timestamps.discovered, new Date(1_755_000_000_000).toISOString());
  });

  test('treats negative sentinels as missing rather than real values', () => {
    // WFIGS uses -1 for "unknown" in several numeric columns. Carrying that
    // through would sort a fire of unknown size below a 0-acre fire and would
    // render "-1 acres" in the panel.
    const [fire] = normalizeIncidents(
      collection([wfigsFeature({ DailyAcres: -1, TotalIncidentPersonnel: -1 })]),
    );
    assert.equal(fire!.acres, undefined);
    assert.equal(fire!.resources.totalPersonnel, undefined);
  });

  test('treats the string "Null" as missing', () => {
    const [fire] = normalizeIncidents(
      collection([wfigsFeature({ FireCauseSpecific: 'Null', POOCounty: '' })]),
    );
    assert.equal(fire!.cause.specific, undefined);
    assert.equal(fire!.location.county, undefined);
  });

  test('falls back through renamed acreage columns', () => {
    // A schema revision that drops DailyAcres should degrade to CalculatedAcres
    // rather than showing the fire as sizeless.
    const props = wfigsFeature().properties as Record<string, unknown>;
    delete props.DailyAcres;
    const [fire] = normalizeIncidents(
      collection([wfigsFeature({ DailyAcres: undefined, CalculatedAcres: 9001 })]),
    );
    assert.equal(fire!.acres, 9001);
  });

  test('reads coordinates from attributes when geometry is absent', () => {
    const feature = wfigsFeature({ InitialLatitude: 41.5, InitialLongitude: -122.1 });
    const fires = normalizeIncidents(
      collection([{ ...feature, geometry: null as never }]),
    );
    assert.equal(fires.length, 1);
    assert.deepEqual(fires[0]!.position, [-122.1, 41.5]);
  });

  test('drops records that cannot be placed on the map', () => {
    // A marker at [0,0] in the Gulf of Guinea is worse than no marker.
    const feature = wfigsFeature();
    const fires = normalizeIncidents(
      collection([{ ...feature, geometry: { type: 'Point', coordinates: [0, 0] } }]),
    );
    assert.equal(fires.length, 0);
  });

  test('excludes prescribed burns unless explicitly requested', () => {
    const features = collection([
      wfigsFeature(),
      wfigsFeature({ IncidentTypeCategory: 'RX', IncidentName: 'Unit 7 Broadcast Burn' }),
    ]);

    assert.equal(normalizeIncidents(features).length, 1);
    assert.equal(normalizeIncidents(features, { includePrescribed: true }).length, 2);
  });

  test('marks a fire inactive once it is declared out', () => {
    const [fire] = normalizeIncidents(
      collection([wfigsFeature({ FireOutDateTime: Date.now() - 3_600_000 })]),
    );
    assert.equal(fire!.isActive, false);
  });

  test('marks a fully contained fire with a containment date inactive', () => {
    const [fire] = normalizeIncidents(
      collection([
        wfigsFeature({ PercentContained: 100, ContainmentDateTime: Date.now() - 7_200_000 }),
      ]),
    );
    assert.equal(fire!.isActive, false);
  });

  test('ages out incidents that stopped reporting long ago', () => {
    const twoMonthsAgo = Date.now() - 60 * 86_400_000;
    const [fire] = normalizeIncidents(
      collection([wfigsFeature({ ModifiedOnDateTime_dt: twoMonthsAgo })]),
    );
    assert.equal(fire!.isActive, false);
  });

  test('sorts largest fire first', () => {
    const fires = normalizeIncidents(
      collection([
        wfigsFeature({ IncidentName: 'Small', DailyAcres: 12, IrwinID: 'a' }),
        wfigsFeature({ IncidentName: 'Large', DailyAcres: 90_000, IrwinID: 'b' }),
      ]),
    );
    assert.equal(fires[0]!.name, 'Large');
  });

  test('builds an InciWeb link only when the incident is published there', () => {
    const withId = normalizeIncidents(collection([wfigsFeature({ InciWebID: '9421' })]));
    assert.match(withId[0]!.inciWebUrl!, /9421$/);

    const without = normalizeIncidents(collection([wfigsFeature()]));
    assert.equal(without[0]!.inciWebUrl, undefined);
  });

  test('rejects a payload that is not a FeatureCollection', () => {
    // ArcGIS can answer 200 with an error object; that must not look like
    // "zero fires burning".
    assert.throws(() => normalizeIncidents({ error: { code: 400 } }), /FeatureCollection/);
  });

  test('converts a fractional containment value to a percentage', () => {
    const [fire] = normalizeIncidents(collection([wfigsFeature({ PercentContained: 0.45 })]));
    assert.equal(fire!.percentContained, 45);
  });
});

describe('normalizePerimeters', () => {
  const polygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-120.7, 39.2],
        [-120.5, 39.2],
        [-120.5, 39.4],
        [-120.7, 39.4],
        [-120.7, 39.2],
      ],
    ],
  };

  test('reads the prefixed column names the perimeter service uses', () => {
    // The perimeter layer is a join, so its columns arrive prefixed with
    // `poly_` and `attr_` rather than matching the incident layer.
    const perimeters = normalizePerimeters({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: polygon,
          properties: {
            poly_IRWINID: '8B0A1C3E-0000-4000-8000-000000000001',
            poly_IncidentName: 'Ridgeline',
            poly_GISAcres: 18_500,
            poly_DateCurrent: 1_755_000_000_000,
          },
        },
      ],
    });

    assert.equal(perimeters.length, 1);
    assert.equal(perimeters[0]!.name, 'Ridgeline');
    assert.equal(perimeters[0]!.gisAcres, 18_500);
    assert.equal(perimeters[0]!.irwinId, '8B0A1C3E-0000-4000-8000-000000000001');
  });

  test('skips non-polygon geometry', () => {
    const perimeters = normalizePerimeters({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
        { type: 'Feature', geometry: null, properties: {} },
      ],
    });
    assert.equal(perimeters.length, 0);
  });
});
