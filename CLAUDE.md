# FlightScope

Live flight radar for the browser: aircraft on a map with altitude coloring, a trail for the selected
aircraft, and a details panel (photo, route, type, speeds, squawk, autopilot modes, signal, links).
Default view is the New York area. Built Oct 2026; now being polished in Claude Code.

## Working rules (set by the owner)

- Keep it a single self-contained `flightscope.html` plus the one relay file `flightscope-server.js`: no build step, no
  framework, no new npm dependencies unless there is a strong reason.
- Don't break `file://` mode (the page then uses `http://127.0.0.1:8787/api`) or the dark / light / satellite map styles.
- Trails are drawn only for the selected aircraft; keep that.
- Test in a real browser after each change: start the relay, open http://localhost:8787, confirm aircraft load and that
  clicking one opens the details panel.
- Work one step at a time and check in with the owner after each step before starting the next.
- Keep this file current after each change. After changing the page or the relay section, run
  `node flightscope-server.js --build-worker`; after changing the icon code, `node flightscope-server.js --build-icon`.
- `flightscope.env` holds secrets on a real machine: it is git-ignored; never commit, paste or log it.
- Don't try to get around the ADS-B globe sites' bot protection (their 403s); history comes from OpenSky only.
- `FlightScope.cmd` and `README.txt` use CRLF line endings (Windows); keep them that way.

## Status when this repository was created (2026-11-12)

- Built and run on a Windows PC: the desktop shortcut runs `FlightScope.cmd`, which starts the relay hidden and opens
  http://localhost:8787. On another machine: `node flightscope-server.js`, then open that address (Node 18+).
- Newest feature: start at my location (see Page internals). Tested only with a simulated location; its first real run
  on the owner's PC had not happened yet.
- Sharing: on the original PC `flightscope.env` set `HOST=0.0.0.0`, so phones on the home Wi-Fi open
  `http://<PC address>:8787` (the address changes with DHCP). The Cloudflare Worker route no longer gets a feed (see
  its Files row). The owner was offered Tailscale Funnel to expose the home relay over https and chose Wi-Fi only for
  now; that is the open path for a friend on Android away from home.
- Decided and left as is: an aircraft whose only military evidence is a military registry owner (e.g. an Air Force
  aero-club Cessna) keeps the MILITARY badge.
- Not started: a Google Play build (a Trusted Web Activity or Kotlin wrapper was discussed, not chosen); the iOS
  wrapper in `ios/` has never been compiled.
- Testing notes from Claude Code's desktop browser pane: while the pane is hidden, requestAnimationFrame does not fire
  (the page's 60 ms setInterval fallback keeps markers moving); the pane cannot open `file://` pages and has no real
  geolocation (stub `navigator.geolocation.getCurrentPosition` in a same-origin srcdoc iframe to test location code);
  start the relay detached (on Windows: PowerShell `Start-Process node ... -WindowStyle Hidden`), not from a shell that
  will exit.

## Files

| File | Role |
|---|---|
| `flightscope.html` | The whole app: Leaflet map + UI + data layer. Leaflet CSS is inlined; Leaflet JS loads from cdnjs. |
| `flightscope-server.js` | Local relay (Node 18+). Serves `flightscope.html` from disk at `/` (read on every request) and proxies the feeds under `/api/*`. `--build-worker` regenerates `flightscope-worker.js` instead of starting. Binds `HOST`:`PORT` (default 127.0.0.1:8787; `HOST=0.0.0.0` shares it on the LAN and the startup line then lists the `http://<lan-ip>:port` addresses a phone can open; the page uses same-origin `/api`, so nothing else is needed). `FLIGHTSCOPE_CONTACT` overrides the `CONTACT` constant; startup warns while it is the placeholder. No embedded copy of the page: it exits with a message at startup if `flightscope.html` is not next to it, answers `/` with a 503 if the file disappears later, and exits with a message if the port is taken. |
| `flightscope-worker.js` | GENERATED: the same relay as a Cloudflare Worker (module syntax) with the page embedded in its `HTML` constant. Never edit it; run `node flightscope-server.js --build-worker` after changing the page or the relay section, and paste the result into a Worker. Config comes from Worker vars/secrets (`FLIGHTSCOPE_CONTACT`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`); the contact also shows on the public `/privacy` page. Optional; only for hosting it publicly (e.g. a free `*.workers.dev` link for an Android or iPhone friend). Tested on 2026-10-31 by serving its `fetch()` from Node with a phone viewport: page, manifest, icons and every `/api` route worked; per-request work stayed under the free plan's 10 ms CPU (feed parse + stringify 2.5 ms at 250 nm over New York, prebuilt icons 1-4 ms). Deployed on 2026-10-31 to a free `*.workers.dev` subdomain: page, icons, photos and routes worked, but from Cloudflare adsb.fi and airplanes.live answer 403, OpenSky never answers, and on 2026-11-11 adsb.lol answered 429 to every request (it now allows 500 requests per IP per day, which Cloudflare's shared addresses use up), so the Worker cannot serve a feed. A relay on a home connection can. |
| `FlightScope.cmd` | Double-click launcher: checks Node and `flightscope.html` exist, kills any running relay, starts `node flightscope-server.js` hidden, opens http://localhost:8787. `FlightScope.cmd shortcut` instead builds `FlightScope.ico` if it is missing (`--build-icon`) and puts a FlightScope shortcut on the desktop through WScript.Shell (target the launcher, working directory this folder, run minimized, that icon). CRLF line endings. |
| `FlightScope.ico` | GENERATED by `node flightscope-server.js --build-icon` (the same bytes as `/favicon.ico`): the desktop shortcut's icon. Rebuild it after changing the icon code. |
| `README.md` | The GitHub front page, in the style of the owner's other public repos (2coins303/codex-monitor, prism-keyboard-studio): pitch, demo GIF, Install / Updating, data-source table, "Reading the map" bullets, screenshot table, Options, "What leaves your computer", Developing, License and credit. Keep it in step with the app. |
| `README.txt` | End-user notes (plain text, CRLF), the older copy of the same information. |
| `LICENSE`, `PRIVACY.md` | MIT ("FlightScope contributors", as in codex-monitor). `PRIVACY.md` is the repository copy of the relay's `/privacy` notice: change both together. |
| `docs/` | README images captured from the running app on 2026-11-13 by a headless Chrome over the DevTools protocol with Planespotters blocked (so every photo shown is a Wikimedia Commons type photo with its credit): `demo.gif` / `demo.mp4` (3 min timelapse, 30x), `demo.jpg`, `satellite.jpg`, `list.jpg`, `phone.jpg`; `assets.md` says how. Recapture after visible UI changes. |
| `ios/` | iOS wrapper for an App Store release: SwiftUI + WKWebView sources (`ios/FlightScope/*.swift`, six files), `ios/README.md` (Xcode steps, bridge table) and `ios/APP-STORE-CHECKLIST.md` (guidelines, App Privacy answers, review notes, device tests). The app loads the page from `Config.relayURL` and talks to it through the native bridge (see Page internals). Written on Windows and never compiled: expect small fixes on the first Xcode build. |
| `flightscope.env` | Optional, not shipped: `KEY=VALUE` lines the relay applies to `process.env` at startup (real environment wins). Holds `FLIGHTSCOPE_CONTACT`, `HOST`, `PORT`, `OPENSKY_CLIENT_ID/SECRET`. Secrets live here, so never commit or paste it. |

Run for development: `node flightscope-server.js` then open http://localhost:8787 (or just refresh an open tab;
the page is read from disk on every request, so html edits need no restart; relay edits do).

## Why there is a relay

Every open ADS-B feed refuses direct browser calls (no CORS headers), verified in a real Chromium:
adsb.fi, adsb.lol, airplanes.live, OpenSky, planespotters. So the page talks to a relay. When opened as a
`file://` the page defaults to `http://127.0.0.1:8787/api`; when served by the relay it uses same-origin `/api`.
A relay URL can be overridden in Settings. If no relay answers, the page tries two public CORS relays
(allorigins, codetabs) as a last resort, then shows the "No live feed reachable" banner.

## Relay endpoints (the marked relay section of `flightscope-server.js`, copied verbatim into the worker)

`flightscope-server.js` is three parts: a Node head (requires, `flightscope.env` loading, `const cfg = k => process.env[k]`),
the relay section between the `/* ---- relay start` and `/* ---- relay end` markers, and a Node tail (`--build-worker`,
startup warnings, `pageResponse()` reading `flightscope.html`, the HTTP server that turns every request into a
`Request` and hands it to `handle()`). The relay section must stay portable: no `require`/`process`/`fs`; it reads
configuration only through `cfg()` (`contact()`, `ua()`, `openskyId()`, `openskySecret()` are lazy for that reason)
and serves `/` through a `pageResponse()` that each host defines. `--build-worker` splices that section between a
worker head (`const ENV = {}; const cfg = k => ENV[k]`) and a worker tail (`pageResponse()` returning the embedded
`HTML`, `export default { fetch(request, env) }` copying `env` into `ENV`), then appends `const ICON_BYTES` and `const HTML = <JSON
string of the page>`. `ICON_BYTES` holds the 64/180/192/512 PNGs and the ICO as base64, drawn by the build: on a fresh isolate
drawing one takes 11-48 ms of CPU and the Workers free plan allows 10 ms per request (error 1102), which would break
Android's "Install app". The worker's `prebuiltIcon()` decodes the requested one into the relay's `iconCache` before
`handle()`, so `iconPNG()` / `iconICO()` never draw there. The build is asynchronous, so `BUILDING` (`BUILD_ICON ||
`BUILD_WORKER`) keeps the startup warnings and the server from running during either build.

- `GET /api/feed?lat&lon&dist` (dist nm, max 250). Tries sources in order until one answers:
  adsb.fi (`opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}`) → adsb.lol (`api.adsb.lol/v2/lat/.../dist/...`,
  rate-limited 4 req/s per IP and, by 2026-11-11, 500 requests per IP per day: `x-ratelimit-limit: 500, 500;w=86400`) → airplanes.live (`/v2/point/{lat}/{lon}/{nm}`, currently returns 403 without a
  contact arrangement) → OpenSky `/states/all` bbox (anonymous: 400 credits/day, 10 s resolution; converted to
  the same field names). The centre goes to the sources as numbers (strings broke OpenSky's box until 2026-10-31). A source
  that fails with anything but a 429 rests for 2 min (`sourceRest`, listed in `/api/health` as `resting`). From Cloudflare
  on 2026-10-31: adsb.fi and airplanes.live answer 403, OpenSky never answers (7 s timeout, tracks too), and adsb.lol
  answers 429 to about a third of requests in windows longer than 8 s, so retrying inside a request does not help; the
  page rides those out instead (see `fetchFeed()`). Responses are coalesced for 2.5 s per lat/lon/dist key. Reply shape is the
  readsb/tar1090 "aircraft.json" style: `{ now (ms), source, total, ac: [...] }`.
- `POST /api/route` body `{planes:[{callsign,lat,lng}]}` → adsb.im / adsb.lol `routeset` → array with
  `airline_code`, `number`, `airport_codes`, `_airports[{iata,icao,name,location,lat,lon}]`, `plausible`.
- `GET /api/track?icao=hex` → OpenSky `/tracks/all?icao24=&time=0` (recent trajectory; `path` rows are
  `[time, lat, lon, baro_alt_m, track, on_ground]`, from the flight's first position). Cached per icao for 60 s
  (failures 20 s) in `trackCache`, so a page's selection costs one OpenSky call. Anonymous calls worked on
  2026-10-28 (`X-Rate-Limit-Remaining` ~400/day per relay IP); OpenSky's 429 is passed through as 429
  "OpenSky quota reached", 404/other errors become 502 "track unavailable". Credentials raise the quota.
- OpenSky auth: with `OPENSKY_CLIENT_ID` + `OPENSKY_CLIENT_SECRET` set, `openskyHeaders()` fetches an OAuth2 token
  (client credentials, `auth.opensky-network.org/.../openid-connect/token`, ~30 min lifetime, refreshed on demand,
  one in-flight request shared by concurrent callers) and both the `/states/all` source and `/tracks/all` send it as
  a Bearer header. A failed token request logs OpenSky's error, falls back to anonymous and retries a minute later.
  `/api/health` reports `opensky: "client credentials" | "anonymous"`. No credentials were available while this was
  built, so the authenticated path was tested only as far as OpenSky rejecting bogus credentials.
- `GET /api/photo?hex=HEX` → planespotters `pub/photos/hex/{HEX}` (needs a User-Agent with a contact; set `CONTACT`
  at the top of the relay).
- `GET /manifest.webmanifest` → `MANIFEST` (standalone display, icons 192/512, colours `#0c1218`), so the page installs
  from Safari/Chrome's "Add to Home Screen" as a full-screen app.
- `GET /privacy` → `privacyPage()`: a self-contained HTML notice (location use, what leaves the device, local storage,
  third-party services, contact from `contact()`; it says "no contact address is configured" while `CONTACT` is the
  placeholder). `PRIVACY_UPDATED` is the date it shows; bump it when the text changes. An App Store listing links to it.
- `GET /icon-{64,180,192,512,1024}.png` and `/apple-touch-icon.png` (180) → `iconPNG(size)`, an opaque 8-bit RGB
  square; `GET /favicon.ico` → `iconICO()`, a real ICO (16/24/32/48/64 as 32-bit bottom-up BGRA bitmaps with a 1-bit
  mask, 256 as RGBA PNG) on a rounded tile with transparent corners and a faint rim. Both come from
  `iconPixels(size, rounded)`: a radar scope in the page's colours (`ICON_BG` lifted towards `ICON_GLOW` at the centre,
  two thin rings, a sweep fading counter-clockwise from the heading line, the `ICONS.airliner` outline, duplicated in
  `iconPolys()`, turned 32° in `ICON_FG`); the aircraft is rasterised by `coverage()` (non-zero winding, 4×4 sub-samples),
  the rest is per-pixel maths, `encodePNG()` builds the chunks by hand (`crc32`, `pngChunk`) with zlib from
  `CompressionStream('deflate')` (Node 18+ and Workers), cached in `iconCache`. 1024 (the App Store asset) takes ~100 ms
  CPU on first request, which the Workers free plan (10 ms CPU) may cut off: fetch it from the local Node relay instead.
  Other PNG sizes answer 404. `node flightscope-server.js --build-icon` (Node tail; `BUILD_ICON` skips the server and
  its warnings) writes the ICO bytes to `FlightScope.ico`.

All upstream calls go through `upstream()`: `UA = FlightScope/1.0 (+CONTACT)`, `accept: application/json`, a 7 s
timeout, and a caller's headers merged on top of those (an earlier version let them replace the User-Agent on the
route POST). `CONTACT` is still the placeholder unless `FLIGHTSCOPE_CONTACT` is set (the relay warns at startup while it is).

## Aircraft record fields the page reads (readsb style)

`hex flight r t desc ownOp year category type dbFlags(1=mil,4=PIA,8=LADD) lat lon alt_baro("ground"|ft) alt_geom gs ias tas mach
track true_heading mag_heading baro_rate geom_rate squawk emergency nav_modes nav_altitude_mcp nav_heading nav_qnh wd ws oat
seen seen_pos rssi messages nic nac_p sil origin_country(OpenSky only)`

## Page internals (`flightscope.html`, one IIFE in the last `<script>`)

- `settings` persisted in `localStorage` under `flightscope.v1.settings`; map view under `flightscope.v1.view`.
  Keys: `proxy interval(s) trails labels airports maxRadius(nm) trailMin theme(auto|dark|light|satellite|streets)
  listSort listFilter units(aviation|metric) rings ringsAt({lat,lon}|null) weather startView(ft, 0 = last view)`.
- Start at my location: on launch, unless a deep link chose the view (`deepLinked`), the page asks for the location
  (`requestLocation()`, shared with the Locate button: the iOS app's Core Location through `FlightScope.locate()`, else
  the browser's geolocation, which needs https or localhost) and `showLocation()` moves there at `zoomForEye(startView)`:
  the zoom at which the map's height covers what a camera that many feet up sees with a 60° field of view (2,000 ft is
  zoom 17 on an 800 px map at 40° N; height above the ground, not sea level). A drag, zoom or selection before the
  answer arrives cancels the move, and a refused or failed lookup keeps the saved view without an error. Settings'
  "On launch" select offers the last view, 2,000, 10,000 or 35,000 ft (labels in the chosen units). Range rings follow,
  as with Locate. The `/privacy` notice (dated 2026-11-13), `ios/README.md`'s purpose string and the App Store checklist
  say location is used at launch and for Locate.
- `fetchFeed()` builds the attempt list (relay → direct airplanes.live → public relays), remembers which one worked
  (`lastVia`) and tries it first next time. Search radius = map half-diagonal × 1.1, capped by `maxRadius`. While the relay
  answered within `RELAY_GRACE_MS` (2 min, `relayRecent()`), a failed refresh tries only the relay; `tick()` then keeps the
  live status with "· retrying" and the normal interval for up to `RIDE_OUT_ERRORS` (6) misses (`ridingOut`) before it
  shows the feed error and backs off. The public relays (9 s timeout each) answered 522 on 2026-10-31.
- `upsert()` keeps a `fleet` Map of `hex → {a, trail[], fixAt, lastSeen, marker, el, svg, lbl, shape, dr}`.
  Trails are recorded for every aircraft (points ≥1.5 s apart, max 900, pruned past `trailMin`) but drawn only
  for the selected one (`renderSelectedTrail()`, altitude-colored segments on a Leaflet canvas renderer). The
  selected aircraft is exempt from the time pruning and gets a 6000-point cap, and `select()` calls `loadTrack()`,
  which fetches its OpenSky trajectory through the relay (`/api/track`) into `rec.hist` (same `{lat, lon, alt, t}`
  shape, whole path kept) once per aircraft per 10 min; `trailPoints()` draws hist up to the first session fix and
  the session trail after it, so the join moves forward by itself. The panel's Trail row says "with OpenSky history",
  "history unavailable" or "paused: OpenSky quota reached" (a 429 stops auto-loads for 10 min, `trackBackoffUntil`);
  the Reload track button forces a fetch.
- Markers are Leaflet `divIcon`s. `shapeFor()` picks one of the nine outlines in `ICONS` (24×24, nose up; the seven
  fixed-wing ones are right-half point lists mirrored by `sym()`, engines as bumps in the outline rather than separate
  parts): `veh` (category C1/C2), `heli` (A7 or `HELI_TYPES`, which includes `AH\d` so an Apache is not a fighter), else
  the type code's class from `TYPE_CLASS` (`airliner` / `bizjet` / `ga` straight-wing prop plane, which also covers
  turboprops like the King Air and PC-12 / `fighter` / `miljet` heavy military jet: C-17, KC-135, E-3, P-8, B-52 /
  `milprop` military turboprop transport or patrol aircraft: C-130, C-27J, P-3, E-2, A400M (a four-engine outline; the
  twin C-27J borrows it); filled by the `typeRows()` calls that also build
  `TYPE_WIKI`), an `airliner`-class type that `isMil()` drawing as `miljet` (an Air Force 737 or KC-10); else `fighter`
  for a military-only code in `MIL_TYPES`, else by emitter category (A1 ga, A2 bizjet, A3–A5 airliner, or `miljet` when
  military, A6 fighter), else `miljet` for a military aircraft of unknown category, else the generic `plane`. Icons rotate by track and are colored by `altColor()`.
  Role badges: `roleOf()` returns `medical` / `police` / `news` (regexes in `ROLES` over callsign + `ownOp`, first match
  wins) or `mil` (`isMil()`: `dbFlags & 1`, a `MIL_TYPES` code, or a service named in `ownOp` via `MIL_OPS`).
  `renderMarker()` puts `BADGES[role].svg` (16×16 discs: badge-style gold star on navy, blue shield, camera, red cross)
  into the `.bdg` span at the marker's top-right corner, outside the rotated svg so it stays upright, and
  `.ac.badged .lbl` moves the label right. The same role gives the panel its badge and the list row its tag, the
  "military" list filter uses `isMil()`, and the legend shows the four badges (`#legend .keys`, filled by `syncLegend()`).
  Each SVG holds the shape twice: a `g.halo` copy underneath (CSS `--halo` color and
  `--halo-w` stroke, chosen per `body[data-map]` which `mountStyle()` sets: white on satellite/light, dark on
  dark/inverted streets) and the colored body on top. `.sel` ring, `.emg` pulsing ring for 7500/7600/7700 or
  `emergency != none`, `.stale` after 60 s. `.gnd` (alt_baro === "ground") markers are `display:none` below zoom 11
  (`body.zoom-mid`, `GROUND_MIN_ZOOM`) unless `.sel` or `.emg`, and get a negative z-index offset so airborne traffic
  draws over them; they draw at 18 px instead of 22 and their labels show only from zoom 13 (`body.zoom-tight`),
  because at 12 a busy ramp is a pile of labels. Other labels show from zoom 10.
- Airports: the `AIRPORTS` table (`[IATA, ICAO, name, lat, lon, tier]`, ~300 entries, coordinates at the airport
  reference point) becomes `divIcon` markers in a dedicated `airports` pane (z 450, under aircraft) in
  `airportLayer`. `AIRPORT_ZOOM` maps tier → [show from zoom, name from zoom]: 1 = world hubs (6 / 9), 2 = other
  airline airports (8 / 10), 3 = New York reliever/GA fields (10 / 11). `syncAirports()` (called from
  `syncZoomClass`) toggles `.hide` / `.named` on each marker and adds/removes the layer per `settings.airports`.
  Only the diamond (`.glyph`) and the code label take pointer events; clicking either flies to the airport at
  zoom ≥ 12. Hovering shows name · IATA / ICAO as a native tooltip. While ground traffic is hidden (zoom < 11),
  `updateAirportCounts()` (run after each feed, on `moveend` and from `syncAirports`) writes "N on ground" into each
  visible airport's `.gcount` span: aircraft with `alt_baro === "ground"` seen in the last 60 s within ±0.04° of the
  airport reference point. It is a no-op until the first feed (`haveFeed`), since `fleet` is declared after the map
  setup that first calls `syncAirports`.
- Motion: each record keeps `dr` (last fix + gs/track) and `shown` (where the marker is drawn). `glide()` runs
  from `requestAnimationFrame` (throttled to ~16 fps; a 60 ms `setInterval` also calls it and takes over at the same
  rate when frames stall, e.g. an occluded or embedded view) and eases `shown` toward `targetOf()` (the fix dead-reckoned forward up to 90 s) with a 0.8 s
  time constant; jumps over ~2 km teleport. `renderMarker()` therefore does not move an existing marker (except
  below zoom 6, where the loop is idle). The icon's rotation uses a continuous angle (`rec.rot`) so heading changes
  through north turn the short way. A `liveSeg` polyline joins the last trail fix to the glided position of the
  selected aircraft. Selecting an aircraft never moves the map (a list row pans only when that aircraft is outside
  the current view; the panel's Center button recenters on demand). The panel's Follow button sets the runtime flag
  `following` for the current selection only (nothing persisted; the old `settings.follow` toggle is gone, a stale
  key in saved settings is dropped on load): `followSelected()` pans to the aircraft and the loop then keeps it
  centred with `autoPan` set so `moveend` skips saving/refetching (`autoPanHold` lets the animated pan finish first).
  A new selection, closing the panel or starting a drag clears it.
- `renderPanel()` draws the details panel; `renderList()` the nearest/search list (search matches callsign, reg, hex,
  type, operator, description, squawk). The list has filter chips (`LIST_FILTERS`: all / airborne / on ground /
  helicopters / military / alerts) and a sort select (`LIST_SORTS` + `LIST_CMP`: nearest, highest, lowest with
  ground last, fastest, callsign with hex-only entries last, newest in feed via `rec.firstSeen`); both persist in
  `settings.listSort` / `settings.listFilter`. There is no cap any more: rows render `LIST_PAGE` (100) at a time
  behind a "Show more" button that an IntersectionObserver presses when it scrolls into view. The toolbar, `<ul>`
  and footer are built once per visit (`.ltools` missing from `#pbody`) and only the rows are replaced on each
  feed, so the dropdown and scroll position survive refreshes; rows use event delegation on the `<ul>`. Rows show
  MIL / squawk tags. `loadPhoto / loadRoute / loadTrack` enrich on selection and cache in Maps.
- Photos: `loadPhoto()` tries planespotters for the exact airframe (relay `/api/photo`, then direct), and if that has
  nothing, `typePhoto()` finds a stand-in. With a role from `photoRole()` (medical / police / news, or mil for a type
  that is not military-only) it first searches Wikimedia Commons files for "<type article title or desc> <role word>"
  (`ROLE_PHOTO` words, `commonsSearch()`: the best-ranked landscape JPEG/PNG whose name is not a diagram, cockpit,
  model etc. per `BAD_FILE`), so a hospital EC-145 shows an air ambulance and a police Bell 429 a police one; the panel
  tags these "Similar aircraft". Otherwise, or if the search finds nothing, it takes English Wikipedia's lead image:
  `TYPE_WIKI` maps ICAO type codes to article titles, else a search on the feed's `desc`, else `CAT_WIKI` by emitter
  category, else "Fixed-wing aircraft" ("Type photo" tag). The page calls `en.wikipedia.org` and
  `commons.wikimedia.org` directly (they allow CORS; `origin=*`), takes the 720 px thumbnail and the file's
  Artist/License, and caches per type and role in `localStorage` (`flightscope.v1.typephotos`, keys `t:CODE` or
  `t:CODE:role`, 14 days, ≤400 entries). Failures are not cached for the session: `typeFailAt` and a `none` photo
  entry retry after 10 min, because Wikimedia's API answered 503 in bursts on 2026-10-28. MediaWiki API errors also
  arrive as HTTP 200 with an `error` object (`internal_api_error_DBConnectionError` on 2026-10-29); `commonsSearch()`
  and `wikiPage()` throw on those so they count as outages, not as "no such photo"; the search retries once after 0.8 s
  first, because the same request usually succeeds seconds later.
  A role photo only ever comes from Commons: the type in that role (`ROLE_PHOTO[role].words`), then, for medical /
  police / news, any aircraft of its kind in that role (`generic`, e.g. "air ambulance helicopter"); files whose name,
  description or categories match the `is` regex of another role are skipped (`otherRoles()`, `metaText()` over the
  extmetadata `META` fields). The military role has no `generic` query: Commons ranks "military aircraft" by caption
  text and led with a firefighting drill (2026-10-29), so a military type the type searches cannot place takes its
  own article photo, which `typeOk` lets the cache keep under the role key (a C-17's lead image is a military photo
  anyway). A military record with no type name skips the Commons searches as well, because "aircraft military" is
  the generic search again, and takes the category photo like any unknown aircraft. A record nothing identifies (no
  type, description or category: hex-only MLAT and TIS-B traffic, `nameless()`) gets no photo at all: `typePhoto()`
  returns null without a lookup and the panel says why (`why` on the `none` photo entry). hexdb.io and adsbdb were
  asked about 30 such hexes on 2026-10-31 and knew none (they share the feed's database; OpenSky's metadata API is
  gone, HTTP 410), so there is no lookup worth adding; old `generic` cache keys are dropped on load.
  Otherwise the plain type photo stands in with `fallback:true`, when a Commons search threw (`searchErr`) or
  the role has a generic query that found nothing: shown for this session only, never written to localStorage, retried
  after 10 min. On load, a role key (`ROLE_KEY`) holding a non-role photo and any `Military`, `Military aircraft` or `Military
  helicopter` entry (`GENERIC_MIL`, the old generic results) are dropped. The Wikipedia EC135 article leads with a police
  helicopter whose file says nothing about police, so the text filter alone is not enough; that is why the fallback is
  never persisted.
- Basemaps: Esri Canvas dark/light gray (base + reference labels), Esri World Imagery, OSM streets (CSS-inverted in dark).
  If >10 tiles fail before any loads, it falls back to OSM. All tile layers go through `retryTiles()`: Leaflet itself
  never retries a failed tile request, which left holes after bursts of zooming, so a `tileerror` re-requests that
  tile after 0.7 / 2 / 4.5 s (later tries add `?retry=n` to bust a cached failure). Esri URLs use `{s}` over
  `server` and `services`.arcgisonline.com to double the browser's per-host connection budget, and every layer has
  `updateWhenZooming:false` (no tiles for in-between zooms during the animation) and `keepBuffer:4`. Esri answers
  out-of-range tile coordinates with a blank 200, not an error, so a simulated failure needs a bad host.
  CARTO basemaps were tried on 2026-10-27 and now serve "API KEY REQUIRED" watermark tiles without a key: not an option.
- Units: feeds stay in ft / kt / nm / fpm; only display converts. `UNITS` holds an `aviation` and a `metric` entry
  (`alt spd dist rate spdAlt` formatters, legend ticks + caption, `ringRadii` / `ringUnit` / `ringUnitM`), `units()`
  picks one by `settings.units`, and `fmtAlt / fmtAltV / fmtSpd / fmtDist / fmtRate` feed the panel tiles, list rows,
  status line, the radius label in Settings and the legend (`syncLegend()`). The Units select is in Settings.
- Overlays (`syncOverlays()` = `renderRings()` + `syncWeather()`, run at init and from `commit()`; both panes are
  `pointer-events:none`):
  - Range rings: pane `rings` (z 360). `renderRings()` draws the six `ringRadii` of the current unit system as dashed
    `L.circle`s on an `L.svg` renderer in that pane, plus a centre dot and a `divIcon` label (`.ring-lbl`) at the top of
    each ring, all colored `var(--fg)` so they follow the theme. Centre = `settings.ringsAt`, set to the map centre when
    the box is switched on and moved by a successful Locate; while it is `null` the map centre at draw time is used.
  - Rain radar: pane `weather` (z 350: over tiles, under airports and aircraft). `loadWeather()` fetches RainViewer's
    public `weather-maps.json` (CORS `*`), takes the last `radar.past` frame and builds an `L.tileLayer` on
    `${host}${path}/512/{z}/{x}/{y}/2/1_1.png` (color scheme 2, smoothing + snow) with `tileSize:512, zoomOffset:-1,
    maxNativeZoom:8`, opacity 0.6; a new frame is added under the old layer, which is removed on `load` or after 4 s.
    `syncWeather()` refreshes every 5 min and shows the frame time (or "unavailable") in the legend's `.wx` line.
    RainViewer's free tiles only go to zoom 7: higher zooms return a "Zoom Level Not Supported" placeholder PNG with
    HTTP 200 (256 px from zoom 8, 512 px from zoom 8 too), which is why the layer requests 512 px tiles with the −1
    offset (effective zoom 8) and lets Leaflet upscale from there.
- Install metadata and the native app bridge: the head carries `theme-color` for both schemes, `mobile-web-app-capable`
  / `apple-mobile-web-app-*` (standalone, translucent status bar; the header's safe-area padding already handles it),
  `<link rel=manifest>`, an icon and an apple-touch-icon link, all relative paths the relay answers (harmless 404s when
  opened as a file). `proxyBase()` prefers `window.FLIGHTSCOPE_RELAY` (an origin injected by a host that embeds the
  page, the iOS app) after `settings.proxy`. The bridge block before the UI wiring: `nativeHandler()` finds
  `window.webkit.messageHandlers.flightscope` (only the iOS app has it), `nativePost(type, data)` posts `ready` (end of
  the script), `select {hex, callsign}` (from `select()`, a haptic tap in the app), `share {title, text, url}` (the
  panel's Share button, rendered when `canShare()`: native or `navigator.share`; `shareInfo()` builds the text and a
  `#icao=hex&lat=..&lon=..&z=..` link) and `locate` (the Locate button: `locateCb` waits up to 20 s for the app's
  `FlightScope.locate(lat, lon, error)`; without the app the browser's geolocation runs as before). `window.FlightScope`
  = `{select(hex), showList(filter), locate(lat, lon, error), refresh()}` is what the app and its quick actions call;
  `select` of a hex the feed has not delivered sets `pendingHex`, which `applyFeed()` resolves. The deep-link block
  just before the first `tick()` reads `icao`, `lat`, `lon`, `z` from `location.hash`, views the spot, sets `pendingHex`
  and strips the hash. Settings has a "Privacy & data sources" link (`#privacyLink`, `target=_blank` so the app opens
  it in its Safari sheet) whose href is resolved from `proxyBase()` on click. `body.native` is set when the handler
  exists; nothing styles it yet.
- Layout: full-bleed map, floating header, details panel is a right column ≥900 px and a bottom sheet below that;
  settings sheet likewise. Theme follows `prefers-color-scheme` unless the map style forces one. In the header the
  `.status` box has a fixed 300 px width (auto below 480 px) and `.tools` is pinned right with `margin-left:auto`,
  so the search box and buttons stay put while the status text ("… · 12s ago") changes every second; longer
  texts get an ellipsis.

## Known rough edges / ideas for polish

- Flight history comes only from OpenSky (the ADS-B networks' globe sites keep traces, but behind bot protection
  that returns 403 to non-browser callers, and their public APIs are current-position only). Anonymous OpenSky is
  ~400 track calls a day per IP and sparse over oceans; credentials in the relay raise the quota. Route lookups
  come from a callsign database, so `plausible:false` routes can be wrong.
- Airport markers cover ~300 major airports only (no runway outlines); smaller fields outside the New York area
  are not in the table.
- Public-relay fallback is slow and unauthenticated; fine as a last resort only.
- The rain overlay is coarse: RainViewer's free tiles stop at zoom 7 (see Overlays), so from zoom 9 up it is upscaled
  blocks, and the pane's smoothing hides small cells. Rings and the overlay are not tested with a live Locate (no
  geolocation in the test pane).
- Role badges are keyword heuristics on the registry owner name and callsign (`ROLES`, `MIL_OPS`): a jet owned by a
  company with "Medical" in its name gets the cross, a police helicopter registered to a leasing trust gets nothing,
  and OpenSky-sourced records carry no `ownOp` at all. The feed's `dbFlags` military bit is the only hard signal.
  Shapes depend on the type code being in `TYPE_CLASS` (~430 codes) or the emitter category; anything else draws
  the generic plane.
- App Store: `ios/APP-STORE-CHECKLIST.md` lists what is still the user's to do. The two big ones: the listing cannot be
  called "FlightScope" (an existing radar brand with App Store apps; the code and page title can stay) and the data
  sources' terms (OpenSky is non-commercial only, Esri's legacy tile endpoints and the OSM tile policy need checking
  for an app). The Swift sources have never been compiled, and a guideline 4.2 ("not just a website") decision is a
  reviewer's judgement; the native location, share sheet, haptics, quick actions and offline screens are the case.
- `flightscope-worker.js` is only as fresh as the last `--build-worker` run; nothing reminds you to rerun it. It also cannot get a feed from
  Cloudflare any more (see its Files row), so sharing with someone off the home network needs the home relay exposed instead.
- No tests. The page's only runtime dependency is Leaflet 1.9.4 (cdnjs); the relay has none.
