import Foundation
import Network

/// Publishes whether the device has a usable network path, so the app can show its own offline screen
/// instead of a blank web view.
final class NetworkMonitor: ObservableObject {
    @Published private(set) var online = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.online = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "flightscope.network"))
    }

    deinit { monitor.cancel() }
}
