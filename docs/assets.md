# Artwork and previews

The app icon is drawn by code, not an image file: `iconPixels()` in `flightscope-server.js` renders the radar scope (the page's airliner outline on a dark tile with range rings and a sweep) at any size. The relay serves it as `/icon-*.png` and `/favicon.ico`, and `node flightscope-server.js --build-icon` writes the same bytes to `FlightScope.ico`. It is distributed under this project's MIT license.

`docs/demo.jpg`, `docs/satellite.jpg`, `docs/list.jpg` and `docs/phone.jpg` were captured on 2026-11-13 from the running app in a headless Chrome, with the relay fetching live public ADS-B data over New York. `docs/demo.gif` and `docs/demo.mp4` are the same desktop view recorded for three minutes at one frame every two seconds and played at 30× speed, without audio. Screenshots do not include the desktop or browser chrome.

- **Aircraft photos.** Planespotters.net was blocked during the capture, so every photo shown is a Wikimedia Commons type photo. Its author and license appear in the panel's credit line, as they do in the app.
- **Maps.** Basemap tiles are from Esri (World Imagery, World Light and Dark Gray Canvas), credited in the corner of each image.
- **Aircraft data.** Callsigns, registrations, operators and positions are public ADS-B broadcasts and registry data as reported by adsb.fi at the time of capture. Routes come from the adsb.lol / adsb.im callsign database and can be wrong.
- **Location.** The captures use fixed New York views. No one's own location appears in them.
