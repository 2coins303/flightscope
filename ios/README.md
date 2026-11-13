# FlightScope for iOS

A native shell around the FlightScope page: a full-screen WKWebView plus the things a web page cannot do on
iOS. The page itself is unchanged and still works in any browser; the app loads it from your relay, so page
updates reach the app without a new release.

What the app adds (this is what App Review weighs under guideline 4.2, "minimum functionality"):

- **Core Location** for the launch view and the Locate button: the system permission prompt with a purpose string.
- **Share sheet** from the aircraft panel's Share button, with a deep link that reopens that aircraft.
- **Haptic tap** when an aircraft is selected.
- **Home-screen quick actions** (press and hold the icon): Nearest aircraft, Helicopters, Military, Emergency squawks.
- **Offline and error screens** of its own, automatic reload when the connection returns or iOS kills the web process.
- Screen stays awake while the app is in front; outside links open in an in-app Safari sheet; no browser
  chrome, no rubber-banding; status bar and home-indicator areas are handled by the page's safe-area CSS.

Written on Windows without Xcode: the Swift files have not been compiled. They use only public, long-standing
APIs (iOS 16 and up), but expect a warning or a small fix on first build.

## You need

- A Mac with Xcode 15 or newer, an Apple Developer Program membership (US$99 a year) and an iPhone to test on.
- The relay on the internet over HTTPS: deploy `flightscope-worker.js` to Cloudflare Workers (README.txt) or run
  `flightscope-server.js` behind an HTTPS proxy. Before building, check that these answer:
  `https://<your-host>/api/health`, `https://<your-host>/privacy`, `https://<your-host>/icon-1024.png`.
- `FLIGHTSCOPE_CONTACT` set on that host. The privacy page prints it, and a reviewer reads that page.

## Build

1. Xcode → File → New → Project → iOS → App. Interface SwiftUI, language Swift. Product name: see the
   checklist before you pick one. Bundle identifier: your own reverse domain.
2. Delete the template's `ContentView.swift` and `<Name>App.swift`. Drag the six files from `ios/FlightScope/`
   into the project (copy items, add to the app target).
3. In `Config.swift` set `relayURL` to your host.
4. Target → Info → Custom iOS Target Properties, add:
   - `Privacy - Location When In Use Usage Description` (`NSLocationWhenInUseUsageDescription`):
     "Used when the map opens and when you tap Locate, to centre the map and range rings on you. Your position is not sent anywhere."
   - `App Uses Non-Exempt Encryption` (`ITSAppUsesNonExemptEncryption`): NO. The app only uses HTTPS, so
     App Store Connect will not ask about export compliance on every upload.
5. App icon: download `https://<your-host>/icon-1024.png` and drop it into Assets → AppIcon (Xcode 14 and later
   take a single 1024 image). It is the page's airliner on the map's dark background; replace it with your own
   artwork if you prefer, as long as it stays an opaque square with no transparency.
6. Target → General → Minimum Deployments: iOS 16. Supported destinations: iPhone and iPad (the page is
   responsive; test both, a reviewer often uses an iPad).
7. Signing & Capabilities: pick your team. No capabilities are needed; location is a usage-description key.
8. Optional: a launch screen colour matching the page (`#0c1218`) under General → App Icons and Launch Screen,
   so the first frame is not white.
9. Run on a device and go through "Test before submitting" in `APP-STORE-CHECKLIST.md`.
10. Product → Archive → Distribute App → App Store Connect. Create the app record, upload screenshots, fill in
    App Privacy, set the privacy policy URL to `https://<your-host>/privacy`, paste the review notes, submit.

## How the bridge works

The page detects `window.webkit.messageHandlers.flightscope` and posts it JSON messages; the app calls back
through `window.FlightScope`.

| Direction | Message or call | Meaning |
|---|---|---|
| page → app | `{type:"ready"}` | script loaded; the app hides its spinner |
| page → app | `{type:"select", hex, callsign}` | an aircraft was selected; the app taps the haptic engine |
| page → app | `{type:"share", title, text, url}` | the Share button; the app opens `UIActivityViewController` |
| page → app | `{type:"locate"}` | the Locate button; the app asks Core Location |
| app → page | `FlightScope.locate(lat, lon)` or `FlightScope.locate(null, null, "why")` | answer to `locate` |
| app → page | `FlightScope.select(hex)` | select an aircraft (waits for the feed if it is not loaded yet) |
| app → page | `FlightScope.showList(filter)` | open the list with a filter: `all`, `air`, `gnd`, `heli`, `mil`, `emg` |
| app → page | `FlightScope.refresh()` | fetch the feed now (used when the app returns to the foreground) |
| app → page | `window.FLIGHTSCOPE_RELAY` | injected at document start; the page uses `<it>/api` |

Share links look like `https://<host>/#icao=a1b2c3&lat=40.7&lon=-73.9&z=10`; the page views that spot and
selects the aircraft once the feed has it.

## Not included

- Universal links (opening a shared link in the app instead of Safari) need an Associated Domains entitlement
  and an `apple-app-site-association` file on the host.
- Widgets, Live Activities and notifications. Any of them would strengthen the 4.2 case further.
