import type {
  AirQualityObservation,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  WeatherAlert,
} from '@firewatch/shared';

/**
 * A small synthetic dataset served when an upstream feed is unreachable.
 *
 * This exists so the map is never mysteriously blank — during development, on a
 * restricted network, or when an agency service is down mid-season. It is
 * clearly labelled as sample data everywhere it surfaces: responses set
 * `health.usingFallback`, and the UI shows a persistent banner.
 *
 * The incidents are invented. Place names and agencies are real so the panel
 * renders realistically, but no incident here describes a real fire.
 */

const HOURS = 3_600_000;
const now = Date.now();
const iso = (hoursAgo: number): string => new Date(now - hoursAgo * HOURS).toISOString();

export const DEMO_INCIDENTS: FireIncident[] = [
  {
    id: 'demo-ridgeline',
    irwinId: 'demo-0000-0000-0000-000000000001',
    uniqueFireId: '2026-CASHF-000412',
    name: 'Ridgeline Fire',
    position: [-120.6219, 39.3241],
    incidentType: 'WF',
    acres: 18_432,
    initialResponseAcres: 240,
    percentContained: 35,
    isActive: true,
    sourceId: 'incidents',
    shortDescription:
      'Burning in steep, inaccessible terrain north of the river drainage. Crews are constructing direct line on the eastern flank.',
    fireBehavior: 'Running. Spotting. Group tree torching.',
    cause: {
      category: 'Human',
      general: 'Equipment and vehicle use',
      specific: 'Vehicle exhaust',
      underInvestigation: true,
    },
    responsibleParties: {
      jurisdictionalAgency: 'USFS',
      jurisdictionalUnit: 'CA-SHF Shasta-Trinity National Forest',
      protectingAgency: 'USFS',
      protectingUnit: 'CA-SHF',
      landownerCategory: 'Federal',
      landownerKind: 'Federal',
      gacc: 'NOCC',
      dispatchCenter: 'CA-RRCC',
      unifiedCommand: true,
      multiJurisdictional: true,
    },
    resources: {
      totalPersonnel: 1_284,
      crews: 34,
      engines: 96,
      helicopters: 11,
      airtankers: 4,
      dozers: 18,
      waterTenders: 22,
      managementOrganization: 'Type 1 IMT',
      complexityLevel: 'Type 1',
    },
    impacts: {
      structuresDestroyed: 42,
      structuresThreatened: 1_850,
      residencesDestroyed: 31,
      residencesThreatened: 1_400,
      otherStructuresDestroyed: 11,
      injuries: 3,
      fatalities: 0,
      estimatedCostToDate: 28_400_000,
      evacuationStatus: 'Mandatory evacuation orders in effect for zones SHU-1120 and SHU-1121.',
    },
    location: {
      state: 'CA',
      county: 'Shasta',
      city: 'French Gulch',
      fuelGroup: 'Timber',
      primaryFuelModel: '10 - Timber (litter and understory)',
    },
    timestamps: {
      discovered: iso(196),
      lastUpdated: iso(2),
    },
    inciWebUrl: 'https://inciweb.wildfire.gov/',
  },
  {
    id: 'demo-alkali-flat',
    irwinId: 'demo-0000-0000-0000-000000000002',
    uniqueFireId: '2026-NVEKD-000188',
    name: 'Alkali Flat Fire',
    position: [-117.0921, 40.7712],
    incidentType: 'WF',
    acres: 64_190,
    initialResponseAcres: 1_100,
    percentContained: 72,
    isActive: true,
    sourceId: 'incidents',
    shortDescription:
      'Wind-driven fire in cheatgrass and sagebrush. Growth has moderated with overnight humidity recovery.',
    fireBehavior: 'Creeping. Smoldering. Isolated torching.',
    cause: { category: 'Natural', general: 'Natural', specific: 'Lightning' },
    responsibleParties: {
      jurisdictionalAgency: 'BLM',
      jurisdictionalUnit: 'NV-EKD Elko District',
      protectingAgency: 'BLM',
      protectingUnit: 'NV-EKD',
      landownerCategory: 'Federal',
      gacc: 'GBCC',
      dispatchCenter: 'NV-EIC',
      unifiedCommand: false,
      multiJurisdictional: false,
    },
    resources: {
      totalPersonnel: 412,
      crews: 9,
      engines: 38,
      helicopters: 3,
      dozers: 7,
      waterTenders: 12,
      managementOrganization: 'Type 3 Organization',
      complexityLevel: 'Type 3',
    },
    impacts: {
      structuresDestroyed: 0,
      structuresThreatened: 24,
      injuries: 1,
      fatalities: 0,
      estimatedCostToDate: 6_100_000,
    },
    location: {
      state: 'NV',
      county: 'Elko',
      fuelGroup: 'Grass',
      primaryFuelModel: '2 - Timber (grass and understory)',
    },
    timestamps: { discovered: iso(310), lastUpdated: iso(5) },
  },
  {
    id: 'demo-cedar-hollow',
    irwinId: 'demo-0000-0000-0000-000000000003',
    uniqueFireId: '2026-ORWIF-000077',
    name: 'Cedar Hollow Fire',
    position: [-122.4431, 44.0582],
    incidentType: 'WF',
    acres: 2_140,
    percentContained: 90,
    isActive: true,
    sourceId: 'incidents',
    fireBehavior: 'Smoldering.',
    cause: {
      category: 'Human',
      general: 'Recreation and ceremony',
      specific: 'Campfire',
      underInvestigation: false,
    },
    responsibleParties: {
      jurisdictionalAgency: 'ODF',
      jurisdictionalUnit: 'OR-WIF Willamette National Forest',
      protectingAgency: 'ODF',
      landownerCategory: 'State',
      gacc: 'NWCC',
      dispatchCenter: 'OR-CCC',
    },
    resources: {
      totalPersonnel: 138,
      crews: 4,
      engines: 12,
      helicopters: 1,
      dozers: 2,
      waterTenders: 4,
      managementOrganization: 'Type 4 Organization',
      complexityLevel: 'Type 4',
    },
    impacts: { structuresDestroyed: 0, structuresThreatened: 0, injuries: 0, fatalities: 0 },
    location: { state: 'OR', county: 'Linn', fuelGroup: 'Timber' },
    timestamps: { discovered: iso(140), contained: iso(9), lastUpdated: iso(9) },
  },
  {
    id: 'demo-mesa-verde-rim',
    irwinId: 'demo-0000-0000-0000-000000000004',
    uniqueFireId: '2026-AZCNF-000301',
    name: 'Mesa Rim Fire',
    position: [-110.9012, 34.2287],
    incidentType: 'WF',
    acres: 7_820,
    percentContained: 15,
    isActive: true,
    sourceId: 'incidents',
    fireBehavior: 'Running. Wind-driven runs in short grass.',
    cause: { category: 'Undetermined', underInvestigation: true },
    responsibleParties: {
      jurisdictionalAgency: 'BIA',
      jurisdictionalUnit: 'AZ-FDA Fort Apache Agency',
      protectingAgency: 'BIA',
      landownerCategory: 'Tribal',
      gacc: 'SWCC',
      dispatchCenter: 'AZ-SDC',
      multiJurisdictional: true,
    },
    resources: {
      totalPersonnel: 268,
      crews: 7,
      engines: 21,
      helicopters: 2,
      dozers: 4,
      waterTenders: 6,
      managementOrganization: 'Type 2 IMT',
      complexityLevel: 'Type 2',
    },
    impacts: { structuresThreatened: 60, injuries: 0, fatalities: 0, estimatedCostToDate: 3_250_000 },
    location: { state: 'AZ', county: 'Navajo', fuelGroup: 'Grass' },
    timestamps: { discovered: iso(64), lastUpdated: iso(1) },
  },
];

/** A rough perimeter ring around a point, used only for the demo polygons. */
function ringAround(
  [lng, lat]: [number, number],
  radiusDeg: number,
  wobble: number,
): GeoJSON.Polygon {
  const coordinates: GeoJSON.Position[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    // Deterministic pseudo-wobble so the shape looks like a fire, not a circle.
    const r = radiusDeg * (1 + wobble * Math.sin(angle * 3) * Math.cos(angle * 5));
    coordinates.push([lng + r * Math.cos(angle) * 1.3, lat + r * Math.sin(angle)]);
  }
  return { type: 'Polygon', coordinates: [coordinates] };
}

export const DEMO_PERIMETERS: FirePerimeter[] = [
  {
    id: 'demo-perimeter-ridgeline',
    irwinId: 'demo-0000-0000-0000-000000000001',
    name: 'Ridgeline Fire',
    gisAcres: 18_432,
    lastUpdated: iso(3),
    geometry: ringAround([-120.6219, 39.3241], 0.085, 0.18),
  },
  {
    id: 'demo-perimeter-alkali',
    irwinId: 'demo-0000-0000-0000-000000000002',
    name: 'Alkali Flat Fire',
    gisAcres: 64_190,
    lastUpdated: iso(6),
    geometry: ringAround([-117.0921, 40.7712], 0.16, 0.22),
  },
  {
    id: 'demo-perimeter-mesa',
    irwinId: 'demo-0000-0000-0000-000000000004',
    name: 'Mesa Rim Fire',
    gisAcres: 7_820,
    lastUpdated: iso(2),
    geometry: ringAround([-110.9012, 34.2287], 0.055, 0.25),
  },
];

/** Elongated downwind plumes, roughly tracking the demo fires to the northeast. */
function plumeShape(
  [lng, lat]: [number, number],
  length: number,
  width: number,
): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - width, lat - width * 0.6],
        [lng + length * 0.45, lat + length * 0.25],
        [lng + length, lat + length * 0.7],
        [lng + length * 0.9, lat + length * 0.95],
        [lng + length * 0.3, lat + length * 0.45],
        [lng - width * 0.8, lat + width],
        [lng - width, lat - width * 0.6],
      ],
    ],
  };
}

export const DEMO_SMOKE: SmokePlume[] = [
  {
    id: 'demo-smoke-heavy',
    density: 'heavy',
    pm25: 27,
    start: iso(6),
    end: iso(0),
    satellite: 'GOES-West',
    geometry: plumeShape([-120.62, 39.32], 2.4, 0.55),
  },
  {
    id: 'demo-smoke-medium',
    density: 'medium',
    pm25: 16,
    start: iso(6),
    end: iso(0),
    satellite: 'GOES-West',
    geometry: plumeShape([-121.1, 39.0], 5.2, 1.3),
  },
  {
    id: 'demo-smoke-light',
    density: 'light',
    pm25: 5,
    start: iso(6),
    end: iso(0),
    satellite: 'GOES-East',
    geometry: plumeShape([-122.0, 38.4], 9.5, 2.8),
  },
  {
    id: 'demo-smoke-nevada',
    density: 'medium',
    pm25: 16,
    start: iso(5),
    end: iso(0),
    satellite: 'GOES-West',
    geometry: plumeShape([-117.09, 40.77], 3.6, 0.9),
  },
];

export const DEMO_AIR_QUALITY: AirQualityObservation[] = [
  {
    id: 'demo-aq-redding',
    position: [-122.3917, 40.5865],
    areaName: 'Redding',
    stateCode: 'CA',
    parameter: 'PM2.5',
    concentration: 189.4,
    unit: 'UG/M3',
    aqi: 238,
    category: 5,
    observedAt: iso(1),
  },
  {
    id: 'demo-aq-chico',
    position: [-121.8375, 39.7285],
    areaName: 'Chico',
    stateCode: 'CA',
    parameter: 'PM2.5',
    concentration: 96.2,
    unit: 'UG/M3',
    aqi: 172,
    category: 4,
    observedAt: iso(1),
  },
  {
    id: 'demo-aq-sacramento',
    position: [-121.4944, 38.5816],
    areaName: 'Sacramento',
    stateCode: 'CA',
    parameter: 'PM2.5',
    concentration: 42.8,
    unit: 'UG/M3',
    aqi: 118,
    category: 3,
    observedAt: iso(1),
  },
  {
    id: 'demo-aq-elko',
    position: [-115.7631, 40.8324],
    areaName: 'Elko',
    stateCode: 'NV',
    parameter: 'PM2.5',
    concentration: 61.0,
    unit: 'UG/M3',
    aqi: 154,
    category: 4,
    observedAt: iso(2),
  },
  {
    id: 'demo-aq-reno',
    position: [-119.8138, 39.5296],
    areaName: 'Reno',
    stateCode: 'NV',
    parameter: 'PM2.5',
    concentration: 22.4,
    unit: 'UG/M3',
    aqi: 74,
    category: 2,
    observedAt: iso(1),
  },
  {
    id: 'demo-aq-medford',
    position: [-122.8756, 42.3265],
    areaName: 'Medford',
    stateCode: 'OR',
    parameter: 'PM2.5',
    concentration: 9.1,
    unit: 'UG/M3',
    aqi: 38,
    category: 1,
    observedAt: iso(1),
  },
  {
    id: 'demo-aq-phoenix',
    position: [-112.074, 33.4484],
    areaName: 'Phoenix',
    stateCode: 'AZ',
    parameter: 'PM2.5',
    concentration: 118.7,
    unit: 'UG/M3',
    aqi: 315,
    category: 6,
    observedAt: iso(1),
  },
];

/** A crude rectangle helper for demo alert footprints. */
function box(west: number, south: number, east: number, north: number): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

export const DEMO_ALERTS: WeatherAlert[] = [
  {
    id: 'demo-alert-redflag-norcal',
    kind: 'fire',
    event: 'Red Flag Warning',
    headline: 'Red Flag Warning in effect until 8 PM PDT for gusty winds and low humidity',
    description:
      'Southwest winds 20 to 30 mph with gusts up to 45 mph, combined with relative humidity as low as 8 percent, will produce critical fire weather conditions.',
    instruction:
      'A Red Flag Warning means critical fire weather conditions are occurring now. Any fire that develops will likely spread rapidly.',
    severity: 'Severe',
    certainty: 'Likely',
    urgency: 'Expected',
    areaDescription: 'Northern Sacramento Valley; Shasta Lake Area / Northern Shasta County',
    senderName: 'NWS Sacramento CA',
    onset: iso(4),
    expires: iso(-8),
    geometry: box(-122.6, 38.9, -120.1, 41.2),
  },
  {
    id: 'demo-alert-firewatch-nv',
    kind: 'fire',
    event: 'Fire Weather Watch',
    headline: 'Fire Weather Watch in effect from Thursday afternoon through Thursday evening',
    description:
      'Dry and breezy conditions are expected, with relative humidity dropping to 10 to 15 percent across the northern Great Basin.',
    severity: 'Moderate',
    certainty: 'Possible',
    urgency: 'Future',
    areaDescription: 'Northeastern Nevada; Elko County',
    senderName: 'NWS Elko NV',
    onset: iso(-14),
    expires: iso(-26),
    geometry: box(-117.9, 40.1, -114.9, 41.9),
  },
  {
    id: 'demo-alert-heat-central-valley',
    kind: 'heat',
    event: 'Extreme Heat Warning',
    headline: 'Extreme Heat Warning in effect until 9 PM PDT Friday',
    description:
      'Dangerously hot conditions with afternoon temperatures of 108 to 114 expected. Overnight lows near 80 will provide little relief.',
    instruction:
      'Drink plenty of fluids, stay in an air-conditioned room, and check on relatives and neighbors.',
    severity: 'Extreme',
    certainty: 'Likely',
    urgency: 'Expected',
    areaDescription: 'Central Sacramento Valley; Southern Sacramento Valley',
    senderName: 'NWS Sacramento CA',
    onset: iso(6),
    expires: iso(-30),
    geometry: box(-122.3, 36.6, -119.6, 39.3),
  },
  {
    id: 'demo-alert-heat-advisory-az',
    kind: 'heat',
    event: 'Heat Advisory',
    headline: 'Heat Advisory in effect from 10 AM to 8 PM MST',
    description: 'High temperatures of 104 to 108 expected across the lower deserts.',
    severity: 'Moderate',
    certainty: 'Likely',
    urgency: 'Expected',
    areaDescription: 'South Central Arizona; Maricopa County',
    senderName: 'NWS Phoenix AZ',
    onset: iso(2),
    expires: iso(-10),
    geometry: box(-113.4, 32.6, -110.9, 34.3),
  },
];
