import SwiftUI
import UIKit

private let mapBackground = Color(red: 12 / 255, green: 18 / 255, blue: 24 / 255)
private let accent = Color(red: 244 / 255, green: 177 / 255, blue: 63 / 255)

struct ContentView: View {
    @StateObject private var bridge = WebBridge()
    @StateObject private var network = NetworkMonitor()
    @ObservedObject private var quickActions = QuickActions.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            mapBackground.ignoresSafeArea()
            WebView(bridge: bridge).ignoresSafeArea()
            if !network.online {
                StatusScreen(symbol: "wifi.slash", title: "You're offline",
                             message: "\(Config.appName) needs an internet connection for live aircraft positions. It reconnects by itself.")
            } else if bridge.loadFailed {
                StatusScreen(symbol: "antenna.radiowaves.left.and.right.slash", title: "Can't reach the flight relay",
                             message: "Check your connection and try again.", actionTitle: "Try again", action: { bridge.reload() })
            } else if !bridge.pageReady {
                ProgressView().tint(.white).scaleEffect(1.4)
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }   // a radar display should not dim while it is on screen
        .onChange(of: scenePhase) { phase in
            UIApplication.shared.isIdleTimerDisabled = phase == .active
            if phase == .active { bridge.call("window.FlightScope && FlightScope.refresh()") }   // fresh positions on return, not a stale frame
        }
        .onChange(of: network.online) { online in
            if online && bridge.loadFailed { bridge.reload() }
        }
        .onChange(of: bridge.pageReady) { _ in runPendingQuickAction() }
        .onReceive(quickActions.$pending) { _ in DispatchQueue.main.async { runPendingQuickAction() } }
    }

    private func runPendingQuickAction() {
        guard bridge.pageReady, let action = quickActions.pending else { return }
        quickActions.pending = nil
        bridge.call(action.javascript)
    }
}

/// Full-screen native message (offline, relay unreachable) instead of a blank or broken web view.
private struct StatusScreen: View {
    let symbol: String
    let title: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 44)).foregroundStyle(accent)
            Text(title).font(.title2.bold())
            Text(message).multilineTextAlignment(.center).foregroundStyle(.secondary)
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.borderedProminent).tint(accent).padding(.top, 6)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(mapBackground.ignoresSafeArea())
        .foregroundStyle(.white)
    }
}
