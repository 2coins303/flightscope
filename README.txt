FlightScope - live flight radar
================================

Double-click  FlightScope.cmd  to start the map. It launches a small relay in the
background (node flightscope-server.js on port 8787) and opens http://localhost:8787
in your browser. The relay fetches the open ADS-B feeds (adsb.fi, adsb.lol,
airplanes.live, OpenSky) because those feeds refuse direct calls from a web page.

Desktop icon: open a command prompt in this folder and run  FlightScope.cmd shortcut
once. It puts a FlightScope shortcut with the radar icon on your desktop. The icon is
FlightScope.ico next to the launcher; node flightscope-server.js --build-icon redraws it.

flightscope.html also works when opened directly, as long as the relay is running.
If it is not, the page tries two public fallback relays, which are slower and not
guaranteed.

To stop the relay: Task Manager > end "Node.js JavaScript Runtime", or just reboot.

Hosting it on the internet: run  node flightscope-server.js --build-worker  to produce
flightscope-worker.js, then paste that file into a Cloudflare Worker. The settings
below go in the Worker's variables/secrets instead of flightscope.env. Rerun the
command whenever flightscope.html or the relay changes.
Note: since November 2026 the flight feeds refuse Cloudflare's servers (adsb.lol now
allows each address 500 requests a day, and Cloudflare's addresses are shared), so a
Worker shows the map but no aircraft. Share the relay on your own PC instead.

Your location: when the map opens it asks for your location and goes there, zoomed to
about what you would see from 2,000 ft up. Settings > On launch picks 10,000 or 35,000 ft,
or keeps the map where you left it. The browser asks permission once. It works at
http://localhost and on https addresses; at http://<PC address> on another device the
map simply opens where it was left.

On a phone: open the relay's address in Safari or Chrome and use "Add to Home Screen".
The page installs as a full-screen app with its own icon. The relay also serves a
privacy notice at /privacy (it prints FLIGHTSCOPE_CONTACT, so set that) and the app
icon at /icon-1024.png.

App Store: the ios folder holds a native iOS wrapper (Swift sources, build steps in
ios/README.md, review checklist in ios/APP-STORE-CHECKLIST.md). It needs a Mac with
Xcode, an Apple developer account and the relay hosted on the internet over HTTPS.

Optional settings. Put them in a file called flightscope.env next to
flightscope-server.js, one KEY=VALUE per line (FlightScope.cmd picks it up), or set
them as environment variables:
  FLIGHTSCOPE_CONTACT=you@example.com   a way for the feed operators to reach you
                                        (sent in the User-Agent; the relay nags until set)
  HOST=0.0.0.0                          also serve the map to other devices on your
                                        network; the startup line prints the address
                                        to open on a phone, e.g. http://192.168.1.20:8787
  PORT=8787                             a different port
  OPENSKY_CLIENT_ID=...                 an OpenSky API client (free account, then
  OPENSKY_CLIENT_SECRET=...             "API client" on opensky-network.org/my-opensky).
                                        Raises the OpenSky quota used for the flight
                                        history that loads when you select an aircraft
                                        (about 400 a day without). Keep this file private.
