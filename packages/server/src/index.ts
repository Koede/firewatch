import express, { type Request, type Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { CONFIG, SOURCES } from './config.js';
import { cache } from './cache.js';
import { getAllHealth } from './health.js';
import {
  getAirQuality,
  getAlerts,
  getDetections,
  getIncidents,
  getPerimeters,
  getSmoke,
} from './dataService.js';

/**
 * Firewatch API server.
 *
 * It proxies and normalizes the public wildfire feeds rather than letting the
 * browser call them directly. That buys three things the client cannot get on
 * its own: CORS-free access to agency endpoints that do not send the headers,
 * one shared cache instead of every visitor hammering NIFC, and API keys that
 * stay on the server.
 */

const app = express();

app.use(cors({ origin: CONFIG.corsOrigin }));
app.use(compression());
app.disable('x-powered-by');

/** Log each API call with its duration, for spotting slow upstreams. */
app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`[firewatch] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});

/**
 * Validate a `west,south,east,north` bounding box.
 * Returned to the caller as a 400 rather than forwarded, so a malformed box
 * fails here instead of producing a confusing upstream error.
 */
function parseBbox(raw: unknown, fallback: string): { bbox: string } | { error: string } {
  if (raw === undefined) return { bbox: fallback };

  const parts = String(raw).split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { error: 'bbox must be four comma-separated numbers: west,south,east,north' };
  }

  const [west, south, east, north] = parts as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return { error: 'bbox coordinates are out of range' };
  }
  if (west >= east || south >= north) {
    return { error: 'bbox must satisfy west < east and south < north' };
  }

  return { bbox: `${west},${south},${east},${north}` };
}

/** Continental US, used when a request omits its bounding box. */
const CONUS_BBOX = '-125,24,-66,50';

/** Wrap an async handler so a rejection becomes a 500 instead of a hang. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[firewatch] unhandled error on ${req.originalUrl}: ${message}`);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error', detail: message });
    });
  };
}

// ---------------------------------------------------------------------------
// Data routes
// ---------------------------------------------------------------------------

app.get(
  '/api/fires',
  handle(async (req, res) => {
    const includePrescribed = req.query.includePrescribed === 'true';
    const response = await getIncidents({ includePrescribed });

    // Optional filters, applied server-side so the client ships less JSON.
    let fires = response.data;
    if (req.query.activeOnly === 'true') fires = fires.filter((f) => f.isActive);

    const minAcres = Number.parseFloat(String(req.query.minAcres ?? ''));
    if (Number.isFinite(minAcres)) fires = fires.filter((f) => (f.acres ?? 0) >= minAcres);

    const state = String(req.query.state ?? '').trim().toUpperCase();
    if (state) fires = fires.filter((f) => f.location.state?.toUpperCase() === state);

    res.json({ ...response, data: fires });
  }),
);

app.get(
  '/api/fires/:id',
  handle(async (req, res) => {
    const response = await getIncidents({ includePrescribed: true });
    const fire = response.data.find(
      (f) => f.id === req.params.id || f.irwinId === req.params.id,
    );

    if (!fire) {
      res.status(404).json({ error: `No incident found with id "${req.params.id}"` });
      return;
    }

    // Attach the matching perimeter so the detail panel can show mapped acreage.
    const perimeters = await getPerimeters();
    const perimeter = fire.irwinId
      ? perimeters.data.find((p) => p.irwinId === fire.irwinId)
      : undefined;

    res.json({ data: { ...fire, perimeter: perimeter ?? null }, health: response.health });
  }),
);

app.get(
  '/api/perimeters',
  handle(async (_req, res) => {
    res.json(await getPerimeters());
  }),
);

app.get(
  '/api/smoke',
  handle(async (_req, res) => {
    res.json(await getSmoke());
  }),
);

app.get(
  '/api/alerts',
  handle(async (req, res) => {
    const kindParam = String(req.query.kind ?? '').trim().toLowerCase();
    if (kindParam && kindParam !== 'heat' && kindParam !== 'fire') {
      res.status(400).json({ error: 'kind must be "heat" or "fire"' });
      return;
    }
    res.json(await getAlerts(kindParam === 'heat' || kindParam === 'fire' ? kindParam : undefined));
  }),
);

app.get(
  '/api/air-quality',
  handle(async (req, res) => {
    const parsed = parseBbox(req.query.bbox, CONUS_BBOX);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await getAirQuality(parsed.bbox));
  }),
);

app.get(
  '/api/detections',
  handle(async (req, res) => {
    const parsed = parseBbox(req.query.bbox, CONUS_BBOX);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await getDetections(parsed.bbox));
  }),
);

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Per-source health. The client polls this to drive the status bar, and it is
 * the first thing to check when a layer looks empty.
 */
app.get('/api/health', (_req, res) => {
  const sources = getAllHealth();
  const degraded = sources.filter((s) => s.status !== 'ok' && s.status !== 'disabled');

  res.json({
    status: degraded.length === 0 ? 'ok' : 'degraded',
    checkedAt: new Date().toISOString(),
    cache: cache.getStats(),
    fallbackEnabled: CONFIG.fallbackEnabled,
    sources,
  });
});

/** The source registry, so the UI can render attributions and provider links. */
app.get('/api/sources', (_req, res) => {
  res.json(
    Object.values(SOURCES).map((source) => ({
      id: source.id,
      label: source.label,
      attribution: source.attribution,
      homepage: source.homepage,
      requiresApiKey: source.requiresApiKey ?? null,
      ttlSeconds: source.ttlSeconds,
    })),
  );
});

/** Drop cached upstream responses; useful when a feed has just recovered. */
app.post('/api/cache/flush', (_req, res) => {
  cache.clear();
  res.json({ flushed: true, at: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Static client (production builds)
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../web/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API path serves the app shell.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`[firewatch] API listening on http://${CONFIG.host}:${CONFIG.port}`);
  if (!CONFIG.firmsMapKey) {
    console.log('[firewatch] FIRMS_MAP_KEY not set — satellite hotspot layer is disabled.');
  }
  if (!CONFIG.airNowApiKey) {
    console.log('[firewatch] AIRNOW_API_KEY not set — AQI station layer falls back to contour tiles.');
  }
});

export { app };
