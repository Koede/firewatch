import type {
  AirQualityObservation,
  ApiResponse,
  FireDetection,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  SourceHealth,
  WeatherAlert,
} from '@firewatch/shared';

/**
 * Typed client for the Firewatch API.
 *
 * Every data call returns the payload *and* the source's health, so a caller
 * can never render an empty layer without also knowing whether the feed failed.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checkedAt: string;
  fallbackEnabled: boolean;
  sources: SourceHealth[];
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Response was not JSON; the status line is the best message available.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

/** `west,south,east,north` for the API's bbox parameters. */
export type BBoxParam = [number, number, number, number];

function bboxQuery(bbox?: BBoxParam): string {
  if (!bbox) return '';
  return `?bbox=${bbox.map((n) => n.toFixed(4)).join(',')}`;
}

export const api = {
  fires(
    options: { activeOnly?: boolean; minAcres?: number; includePrescribed?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<ApiResponse<FireIncident[]>> {
    const params = new URLSearchParams();
    if (options.activeOnly) params.set('activeOnly', 'true');
    if (options.includePrescribed) params.set('includePrescribed', 'true');
    if (options.minAcres !== undefined) params.set('minAcres', String(options.minAcres));
    const query = params.toString();
    return request(`/fires${query ? `?${query}` : ''}`, signal);
  },

  perimeters(signal?: AbortSignal): Promise<ApiResponse<FirePerimeter[]>> {
    return request('/perimeters', signal);
  },

  smoke(signal?: AbortSignal): Promise<ApiResponse<SmokePlume[]>> {
    return request('/smoke', signal);
  },

  alerts(kind?: 'heat' | 'fire', signal?: AbortSignal): Promise<ApiResponse<WeatherAlert[]>> {
    return request(`/alerts${kind ? `?kind=${kind}` : ''}`, signal);
  },

  airQuality(bbox?: BBoxParam, signal?: AbortSignal): Promise<ApiResponse<AirQualityObservation[]>> {
    return request(`/air-quality${bboxQuery(bbox)}`, signal);
  },

  detections(bbox?: BBoxParam, signal?: AbortSignal): Promise<ApiResponse<FireDetection[]>> {
    return request(`/detections${bboxQuery(bbox)}`, signal);
  },

  health(signal?: AbortSignal): Promise<HealthReport> {
    return request('/health', signal);
  },
};

export { ApiError };
