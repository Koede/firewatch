import { CONFIG, type SourceDefinition } from './config.js';

/**
 * Fetching against public agency endpoints, which fail in more ways than a
 * normal API: a service is renamed between seasons, an ArcGIS instance returns
 * HTTP 200 with a JSON error body, a NOAA mirror times out under fire-season
 * load. This module walks the candidate URLs until something usable answers and
 * records exactly what happened for the health endpoint.
 */

export interface FetchAttempt {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  durationMs: number;
}

export interface FetchOutcome<T> {
  value: T;
  resolvedUrl: string;
  attempts: FetchAttempt[];
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly attempts: FetchAttempt[],
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Sleep helper for backoff between retries. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ArcGIS returns `{"error": {"code": 400, "message": "..."}}` with HTTP 200.
 * Treating that as success would silently produce an empty map, so detect it.
 */
function assertNotArcGisError(payload: unknown, url: string): void {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: { message?: string; code?: number } }).error;
    if (err) {
      throw new Error(
        `ArcGIS error ${err.code ?? '?'} from ${url}: ${err.message ?? 'unknown error'}`,
      );
    }
  }
}

/**
 * Fetch one URL with a timeout, returning parsed JSON or raw text.
 * `parse` decides the content handling so CSV sources share this path.
 */
async function fetchOnce<T>(
  url: string,
  timeoutMs: number,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // api.weather.gov requires a self-identifying User-Agent.
        'User-Agent': CONFIG.userAgent,
        Accept: 'application/geo+json, application/json, text/csv, */*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status} ${response.statusText}`), {
        status: response.status,
      });
    }

    return await parse(response);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try each candidate URL in order, retrying transient failures, and return the
 * first usable response along with a full record of what was attempted.
 *
 * `validate` lets a caller reject a technically-successful response that is not
 * actually usable — for example a GeoJSON document containing zero features
 * when the previous candidate might do better.
 */
export async function fetchFromCandidates<T>(
  source: SourceDefinition,
  urls: string[],
  options: {
    parse?: (response: Response) => Promise<T>;
    validate?: (value: T) => boolean;
  } = {},
): Promise<FetchOutcome<T>> {
  const parse =
    options.parse ??
    (async (response: Response) => {
      const payload = (await response.json()) as T;
      assertNotArcGisError(payload, response.url);
      return payload;
    });

  const attempts: FetchAttempt[] = [];
  const timeoutMs = source.timeoutMs ?? 30_000;

  for (const url of urls) {
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      try {
        const value = await fetchOnce(url, timeoutMs, parse);

        if (options.validate && !options.validate(value)) {
          throw new Error('Response passed validation checks but contained no usable features');
        }

        attempts.push({ url, ok: true, status: 200, durationMs: Date.now() - startedAt });
        return { value, resolvedUrl: url, attempts };
      } catch (error) {
        const err = error as Error & { status?: number };
        const isAbort = err.name === 'AbortError';
        attempts.push({
          url,
          ok: false,
          status: err.status,
          error: isAbort ? `Timed out after ${timeoutMs}ms` : err.message,
          durationMs: Date.now() - startedAt,
        });

        // 4xx responses other than 429 will not improve on retry.
        const status = err.status;
        const worthRetrying =
          isAbort || status === undefined || status === 429 || (status >= 500 && status < 600);

        if (!worthRetrying || attempt === CONFIG.maxRetries) break;

        await delay(500 * 2 ** attempt);
      }
    }
  }

  const summary = attempts
    .filter((a) => !a.ok)
    .map((a) => `${a.url.split('?')[0]} → ${a.error ?? 'failed'}`)
    .join('; ');

  throw new UpstreamError(
    `All ${urls.length} candidate URL(s) failed for source "${source.id}". ${summary}`,
    attempts,
  );
}

/** Parse a response as text, for the CSV and KML sources. */
export const parseText = async (response: Response): Promise<string> => response.text();
