import type {
  FireIncident,
  FirePerimeter,
  IncidentTypeCategory,
  LngLat,
} from '@firewatch/shared';
import {
  indexAttributes,
  pickBoolean,
  pickCount,
  pickDate,
  pickNumber,
  pickPercent,
  pickString,
  type Attributes,
} from './fieldUtils.js';

/**
 * Normalizes the NIFC WFIGS interagency feeds.
 *
 * WFIGS (Wildland Fire Interagency Geospatial Services) is the authoritative
 * feed behind most public fire maps. Its incident-location layer carries ~100
 * columns; the ones that matter to a reader — what started it, how big, how
 * contained, who is on it — are pulled out here into the shared model.
 *
 * Field names come from the NIFC WFIGS data dictionary. Every read lists the
 * historical aliases as fallbacks so a schema revision degrades one field
 * rather than emptying the panel.
 */

type GeoJsonFeature = {
  type: 'Feature';
  geometry: GeoJSON.Geometry | null;
  properties: Attributes | null;
  id?: string | number;
};

type GeoJsonCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

/** Narrow an unknown payload to a GeoJSON FeatureCollection. */
export function asFeatureCollection(payload: unknown): GeoJsonCollection {
  if (
    payload &&
    typeof payload === 'object' &&
    (payload as GeoJsonCollection).type === 'FeatureCollection' &&
    Array.isArray((payload as GeoJsonCollection).features)
  ) {
    return payload as GeoJsonCollection;
  }
  throw new Error('Expected a GeoJSON FeatureCollection');
}

/** Extract a point position, falling back to the initial lat/long columns. */
function extractPosition(feature: GeoJsonFeature, index: Map<string, unknown>): LngLat | null {
  const geometry = feature.geometry;
  if (geometry?.type === 'Point') {
    const [lng, lat] = geometry.coordinates as [number, number];
    if (Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0)) {
      return [lng, lat];
    }
  }

  // Some records carry coordinates only as attributes.
  const lat = pickNumber(index, { allowNegative: true }, 'InitialLatitude', 'Latitude', 'Y');
  const lng = pickNumber(index, { allowNegative: true }, 'InitialLongitude', 'Longitude', 'X');
  if (lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0)) {
    return [lng, lat];
  }
  return null;
}

/** Map the WFIGS incident-type string onto the shared category enum. */
function normalizeIncidentType(raw: string | undefined): IncidentTypeCategory | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  if (upper.startsWith('WF')) return 'WF';
  if (upper.startsWith('RX')) return 'RX';
  if (upper.startsWith('CX')) return 'CX';
  return 'OT';
}

/**
 * Decide whether a fire is still burning.
 *
 * WFIGS has no single "active" flag. A fire is treated as out once it has a
 * containment/control/out date, and records that have gone quiet for a long
 * time are aged out so the map does not accumulate stale incidents.
 */
function determineActive(
  containedAt: string | undefined,
  outAt: string | undefined,
  lastUpdated: string | undefined,
  percentContained: number | undefined,
  maxAgeDays: number,
): boolean {
  if (outAt) return false;

  // 100% contained with a containment date is finished for map purposes.
  if (containedAt && percentContained !== undefined && percentContained >= 100) return false;

  if (lastUpdated) {
    const ageDays = (Date.now() - Date.parse(lastUpdated)) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > maxAgeDays) return false;
  }
  return true;
}

/** Build the public InciWeb URL for an incident, when it is published there. */
function inciWebUrl(index: Map<string, unknown>): string | undefined {
  const id = pickString(index, 'InciWebID', 'InciWeb_Id', 'inciweb_id');
  if (!id) return undefined;
  return `https://inciweb.wildfire.gov/incident-information/${id}`;
}

export interface NormalizeIncidentsOptions {
  /** Drop incidents whose last update is older than this. Default 30 days. */
  maxAgeDays?: number;
  /** Include prescribed burns alongside wildfires. Default false. */
  includePrescribed?: boolean;
}

/**
 * Convert a WFIGS incident-locations FeatureCollection into the shared model.
 * Features without a usable position are dropped — a fire that cannot be placed
 * on the map is not useful, and a marker at [0,0] is worse than none.
 */
export function normalizeIncidents(
  payload: unknown,
  options: NormalizeIncidentsOptions = {},
): FireIncident[] {
  const collection = asFeatureCollection(payload);
  const maxAgeDays = options.maxAgeDays ?? 30;
  const incidents: FireIncident[] = [];

  for (const feature of collection.features) {
    const attrs = feature.properties;
    if (!attrs) continue;

    const index = indexAttributes(attrs);
    const position = extractPosition(feature, index);
    if (!position) continue;

    const incidentTypeRaw = pickString(index, 'IncidentTypeCategory', 'IncidentTypeKind');
    const incidentType = normalizeIncidentType(incidentTypeRaw);

    // Prescribed burns share this feed with wildfires; keep them out by default.
    if (!options.includePrescribed && incidentType === 'RX') continue;

    const irwinId = pickString(index, 'IrwinID', 'IRWINID', 'irwin_id');
    const uniqueFireId = pickString(index, 'UniqueFireIdentifier', 'UniqueFireId');
    const localId = pickString(index, 'LocalIncidentIdentifier');
    const name = pickString(index, 'IncidentName', 'Incident_Name', 'FireName') ?? 'Unnamed incident';

    const id =
      irwinId ??
      uniqueFireId ??
      localId ??
      (feature.id !== undefined
        ? String(feature.id)
        : `${name}-${position[0].toFixed(4)}-${position[1].toFixed(4)}`);

    // Several acreage columns exist with different provenance; prefer the one
    // reported daily, then the GIS-calculated value, then the generic size.
    const acres = pickNumber(
      index,
      {},
      'DailyAcres',
      'CalculatedAcres',
      'IncidentSize',
      'GISAcres',
      'FinalAcres',
      'EstimatedFinalAcres',
    );

    const percentContained = pickPercent(index, 'PercentContained', 'PercentPerimeterToBeContained');
    const containedAt = pickDate(index, 'ContainmentDateTime');
    const controlledAt = pickDate(index, 'ControlDateTime');
    const outAt = pickDate(index, 'FireOutDateTime');
    const lastUpdated = pickDate(
      index,
      'ModifiedOnDateTime_dt',
      'ModifiedOnDateTime',
      'EditDate',
      'last_edited_date',
    );

    const incident: FireIncident = {
      id,
      name,
      position,
      isActive: determineActive(containedAt, outAt, lastUpdated, percentContained, maxAgeDays),
      sourceId: 'incidents',

      cause: {
        category: pickString(index, 'FireCause'),
        general: pickString(index, 'FireCauseGeneral'),
        specific: pickString(index, 'FireCauseSpecific'),
        underInvestigation: pickBoolean(index, 'IsFireCauseInvestigated'),
      },

      responsibleParties: {
        jurisdictionalAgency: pickString(index, 'POOJurisdictionalAgency'),
        jurisdictionalUnit: pickString(index, 'POOJurisdictionalUnit'),
        protectingAgency: pickString(index, 'POOProtectingAgency'),
        protectingUnit: pickString(index, 'POOProtectingUnit'),
        landownerCategory: pickString(index, 'POOLandownerCategory'),
        landownerKind: pickString(index, 'POOLandownerKind'),
        gacc: pickString(index, 'GACC', 'POOGACC'),
        dispatchCenter: pickString(index, 'POODispatchCenterID', 'DispatchCenterID'),
        unifiedCommand: pickBoolean(index, 'IsUnifiedCommand'),
        multiJurisdictional: pickBoolean(index, 'IsMultiJurisdictional'),
      },

      resources: {
        totalPersonnel: pickCount(index, 'TotalIncidentPersonnel'),
        crews: pickCount(index, 'Crews', 'TotalCrews'),
        engines: pickCount(index, 'Engines', 'TotalEngines'),
        helicopters: pickCount(index, 'Helicopters', 'TotalHelicopters'),
        airtankers: pickCount(index, 'Airtankers'),
        dozers: pickCount(index, 'Dozers', 'TotalDozers'),
        waterTenders: pickCount(index, 'WaterTenders', 'TotalWaterTenders'),
        managementOrganization: pickString(index, 'IncidentManagementOrganization'),
        complexityLevel: pickString(index, 'IncidentComplexityLevel', 'FireMgmtComplexity'),
      },

      impacts: {
        structuresDestroyed: pickCount(index, 'StructuresDestroyed'),
        structuresThreatened: pickCount(index, 'StructuresThreatened'),
        residencesDestroyed: pickCount(index, 'ResidencesDestroyed'),
        residencesThreatened: pickCount(index, 'ResidencesThreatened'),
        otherStructuresDestroyed: pickCount(index, 'OtherStructuresDestroyed'),
        injuries: pickCount(index, 'Injuries', 'InjuriesToDate'),
        fatalities: pickCount(index, 'Fatalities'),
        estimatedCostToDate: pickCount(index, 'EstimatedCostToDate'),
      },

      location: {
        state: pickString(index, 'POOState'),
        county: pickString(index, 'POOCounty'),
        city: pickString(index, 'POOCity'),
        fuelGroup: pickString(index, 'PredominantFuelGroup'),
        primaryFuelModel: pickString(index, 'PrimaryFuelModel'),
      },

      timestamps: {
        discovered: pickDate(index, 'FireDiscoveryDateTime'),
        contained: containedAt,
        controlled: controlledAt,
        out: outAt,
        lastUpdated,
      },
    };

    if (irwinId) incident.irwinId = irwinId;
    if (uniqueFireId) incident.uniqueFireId = uniqueFireId;
    if (incidentType) incident.incidentType = incidentType;
    if (incidentTypeRaw) incident.incidentTypeRaw = incidentTypeRaw;
    if (percentContained !== undefined) incident.percentContained = percentContained;
    if (acres !== undefined) incident.acres = acres;

    const initialAcres = pickNumber(index, {}, 'InitialResponseAcres', 'DiscoveryAcres');
    if (initialAcres !== undefined) incident.initialResponseAcres = initialAcres;

    const shortDescription = pickString(index, 'IncidentShortDescription');
    if (shortDescription) incident.shortDescription = shortDescription;

    const fireBehavior = pickString(index, 'FireBehaviorGeneral', 'FireBehaviorGeneral1');
    if (fireBehavior) incident.fireBehavior = fireBehavior;

    const inciWeb = inciWebUrl(index);
    if (inciWeb) incident.inciWebUrl = inciWeb;

    const complexName = pickString(index, 'CpxName', 'ComplexName');
    if (complexName) incident.complexName = complexName;

    incidents.push(incident);
  }

  // Largest first: the biggest fires are what a reader scans for.
  incidents.sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
  return incidents;
}

/** Convert the WFIGS perimeter layer into the shared model. */
export function normalizePerimeters(payload: unknown): FirePerimeter[] {
  const collection = asFeatureCollection(payload);
  const perimeters: FirePerimeter[] = [];

  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;

    const attrs = feature.properties ?? {};
    const index = indexAttributes(attrs);

    const irwinId = pickString(index, 'poly_IRWINID', 'IRWINID', 'IrwinID', 'irwin_id');
    const name = pickString(
      index,
      'poly_IncidentName',
      'IncidentName',
      'attr_IncidentName',
      'FireName',
    );

    const perimeter: FirePerimeter = {
      id:
        irwinId ??
        pickString(index, 'poly_GlobalID', 'GlobalID') ??
        (feature.id !== undefined ? String(feature.id) : `perimeter-${perimeters.length}`),
      geometry: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    };

    if (irwinId) perimeter.irwinId = irwinId;
    if (name) perimeter.name = name;

    const gisAcres = pickNumber(index, {}, 'poly_GISAcres', 'GISAcres', 'Shape__Area');
    if (gisAcres !== undefined) perimeter.gisAcres = gisAcres;

    const updated = pickDate(
      index,
      'poly_DateCurrent',
      'DateCurrent',
      'poly_PolygonDateTime',
      'attr_ModifiedOnDateTime_dt',
    );
    if (updated) perimeter.lastUpdated = updated;

    perimeters.push(perimeter);
  }

  return perimeters;
}
