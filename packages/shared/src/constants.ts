import type { AqiCategory, AqiCategoryInfo, SmokeDensity } from './types.js';

/**
 * EPA AQI breakpoints and colors, straight from the AirNow AQI Basics table.
 * Colors match the official AQI palette so the map matches airnow.gov.
 */
export const AQI_CATEGORIES: readonly AqiCategoryInfo[] = [
  {
    category: 1,
    label: 'Good',
    range: [0, 50],
    color: '#00e400',
    guidance: 'Air quality is satisfactory and air pollution poses little or no risk.',
  },
  {
    category: 2,
    label: 'Moderate',
    range: [51, 100],
    color: '#ffff00',
    guidance:
      'Unusually sensitive people should consider reducing prolonged or heavy exertion outdoors.',
  },
  {
    category: 3,
    label: 'Unhealthy for Sensitive Groups',
    range: [101, 150],
    color: '#ff7e00',
    guidance:
      'People with heart or lung disease, older adults, children and teens should reduce prolonged exertion.',
  },
  {
    category: 4,
    label: 'Unhealthy',
    range: [151, 200],
    color: '#ff0000',
    guidance:
      'Sensitive groups should avoid prolonged exertion; everyone else should reduce prolonged exertion.',
  },
  {
    category: 5,
    label: 'Very Unhealthy',
    range: [201, 300],
    color: '#8f3f97',
    guidance: 'Sensitive groups should avoid all outdoor exertion; everyone else should avoid prolonged exertion.',
  },
  {
    category: 6,
    label: 'Hazardous',
    range: [301, 500],
    color: '#7e0023',
    guidance: 'Health warning of emergency conditions. Everyone should avoid all outdoor exertion.',
  },
] as const;

/** Map an AQI value to its EPA category, clamping above 500 to Hazardous. */
export function aqiToCategory(aqi: number): AqiCategory {
  for (const info of AQI_CATEGORIES) {
    if (aqi <= info.range[1]) return info.category;
  }
  return 6;
}

/** Look up category metadata, falling back to Good for out-of-range input. */
export function aqiCategoryInfo(category: AqiCategory): AqiCategoryInfo {
  return AQI_CATEGORIES.find((c) => c.category === category) ?? AQI_CATEGORIES[0]!;
}

/**
 * Smoke plume rendering. Density is an opacity ramp rather than a hue ramp so
 * plumes read as smoke over any basemap instead of competing with fire colors.
 */
export const SMOKE_STYLE: Record<SmokeDensity, { color: string; opacity: number; label: string }> = {
  light: { color: '#d9d2c5', opacity: 0.22, label: 'Light smoke' },
  medium: { color: '#a89c8a', opacity: 0.38, label: 'Medium smoke' },
  heavy: { color: '#6f6355', opacity: 0.55, label: 'Heavy smoke' },
};

/** Fire size classes used for marker sizing and the incident list. */
export const FIRE_SIZE_CLASSES = [
  { min: 0, label: '< 100 acres', radius: 5 },
  { min: 100, label: '100 – 1,000 acres', radius: 7 },
  { min: 1000, label: '1,000 – 10,000 acres', radius: 10 },
  { min: 10000, label: '10,000 – 100,000 acres', radius: 14 },
  { min: 100000, label: '100,000+ acres', radius: 19 },
] as const;

/** Colors for NWS alert overlays, keyed by event name. */
export const ALERT_COLORS: Record<string, string> = {
  'Red Flag Warning': '#ff2d55',
  'Fire Weather Watch': '#ff9500',
  'Extreme Fire Danger': '#c2185b',
  'Extreme Heat Warning': '#c2185b',
  'Excessive Heat Warning': '#c2185b',
  'Extreme Heat Watch': '#ff6f00',
  'Excessive Heat Watch': '#ff6f00',
  'Heat Advisory': '#ff9f0a',
  'Extreme Heat Advisory': '#ff9f0a',
};

/** Event names the NWS uses for heat hazards, used to split the alerts feed. */
export const HEAT_EVENTS: readonly string[] = [
  'Extreme Heat Warning',
  'Extreme Heat Watch',
  'Extreme Heat Advisory',
  'Excessive Heat Warning',
  'Excessive Heat Watch',
  'Excessive Heat Advisory',
  'Heat Advisory',
];

/** Event names the NWS uses for fire-weather hazards. */
export const FIRE_WEATHER_EVENTS: readonly string[] = [
  'Red Flag Warning',
  'Fire Weather Watch',
  'Extreme Fire Danger',
];
