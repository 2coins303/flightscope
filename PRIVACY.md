# Privacy

FlightScope shows live aircraft positions from open ADS-B networks on a map. It has no accounts, no advertising, no analytics and no tracking. This page describes the little data that moves when you use it. The running relay serves the same notice at `/privacy`.

## Location

Your device location is used when the map opens (**Settings → On launch**, which can keep the map where you left it instead) and when you press **Locate**: the map and the optional range rings centre on you. The browser or the iPhone app asks for permission first, and everything works without it. The position itself is not sent anywhere. The map view it produces is saved on your device like any other map position, and the next feed request covers that area.

Browsers allow location only on `https://` addresses and `http://localhost`. When a phone opens the relay at a home-network address over plain http, the map opens at its last view.

## What leaves your device

- **The map area.** To list the aircraft in view, the page sends the centre and radius of the map to the relay, which forwards them to the flight data providers below.
- **Aircraft identifiers.** Selecting an aircraft sends its transponder code or callsign to the relay for the route, photo and flight-history lookups, and to Wikipedia / Wikimedia Commons for fallback photos.
- **Map tiles.** Map images load directly from the tile providers, which see your IP address and the tile coordinates, as with any web map.
- **Fallback relays.** If no FlightScope relay answers, the page tries the public relays allorigins.win and codetabs.com for the feed request.

The relay listens only on `127.0.0.1` unless `HOST` says otherwise. It keeps a few seconds of feed replies and a minute of flight histories in memory to avoid duplicate requests, and writes nothing to disk.

## Stored on your device

Settings (map style, units, refresh rate, overlays, launch view), the last map position and a small cache of aircraft type photos are kept in the browser's local storage.

## Third-party services

- **Flight data:** [adsb.fi](https://adsb.fi), [adsb.lol](https://adsb.lol), [airplanes.live](https://airplanes.live), [The OpenSky Network](https://opensky-network.org) for positions and flight history; [adsb.im](https://adsb.im) and adsb.lol for route lookups.
- **Photos:** [Planespotters.net](https://www.planespotters.net), [Wikipedia](https://www.wikipedia.org) and [Wikimedia Commons](https://commons.wikimedia.org).
- **Maps:** Esri basemaps, [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [RainViewer](https://www.rainviewer.com) rain radar, Google Fonts.

Each service receives only what it needs to answer the request and applies its own privacy policy. The relay identifies itself to them with the contact address in `FLIGHTSCOPE_CONTACT`, if you set one.
