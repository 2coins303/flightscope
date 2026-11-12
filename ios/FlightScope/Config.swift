import Foundation

/// Build-time settings for the FlightScope iOS app.
enum Config {
    /// Where the FlightScope page and its relay are hosted: the Cloudflare Worker built from flightscope-worker.js,
    /// or any machine running flightscope-server.js behind HTTPS. App Transport Security requires https.
    /// The app loads the page from here and the page talks to <relayURL>/api.
    static let relayURL = URL(string: "https://flightscope.example.workers.dev")!

    /// Shown in the offline and error screens.
    static let appName = "FlightScope"
}
