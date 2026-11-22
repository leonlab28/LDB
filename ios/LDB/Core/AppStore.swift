import Foundation
import Observation

/// Zentraler Zustand: Kopplung, eigener Stand (Bearbeiten) und Stand des Partners (Anzeige).
@MainActor
@Observable
final class AppStore {
    private(set) var baseURL: URL?
    private(set) var deviceKey: String?
    var me: Snapshot?
    var partner: Snapshot?
    var lastError: String?

    var isPaired: Bool { baseURL != nil && deviceKey != nil }

    private var client: APIClient? {
        guard let baseURL, let deviceKey else { return nil }
        return APIClient(baseURL: baseURL, deviceKey: deviceKey)
    }

    init() {
        if let url = UserDefaults.standard.string(forKey: "baseURL") { baseURL = URL(string: url) }
        deviceKey = Keychain.get("deviceKey")
    }

    func pair(serverURL: String, pairingCode: String, person: String, deviceName: String) async {
        guard let url = URL(string: serverURL.trimmingCharacters(in: .whitespaces)), url.scheme == "https" || url.host == "localhost" else {
            lastError = "Server-Adresse muss mit https:// beginnen"
            return
        }
        do {
            let reg = try await APIClient.register(baseURL: url, pairingCode: pairingCode, person: person, deviceName: deviceName)
            Keychain.set(reg.deviceKey, for: "deviceKey")
            UserDefaults.standard.set(url.absoluteString, forKey: "baseURL")
            baseURL = url
            deviceKey = reg.deviceKey
            lastError = nil
            try? await client?.setTimezone(TimeZone.current.identifier)
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func unpair() {
        Keychain.delete("deviceKey")
        UserDefaults.standard.removeObject(forKey: "baseURL")
        deviceKey = nil
        baseURL = nil
        me = nil
        partner = nil
    }

    func refresh() async {
        guard let client else { return }
        do {
            async let m = client.me()
            async let p = client.partner()
            (me, partner) = try await (m, p)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Führt eine Änderung aus und lädt danach neu. Fehler landen in `lastError`.
    func perform(_ action: (APIClient) async throws -> Void) async {
        guard let client else { return }
        do {
            try await action(client)
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
