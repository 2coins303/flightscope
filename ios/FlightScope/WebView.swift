import SwiftUI
import WebKit
import CoreLocation
import SafariServices

/// The native side of the page's bridge (see "native app bridge" in flightscope.html).
/// Page → app: `window.webkit.messageHandlers.flightscope.postMessage({type: ...})` with
///   ready            the page finished loading its script
///   select           an aircraft was selected          → light haptic tap
///   share            {title, text, url}                → iOS share sheet
///   locate           the Locate button was pressed     → Core Location, answered with FlightScope.locate(lat, lon)
/// App → page: `FlightScope.locate(lat, lon, error)`, `FlightScope.select(hex)`, `FlightScope.showList(filter)`,
///   `FlightScope.refresh()`; `window.FLIGHTSCOPE_RELAY` (injected at document start) names the relay.
final class WebBridge: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, CLLocationManagerDelegate {
    @Published var pageReady = false
    @Published var loadFailed = false
    weak var webView: WKWebView?

    private let location = CLLocationManager()
    private var wantsLocation = false
    private let haptic = UIImpactFeedbackGenerator(style: .light)

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    // MARK: page → app

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            pageReady = true
            haptic.prepare()
        case "select":
            haptic.impactOccurred()
        case "share":
            share(body)
        case "locate":
            locate()
        default:
            break
        }
    }

    private func share(_ body: [String: Any]) {
        var items: [Any] = []
        if let text = body["text"] as? String { items.append(text) }
        if let link = body["url"] as? String, let url = URL(string: link) { items.append(url) }
        guard !items.isEmpty, let presenter = topViewController(), let webView else { return }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        // iPad presents this as a popover and needs an anchor.
        sheet.popoverPresentationController?.sourceView = webView
        sheet.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 90, width: 1, height: 1)
        presenter.present(sheet, animated: true)
    }

    // MARK: location (only while a Locate request is pending; nothing is stored)

    private func locate() {
        wantsLocation = true
        switch location.authorizationStatus {
        case .notDetermined:
            location.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            location.requestLocation()
        default:
            finishLocate(nil, error: "Location is off for \(Config.appName). Allow it in Settings.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard wantsLocation else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        case .denied, .restricted: finishLocate(nil, error: "Location permission denied")
        default: break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finishLocate(locations.last, error: nil)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finishLocate(nil, error: "Location unavailable")
    }

    private func finishLocate(_ loc: CLLocation?, error: String?) {
        guard wantsLocation else { return }
        wantsLocation = false
        if let c = loc?.coordinate {
            call("window.FlightScope && FlightScope.locate(\(c.latitude), \(c.longitude))")
        } else {
            call("window.FlightScope && FlightScope.locate(null, null, \(Self.jsString(error ?? "Location unavailable")))")
        }
    }

    // MARK: app → page

    func call(_ javascript: String) {
        webView?.evaluateJavaScript(javascript) { _, _ in }
    }

    func reload() {
        loadFailed = false
        pageReady = false
        webView?.load(URLRequest(url: Config.relayURL))
    }

    /// A JavaScript string literal (JSON encoding is a subset of JavaScript).
    static func jsString(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [s]), let array = String(data: data, encoding: .utf8) else { return "\"\"" }
        return String(array.dropFirst().dropLast())
    }

    // MARK: navigation: the page stays in the web view, outside links open in an in-app Safari sheet

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let sameHost = url.host?.lowercased() == Config.relayURL.host?.lowercased()
        if sameHost || url.scheme == "about" || url.scheme == "blob" {
            decisionHandler(.allow)
        } else if navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil {
            open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { open(url) }   // target="_blank" links: photo credits, the privacy page
        return nil
    }

    private func open(_ url: URL) {
        guard ["http", "https"].contains(url.scheme ?? ""), let presenter = topViewController() else {
            UIApplication.shared.open(url)
            return
        }
        presenter.present(SFSafariViewController(url: url), animated: true)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { loadFailed = true }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { loadFailed = true }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadFailed = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()   // iOS reclaimed the web process (memory pressure): come back instead of showing a blank view
    }

    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var controller = scene?.keyWindow?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        return controller
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var bridge: WebBridge

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = "FlightScopeApp/1.0"
        configuration.userContentController.add(bridge, name: "flightscope")
        let relay = WebBridge.jsString(Config.relayURL.absoluteString)
        configuration.userContentController.addUserScript(WKUserScript(source: "window.FLIGHTSCOPE_RELAY = \(relay);", injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = bridge
        webView.uiDelegate = bridge
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 12 / 255, green: 18 / 255, blue: 24 / 255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never   // the page lays itself out with env(safe-area-inset-*)
        webView.scrollView.bounces = false                            // no rubber-banding on a full-screen map
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        bridge.webView = webView
        webView.load(URLRequest(url: Config.relayURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
