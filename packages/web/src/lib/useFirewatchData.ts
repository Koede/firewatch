import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AirQualityObservation,
  FireDetection,
  FireIncident,
  FirePerimeter,
  SmokePlume,
  SourceHealth,
  WeatherAlert,
} from '@firewatch/shared';
import { api, type HealthReport } from '../api/client';

/**
 * Loads and periodically refreshes every feed the map draws.
 *
 * Feeds are fetched independently so one slow or failing source never blocks
 * the rest of the map, and each keeps its own health record. Refresh intervals
 * match how often the upstream data actually changes — polling incident reports
 * every ten seconds would just burn quota for identical bytes.
 */

export interface FirewatchData {
  fires: FireIncident[];
  perimeters: FirePerimeter[];
  smoke: SmokePlume[];
  heatAlerts: WeatherAlert[];
  fireAlerts: WeatherAlert[];
  airQuality: AirQualityObservation[];
  detections: FireDetection[];
  health: Record<string, SourceHealth>;
  report: HealthReport | null;
  /** True until the first pass over all feeds has settled. */
  loading: boolean;
  /** Feeds currently in flight, for the refresh indicator. */
  refreshing: boolean;
  lastRefreshedAt: Date | null;
  refresh: () => void;
}

/** Refresh cadence per feed, in milliseconds. */
const REFRESH_INTERVALS = {
  fires: 5 * 60_000,
  perimeters: 15 * 60_000,
  smoke: 15 * 60_000,
  alerts: 5 * 60_000,
  airQuality: 15 * 60_000,
  detections: 15 * 60_000,
  health: 60_000,
} as const;

export function useFirewatchData(options: { detectionsEnabled: boolean }): FirewatchData {
  const [fires, setFires] = useState<FireIncident[]>([]);
  const [perimeters, setPerimeters] = useState<FirePerimeter[]>([]);
  const [smoke, setSmoke] = useState<SmokePlume[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityObservation[]>([]);
  const [detections, setDetections] = useState<FireDetection[]>([]);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [inFlight, setInFlight] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Latest health per source, merged as each feed reports back. */
  const mergeHealth = useCallback((entry: SourceHealth | undefined) => {
    if (!entry) return;
    setHealth((current) => ({ ...current, [entry.id]: entry }));
  }, []);

  /**
   * Run one feed's fetch, tracking in-flight count and swallowing aborts.
   * Failures are logged rather than thrown: the server already degrades to
   * demo data, and a rejected promise here would take down the whole map.
   */
  const runFetch = useCallback(
    async <T>(
      task: () => Promise<{ data: T; health: SourceHealth }>,
      apply: (data: T) => void,
      label: string,
    ) => {
      setInFlight((n) => n + 1);
      try {
        const response = await task();
        apply(response.data);
        mergeHealth(response.health);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        console.error(`[firewatch] failed to load ${label}:`, error);
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [mergeHealth],
  );

  const detectionsEnabled = options.detectionsEnabled;

  // Keep the flag in a ref so toggling it does not restart every other feed.
  const detectionsEnabledRef = useRef(detectionsEnabled);
  detectionsEnabledRef.current = detectionsEnabled;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadFires = () => runFetch(() => api.fires({ activeOnly: true }, controller.signal), (d) => !cancelled && setFires(d), 'fires');
    const loadPerimeters = () => runFetch(() => api.perimeters(controller.signal), (d) => !cancelled && setPerimeters(d), 'perimeters');
    const loadSmoke = () => runFetch(() => api.smoke(controller.signal), (d) => !cancelled && setSmoke(d), 'smoke');
    const loadAlerts = () => runFetch(() => api.alerts(undefined, controller.signal), (d) => !cancelled && setAlerts(d), 'alerts');
    const loadAirQuality = () => runFetch(() => api.airQuality(undefined, controller.signal), (d) => !cancelled && setAirQuality(d), 'air quality');
    const loadDetections = () => {
      if (!detectionsEnabledRef.current) return Promise.resolve();
      return runFetch(() => api.detections(undefined, controller.signal), (d) => !cancelled && setDetections(d), 'detections');
    };

    const loadHealth = async () => {
      try {
        const next = await api.health(controller.signal);
        if (cancelled) return;
        setReport(next);
        setHealth(Object.fromEntries(next.sources.map((s) => [s.id, s])));
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('[firewatch] failed to load health:', error);
        }
      }
    };

    // First pass: everything at once, then mark the app as ready.
    void Promise.allSettled([
      loadFires(),
      loadPerimeters(),
      loadSmoke(),
      loadAlerts(),
      loadAirQuality(),
      loadDetections(),
      loadHealth(),
    ]).then(() => {
      if (cancelled) return;
      setLoading(false);
      setLastRefreshedAt(new Date());
    });

    const timers = [
      setInterval(() => void loadFires().then(() => setLastRefreshedAt(new Date())), REFRESH_INTERVALS.fires),
      setInterval(() => void loadPerimeters(), REFRESH_INTERVALS.perimeters),
      setInterval(() => void loadSmoke(), REFRESH_INTERVALS.smoke),
      setInterval(() => void loadAlerts(), REFRESH_INTERVALS.alerts),
      setInterval(() => void loadAirQuality(), REFRESH_INTERVALS.airQuality),
      setInterval(() => void loadDetections(), REFRESH_INTERVALS.detections),
      setInterval(() => void loadHealth(), REFRESH_INTERVALS.health),
    ];

    return () => {
      cancelled = true;
      controller.abort();
      timers.forEach(clearInterval);
    };
  }, [runFetch, refreshToken]);

  // Turning the hotspot layer on should fetch immediately, not at the next tick.
  useEffect(() => {
    if (!detectionsEnabled) return;
    const controller = new AbortController();
    void runFetch(() => api.detections(undefined, controller.signal), setDetections, 'detections');
    return () => controller.abort();
  }, [detectionsEnabled, runFetch]);

  const { heatAlerts, fireAlerts } = useMemo(
    () => ({
      heatAlerts: alerts.filter((a) => a.kind === 'heat'),
      fireAlerts: alerts.filter((a) => a.kind === 'fire'),
    }),
    [alerts],
  );

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  return {
    fires,
    perimeters,
    smoke,
    heatAlerts,
    fireAlerts,
    airQuality,
    detections,
    health,
    report,
    loading,
    refreshing: inFlight > 0,
    lastRefreshedAt,
    refresh,
  };
}
