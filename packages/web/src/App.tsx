import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { FireIncident } from '@firewatch/shared';
import { MapView, flyToFire } from './map/MapView';
import { FireDetailPanel } from './components/FireDetailPanel';
import { IncidentList } from './components/IncidentList';
import { LayerPanel } from './components/LayerPanel';
import { Legend } from './components/Legend';
import { StatusBar } from './components/StatusBar';
import { ShoppingList } from './components/ShoppingList';
import { useFirewatchData } from './lib/useFirewatchData';
import { useMapState } from './lib/useMapState';

/**
 * Application shell.
 *
 * Owns the two pieces of cross-cutting state — what the map is showing and what
 * the data layer has loaded — and arranges the panels around the map surface.
 */

export function App() {
  const { state, setPosition, setBasemap, toggleLayer, setLayerOpacity, setSelectedFireId } =
    useMapState();

  const data = useFirewatchData({ detectionsEnabled: state.visibility.detections });

  const mapRef = useRef<MapLibreMap | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<'map' | 'shopping-list'>('map');

  const selectedFire = useMemo(
    () => data.fires.find((fire) => fire.id === state.selectedFireId) ?? null,
    [data.fires, state.selectedFireId],
  );

  const selectedPerimeter = useMemo(() => {
    if (!selectedFire?.irwinId) return undefined;
    return data.perimeters.find((perimeter) => perimeter.irwinId === selectedFire.irwinId);
  }, [data.perimeters, selectedFire]);

  const handleMapReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map;
  }, []);

  /** Select a fire and bring it into view — used by the list and search. */
  const handleSelectFromList = useCallback(
    (fire: FireIncident) => {
      setSelectedFireId(fire.id);
      flyToFire(mapRef.current, fire);
    },
    [setSelectedFireId],
  );

  /**
   * Restore a shared link's selected fire once incidents arrive.
   *
   * The URL is read before any data exists, so the fly-to has to wait for the
   * feed. It runs once per id: re-running on every refresh would yank the map
   * back every five minutes while someone is reading.
   */
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    const id = state.selectedFireId;
    if (!id || restoredRef.current === id || data.fires.length === 0) return;

    const fire = data.fires.find((f) => f.id === id);
    if (!fire) return;

    restoredRef.current = id;
    flyToFire(mapRef.current, fire);
  }, [data.fires, state.selectedFireId]);

  // Escape closes whatever is open, innermost first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (layersOpen) setLayersOpen(false);
      else if (state.selectedFireId) setSelectedFireId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layersOpen, state.selectedFireId, setSelectedFireId]);

  const incidentsUsingFallback = data.health.incidents?.usingFallback ?? false;

  return (
    <div className="app">
      <header className="app-header">
        {activeView === 'map' ? (
          <>
            <button
              className="icon-button sidebar-toggle"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? 'Hide incident list' : 'Show incident list'}
            >
              ☰
            </button>

            <div className="brand">
              <span className="brand-mark" aria-hidden>
                🔥
              </span>
              <div>
                <h1>Firewatch</h1>
                <p>Live wildfire, smoke and air quality map</p>
              </div>
            </div>

            <StatusBar
              health={data.health}
              lastRefreshedAt={data.lastRefreshedAt}
              refreshing={data.refreshing}
              onRefresh={data.refresh}
            />

            <button
              className={`button layers-button${layersOpen ? ' active' : ''}`}
              onClick={() => setLayersOpen((open) => !open)}
              aria-expanded={layersOpen}
            >
              Layers
            </button>
          </>
        ) : null}

        <button
          className={`button view-toggle${activeView === 'shopping-list' ? ' active' : ''}`}
          onClick={() => setActiveView(activeView === 'map' ? 'shopping-list' : 'map')}
        >
          {activeView === 'map' ? '🛒 Shopping List' : '🔥 Firewatch Map'}
        </button>
      </header>

      <div className="app-body">
        {activeView === 'map' ? (
          <>
            {sidebarOpen && (
              <nav className="sidebar">
                <IncidentList
                  fires={data.fires}
                  selectedFireId={state.selectedFireId}
                  onSelect={handleSelectFromList}
                  isSampleData={incidentsUsingFallback}
                  loading={data.loading}
                />
              </nav>
            )}

            <main className="map-area">
              <MapView
                position={state.position}
                basemap={state.basemap}
                visibility={state.visibility}
                opacity={state.opacity}
                fires={data.fires}
                perimeters={data.perimeters}
                smoke={data.smoke}
                heatAlerts={data.heatAlerts}
                fireAlerts={data.fireAlerts}
                airQuality={data.airQuality}
                detections={data.detections}
                selectedFireId={state.selectedFireId}
                onSelectFire={setSelectedFireId}
                onPositionChange={setPosition}
                onMapReady={handleMapReady}
              />

              <Legend
                visibility={state.visibility}
                collapsed={legendCollapsed}
                onToggleCollapsed={() => setLegendCollapsed((value) => !value)}
              />

              {layersOpen && (
                <LayerPanel
                  basemap={state.basemap}
                  visibility={state.visibility}
                  opacity={state.opacity}
                  health={data.health}
                  onBasemapChange={setBasemap}
                  onToggleLayer={toggleLayer}
                  onOpacityChange={setLayerOpacity}
                  onClose={() => setLayersOpen(false)}
                />
              )}

              {selectedFire && (
                <FireDetailPanel
                  fire={selectedFire}
                  perimeter={selectedPerimeter}
                  onClose={() => setSelectedFireId(null)}
                  onZoomTo={(fire) => flyToFire(mapRef.current, fire)}
                  isSampleData={incidentsUsingFallback}
                />
              )}
            </main>
          </>
        ) : (
          <ShoppingList />
        )}
      </div>
    </div>
  );
}
