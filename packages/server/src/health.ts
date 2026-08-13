import type { SourceHealth, SourceStatus } from '@firewatch/shared';
import { SOURCES, type SourceDefinition } from './config.js';

/**
 * Tracks the last known state of every upstream feed.
 *
 * The UI uses this to distinguish "no fires in this area" from "the fire feed
 * is down", which on a situational-awareness map is the difference between
 * useful and dangerously misleading.
 */

interface HealthRecord {
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  resolvedUrl?: string;
  featureCount?: number;
  error?: string;
  usingFallback?: boolean;
}

const records = new Map<string, HealthRecord>();

export function recordSuccess(
  sourceId: string,
  details: { resolvedUrl: string; featureCount: number; storedAt?: number; stale?: boolean },
): void {
  const existing = records.get(sourceId) ?? {};
  records.set(sourceId, {
    ...existing,
    lastSuccessAt: details.storedAt ?? Date.now(),
    lastAttemptAt: Date.now(),
    resolvedUrl: details.resolvedUrl,
    featureCount: details.featureCount,
    usingFallback: false,
    // A stale serve keeps the previous error visible so the cause is not lost.
    error: details.stale ? existing.error : undefined,
  });
}

export function recordFailure(sourceId: string, error: string, usingFallback: boolean): void {
  const existing = records.get(sourceId) ?? {};
  records.set(sourceId, {
    ...existing,
    lastAttemptAt: Date.now(),
    error,
    usingFallback,
  });
}

/** Mark a source as intentionally off because its API key is not configured. */
export function recordDisabled(sourceId: string, reason: string): void {
  records.set(sourceId, { ...records.get(sourceId), error: reason, usingFallback: false });
}

/** Derive the status enum from the record and the source's staleness budget. */
function deriveStatus(
  source: SourceDefinition,
  record: HealthRecord,
  keyMissing: boolean,
): SourceStatus {
  if (keyMissing) return 'disabled';
  if (record.usingFallback) return 'degraded';
  if (!record.lastSuccessAt) return record.error ? 'unavailable' : 'degraded';

  const ageSeconds = (Date.now() - record.lastSuccessAt) / 1000;
  if (ageSeconds > source.staleAfterSeconds) return 'stale';
  return record.error ? 'degraded' : 'ok';
}

/** Is the API key this source needs actually configured? */
function isKeyMissing(source: SourceDefinition): boolean {
  if (!source.requiresApiKey) return false;
  return !process.env[source.requiresApiKey];
}

export function getHealth(sourceId: string): SourceHealth {
  const source = SOURCES[sourceId];
  if (!source) {
    return {
      id: sourceId,
      label: sourceId,
      status: 'unavailable',
      attribution: 'Unknown source',
      error: `No source definition registered for "${sourceId}"`,
    };
  }

  const record = records.get(sourceId) ?? {};
  const keyMissing = isKeyMissing(source);

  const health: SourceHealth = {
    id: source.id,
    label: source.label,
    status: deriveStatus(source, record, keyMissing),
    attribution: source.attribution,
  };

  if (record.resolvedUrl) health.resolvedUrl = record.resolvedUrl;
  if (record.lastSuccessAt) {
    health.lastSuccessAt = new Date(record.lastSuccessAt).toISOString();
    health.ageSeconds = Math.round((Date.now() - record.lastSuccessAt) / 1000);
  }
  if (record.featureCount !== undefined) health.featureCount = record.featureCount;
  if (record.error) health.error = record.error;
  if (record.usingFallback) health.usingFallback = true;
  if (keyMissing) {
    health.requiresApiKey = true;
    health.error = `Set ${source.requiresApiKey} to enable this layer.`;
  }

  return health;
}

/** Health for every registered source, for the /api/health endpoint. */
export function getAllHealth(): SourceHealth[] {
  return Object.keys(SOURCES).map(getHealth);
}
