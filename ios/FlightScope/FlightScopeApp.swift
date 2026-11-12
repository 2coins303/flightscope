import SwiftUI
import UIKit

@main
struct FlightScopeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// Registers the home-screen quick actions and routes them through SceneDelegate.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        application.shortcutItems = QuickAction.allCases.map(\.item)
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    // Cold start from a quick action.
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let item = connectionOptions.shortcutItem {
            QuickActions.shared.pending = QuickAction(rawValue: item.type)
        }
    }

    // Quick action while the app is already running.
    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        QuickActions.shared.pending = QuickAction(rawValue: shortcutItem.type)
        completionHandler(true)
    }
}

/// Home-screen quick actions (press and hold the app icon). Each one opens the in-app list with a filter.
enum QuickAction: String, CaseIterable {
    case nearest = "flightscope.nearest"
    case helicopters = "flightscope.helicopters"
    case military = "flightscope.military"
    case alerts = "flightscope.alerts"

    var item: UIApplicationShortcutItem {
        switch self {
        case .nearest:
            return UIApplicationShortcutItem(type: rawValue, localizedTitle: "Nearest aircraft", localizedSubtitle: nil,
                                             icon: UIApplicationShortcutIcon(systemImageName: "airplane"))
        case .helicopters:
            return UIApplicationShortcutItem(type: rawValue, localizedTitle: "Helicopters", localizedSubtitle: nil,
                                             icon: UIApplicationShortcutIcon(systemImageName: "fanblades"))
        case .military:
            return UIApplicationShortcutItem(type: rawValue, localizedTitle: "Military", localizedSubtitle: nil,
                                             icon: UIApplicationShortcutIcon(systemImageName: "star.circle"))
        case .alerts:
            return UIApplicationShortcutItem(type: rawValue, localizedTitle: "Emergency squawks", localizedSubtitle: nil,
                                             icon: UIApplicationShortcutIcon(systemImageName: "exclamationmark.triangle"))
        }
    }

    /// The page-side call (see the native bridge section of flightscope.html).
    var javascript: String {
        switch self {
        case .nearest: return "window.FlightScope && FlightScope.showList('all')"
        case .helicopters: return "window.FlightScope && FlightScope.showList('heli')"
        case .military: return "window.FlightScope && FlightScope.showList('mil')"
        case .alerts: return "window.FlightScope && FlightScope.showList('emg')"
        }
    }
}

final class QuickActions: ObservableObject {
    static let shared = QuickActions()
    @Published var pending: QuickAction?
}
