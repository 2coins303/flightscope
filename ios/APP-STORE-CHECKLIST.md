# App Store review checklist for FlightScope

What is already handled in the code, what you still have to do, and what nobody can promise. App Review is a
human judgement; this removes the concrete, known reasons for a rejection.

## 1. The name

**Do not submit it as "FlightScope".** FlightScope is an established radar company (golf launch monitors) with
apps already on the App Store. App names must be unique in App Store Connect, and guideline 5.2.1 (intellectual
property) covers names that imitate an existing brand. Pick another listing name; the code and the page title
can stay as they are, or change the `<title>`, `apple-mobile-web-app-title`, manifest name and `Config.appName`
to match. Avoid other companies' trademarks in the name, subtitle and keywords (no "Flightradar24", "FlightAware").

## 2. Guidelines, one by one

| Guideline | Status | What to do |
|---|---|---|
| 4.2 Minimum functionality (not a repackaged website) | Native location, share sheet, haptics, quick actions, offline/error screens, keep-awake, in-app Safari for outside links. | Mention these in the review notes. Do not strip them out. If a reviewer still cites 4.2, the appeal should list them and the live data, interactive map and per-aircraft details. |
| 4.2.2 Not a web clipping / collection of links | An interactive live map, not links. | Nothing. |
| 2.1 App completeness | No login, no placeholders in the app. The privacy page falls back to "no contact configured" text if `FLIGHTSCOPE_CONTACT` is missing. | Set `FLIGHTSCOPE_CONTACT`. Test on iPhone and iPad (the share popover is anchored for iPad). Make sure the relay is up during review. |
| 2.3 Accurate metadata | Screenshots must come from the real app. | Take them on the device, iPhone 6.7" and iPad 13" sizes. Describe it as live aircraft positions from open ADS-B networks, no account needed. |
| 2.5.2 Code download | Web content in WKWebView is permitted; the page does not alter the native app's features. | Nothing. |
| 4.0 Design | Safe areas via `env(safe-area-inset-*)`, dark and light follow the system, landscape works. | Check the Dynamic Island and home indicator do not cover the header or the bottom sheet. |
| 5.1.1 Data collection and storage | Purpose string for location; privacy page at `/privacy`; "Privacy & data sources" link in the Settings sheet. | Put `https://<host>/privacy` in the Privacy Policy URL field. Fill in App Privacy (section 3). |
| 5.1.2 Data use and sharing | Coordinates go to the relay and the flight-data providers only to answer the request; no third-party SDKs, analytics or ads. | Nothing, as long as you add none. |
| 5.1.5 Location services | Used when the map opens (Settings, On launch; can be turned off) and for Locate; the app works without permission; a refusal at launch keeps the last view, at Locate it shows a status message. | Keep the purpose string honest. |
| 5.2.1 Name and branding | See section 1. | Rename the listing. |
| 5.2.2 Third-party content and terms | See section 4. | Check the terms of each data source for an App Store app; keep the app free with no ads unless you have licences that allow more. |
| 2.4.1 iPad | Universal app, responsive layout. | Test split view and rotation on an iPad. |
| 4.8 Sign in with Apple, 3.1 Payments, 1.2 User content | Not applicable: no accounts, purchases or user content. | Nothing. |
| Export compliance | HTTPS only. | `ITSAppUsesNonExemptEncryption` = NO in Info.plist. |
| Age rating | No objectionable content. | Answer the questionnaire; it comes out 4+. |

## 3. App Privacy answers (App Store Connect → App Privacy)

The app sends the map centre and radius to your relay and on to the flight-data providers; after the launch view or Locate that is
the user's position. Your relay does not store it, which arguably makes it "not collected" under Apple's
definition, but the safe declaration is:

- **Location → Precise Location**: collected. Purpose: App Functionality. Linked to the user's identity: No.
  Used for tracking: No.
- Everything else (contact info, identifiers, usage data, diagnostics, user content, purchases): not collected.

Do not add analytics, crash-reporting SDKs or ads without updating this and the privacy page.

## 4. Data sources and their terms (guideline 5.2.2)

Check these yourself before submitting; terms change and this is not legal advice.

- **adsb.fi, adsb.lol**: open, free APIs for personal and community use; the relay identifies itself with a
  contact User-Agent (set `FLIGHTSCOPE_CONTACT`). Ask them if you expect real traffic.
- **The OpenSky Network**: free for non-commercial use only; commercial use (which a paid app or ads can be)
  needs a licence. Keep the app free with no ads, or get an agreement. The flight history on selection comes
  from OpenSky.
- **airplanes.live**: needs a contact arrangement; it currently answers 403 and the relay just skips it.
- **Planespotters.net**: photos must show the photographer credit and link back to the photo page. The panel does.
- **Wikipedia / Wikimedia Commons**: the panel shows author and licence for type photos. Fine.
- **Esri basemaps**: the legacy `arcgisonline.com` tile endpoints are used without an API key. Esri's current
  terms expect an ArcGIS account or Location Platform key for apps; get a free-tier key and add it, or switch
  the default style to a provider whose terms you have checked.
- **OpenStreetMap tiles**: the OSM tile servers' usage policy discourages distribution in apps without
  permission. The app defaults to Esri; OSM is one selectable style and the automatic fallback. Keep it that
  way or self-host tiles if the app gets popular.
- **RainViewer**: public API with attribution, which the map shows. Fine.
- **Google Fonts**: fine.

## 5. Review notes (paste into "Notes" for the reviewer, with your host filled in)

> <Name> shows live aircraft positions from open ADS-B networks (adsb.fi, adsb.lol, OpenSky) on a map, with
> trails, routes, photos and details for each aircraft. No account or sign-in is needed; the app is free with
> no ads or purchases. Native features: Locate uses Core Location (the app works fully if permission is
> declined), Share opens the system share sheet, selecting an aircraft gives haptic feedback, the home-screen
> quick actions open filtered lists, and the app shows its own offline screen without a connection. Data comes
> through our relay at https://<host>; privacy policy: https://<host>/privacy. The default view is the New York
> area, where traffic is always visible; tap any aircraft for its details.

## 6. Test before submitting (on a real device)

1. Cold launch: spinner, then aircraft within about 10 seconds. No white flash, map fills the screen.
2. Tap an aircraft: haptic tap, details panel opens, trail draws. Close it. Tap a list row.
3. Share: the share sheet appears (iPhone and iPad). Send the link to yourself; opening it in Safari views that
   spot and selects the aircraft.
4. First launch: the permission prompt appears with your purpose string; allow → the map opens on you at the On launch
   height, and Locate centres on you again. Reinstall, deny → the map opens at the last view; Locate then shows the
   message and the app keeps working.
5. Airplane mode: the offline screen appears; turn it off: the map comes back by itself. Stop the relay (or use a
   wrong `relayURL`): the retry screen appears; Try again works once it is reachable.
6. Quick actions: press and hold the icon from cold and while running; each opens the right list.
7. Links: FlightAware, Flightradar24, photo credits and "Privacy & data sources" open in the in-app Safari sheet
   and Done returns to the map.
8. Rotate, dark and light mode, iPad split view. Background the app for a minute, return: positions refresh.
9. Settings sheet: every control works; the privacy link opens.

## 7. What nobody can guarantee

Reviewers differ. A 4.2 rejection can happen to any web-view app; the reply is the feature list above plus
the live, interactive nature of the content. If it happens, answer in the Resolution Center with specifics
rather than resubmitting unchanged.
