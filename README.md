# Firewatch

A Google Maps–style wildfire situational awareness map. Pan and zoom a live map of
active wildfires, click any fire for a full incident briefing, and overlay smoke
plumes, air quality, satellite fire imagery, heat advisories and fire danger.

Runs with **no API keys and no billing account** — every core layer is built on
keyless public feeds from NIFC, NOAA, NASA and the EPA.

```bash
npm install
npm run dev          # API on :8787, web app on :5173
```

Open http://localhost:5173.

---

## What it shows

**Click any fire** and the detail panel reports everything the interagency feed
carries about it:

| | |
|---|---|
| **What caused it** | Cause category, general and specific cause (`Human · Equipment and vehicle use · Vehicle exhaust`), and whether it is still under investigation |
| **Acres burned** | Current size, plus growth since initial response |
| **Containment** | Percentage, as a progress bar colored by how much line is held |
| **Last updated** | Both relative ("2 hours ago") and absolute |
| **Responsible parties** | Jurisdictional agency and unit, protecting agency, land ownership, coordination and dispatch centers, unified-command status |
| **Active fire squads** | Total personnel, crews, engines, helicopters, airtankers, dozers, water tenders, and the incident management team type |
| **Impacts** | Structures and residences destroyed/threatened, injuries, fatalities, suppression cost to date |
| **Fire behavior** | Observed behavior narrative, predominant fuel and fuel model |
| **Timeline** | Discovery, containment, control and out dates |

### Layers

| Group | Layer | Source |
|---|---|---|
| Wildfire | Active incidents (clickable) | NIFC WFIGS |
| Wildfire | Fire perimeters | NIFC WFIGS |
| Wildfire | Satellite hotspots | NASA FIRMS *(key)* |
| Smoke & air | Smoke plumes — light / medium / heavy | NOAA HMS |
| Smoke & air | Air quality surface (AQI contours) | EPA AirNow |
| Smoke & air | AQI monitoring stations | EPA AirNow *(key)* |
| Weather | Fire danger — Red Flag Warnings, Fire Weather Watches | NOAA NWS |
| Weather | Heat advisories — warnings, watches, advisories | NOAA NWS |
| Imagery | Fire & burn scars (Bands 7-2-1) | NASA GIBS |
| Imagery | True color | NASA GIBS |
| Imagery | Thermal anomalies | NASA GIBS |
| Imagery | Aerosol optical depth | NASA GIBS |

Four basemaps — Map, Satellite, Terrain and Dark — plus search, geolocation, a
reactive legend, and shareable URLs that round-trip position, basemap, active
layers and the selected fire.

> **Why Bands 7-2-1?** True-color imagery shows smoke but not fire. The
> shortwave-infrared 7-2-1 composite renders active flame fronts in vivid red
> and burn scars in dark red-brown, so you can see where a fire actually *is*
> and where it has already been.

---

## Verification status

The build, the test suite and the full UI have been verified end to end. The
**live upstream feeds have not been**: this was developed in a sandbox whose
egress policy allows only npm and GitHub, so every agency host returns a proxy
denial. The endpoints come from each provider's published documentation, but
they have not been exercised against the real services.

Practically, that means:

- Treat the first run against live data as the real integration test.
- `GET /api/health` reports, per feed, which candidate URL answered and what
  failed. Check it first if a layer looks empty.
- Public agency GIS endpoints do get renamed between fire seasons. Every URL
  lives in [`packages/server/src/config.ts`](packages/server/src/config.ts) with
  documented fallbacks, so fixing drift means editing one file.

The architecture assumes feeds will fail: each one degrades independently,
serves a bundled sample dataset rather than a blank map, and says so in the UI.

---

## Architecture

```
packages/
  shared/   Normalized data model + formatting shared by both sides
  server/   Express API: proxies, normalizes and caches the upstream feeds
  web/      React + MapLibre GL client
```

**Why a server at all?** Three things the browser cannot do alone: reach agency
endpoints that send no CORS headers, share one cache across all visitors instead
of every client hammering NIFC, and keep API keys off the client.

The request path is one pipeline shared by every feed:

```
cache → candidate URLs (retry, timeout) → adapter → health record → fallback
```

**Adapters are deliberately defensive.** Agency feeds encode "missing" as `null`,
`''`, `'Null'`, `-1` and `-999` depending on the column; ArcGIS serves dates as
epoch milliseconds and returns errors with HTTP 200; NWS returns `geometry: null`
for zone-based alerts, which is most heat and red-flag products. Each of these is
handled explicitly and pinned by a test — see
[`wfigs.test.ts`](packages/server/src/adapters/wfigs.test.ts) and
[`feeds.test.ts`](packages/server/src/adapters/feeds.test.ts).

### API

| Endpoint | Returns |
|---|---|
| `GET /api/fires` | Incidents. `?activeOnly` `?minAcres` `?state` `?includePrescribed` |
| `GET /api/fires/:id` | One incident by id or IRWIN ID, with its perimeter joined |
| `GET /api/perimeters` | Fire perimeter polygons |
| `GET /api/smoke` | Smoke plumes |
| `GET /api/alerts` | Weather alerts. `?kind=heat` or `?kind=fire` |
| `GET /api/air-quality` | Station observations. `?bbox=w,s,e,n` |
| `GET /api/detections` | Satellite hotspots. `?bbox=w,s,e,n` |
| `GET /api/health` | Per-feed status, resolved URL, record counts, errors |
| `GET /api/sources` | Source registry with attributions |

Every data response is `{ data, health }` — a caller can never render an empty
layer without also learning whether the feed failed.

---

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

```bash
FIREWATCH_USER_AGENT="Firewatch/0.1 (you@example.com)"
```

Set this before deploying. `api.weather.gov` asks clients to identify themselves
and may rate-limit anonymous traffic.

**Optional keys**, each unlocking one extra layer. Without them the app runs
normally and the layer panel says which key is missing.

- `FIRMS_MAP_KEY` — satellite hotspots. Free: <https://firms.modaps.eosdis.nasa.gov/api/area/>
- `AIRNOW_API_KEY` — AQI station observations. Free: <https://docs.airnowapi.org/account/request/>
  (the keyless AQI contour layer works without it)

**Production:** set `FIREWATCH_DISABLE_FALLBACK=1`. The bundled sample dataset is
a development convenience; on a real deployment an outage should surface as an
outage rather than as plausible-looking invented fires.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run build` | Type-check and build both packages |
| `npm start` | Serve API and the built client from one port |
| `npm test` | Adapter test suite (38 tests) |
| `npm run typecheck` | Type-check everything |

---

## Data sources & attribution

| Source | Provider | Terms |
|---|---|---|
| WFIGS incidents & perimeters | [NIFC](https://data-nifc.opendata.arcgis.com/) | Public domain |
| Hazard Mapping System smoke | [NOAA/NESDIS](https://www.ospo.noaa.gov/products/land/hms.html) | Public domain |
| Active alerts & forecast zones | [NWS](https://www.weather.gov/documentation/services-web-api) | Public domain |
| AirNow AQI | [U.S. EPA](https://docs.airnowapi.org/) | Attribution required |
| FIRMS thermal anomalies | [NASA LANCE/ESDIS](https://firms.modaps.eosdis.nasa.gov/) | Attribution requested |
| GIBS imagery | [NASA EOSDIS](https://nasa-gibs.github.io/gibs-api-docs/) | Attribution requested |
| Basemap tiles | OpenStreetMap, Esri, OpenTopoMap | See in-map attribution |

Attribution is displayed in the map's attribution control and in the layer panel.
If you deploy this publicly, respect each provider's tile-usage policy — the
OpenStreetMap tile server in particular is a donated resource with a
[usage policy](https://operations.osmfoundation.org/policies/tiles/); a
production deployment should point at your own tile host.

---

## Not a substitute for official information

Incident figures are self-reported by managing agencies and can lag the fire on
the ground by hours. Smoke and AQI layers are analyses and interpolations, not
measurements at your address. **For evacuation decisions, follow your local
emergency management agency**, not this map.
