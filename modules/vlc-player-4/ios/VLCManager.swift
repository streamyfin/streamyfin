class VLCManager {
    static let shared = VLCManager()
    var listeners: [SimpleAppLifecycleListener] = []
}