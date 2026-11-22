import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { "\(message) (\(status))" }
}

/// Dünner Client für den Cloudflare-Worker. Jede Anfrage trägt den Geräteschlüssel als Bearer-Token.
struct APIClient {
    let baseURL: URL
    let deviceKey: String?

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    struct Registration: Decodable {
        let deviceId: String
        let person: String
        let deviceKey: String
    }

    static func register(baseURL: URL, pairingCode: String, person: String, deviceName: String) async throws -> Registration {
        let client = APIClient(baseURL: baseURL, deviceKey: nil)
        return try await client.request(
            "POST", "/v1/devices/register",
            json: ["pairing_code": pairingCode, "person": person, "device_name": deviceName]
        )
    }

    func me() async throws -> Snapshot { try await request("GET", "/v1/me") }
    func partner() async throws -> Snapshot { try await request("GET", "/v1/partner") }

    func setTimezone(_ tz: String) async throws {
        try await send("PUT", "/v1/me/profile", json: ["timezone": tz])
    }

    /// `state == nil` hebt die manuelle Überschreibung auf, dann gilt wieder der Wochenplan.
    func setTrafficLight(_ state: TrafficState?, until: Date?) async throws {
        var payload: [String: Any] = ["manual": NSNull()]
        if let state {
            var manual: [String: Any] = ["state": state.rawValue]
            if let until { manual["until"] = Int64(until.timeIntervalSince1970 * 1000) }
            payload["manual"] = manual
        }
        try await send("PUT", "/v1/me/traffic-light", json: payload)
    }

    func addNote(_ body: String) async throws {
        try await send("POST", "/v1/me/notes", json: ["body": body])
    }

    func deleteNote(id: String) async throws {
        try await send("DELETE", "/v1/me/notes/\(id)")
    }

    func markNoteSeen(id: String) async throws {
        try await send("POST", "/v1/partner/notes/\(id)/seen")
    }

    func setLocationPaused() async throws {
        try await send("PUT", "/v1/me/location", json: ["paused": true])
    }

    // MARK: - Transport

    private func send(_ method: String, _ path: String, json: [String: Any]? = nil) async throws {
        _ = try await raw(method, path, json: json)
    }

    private func request<T: Decodable>(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> T {
        let data = try await raw(method, path, json: json)
        return try Self.decoder.decode(T.self, from: data)
    }

    private func raw(_ method: String, _ path: String, json: [String: Any]?) async throws -> Data {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.timeoutInterval = 20
        if let deviceKey { req.setValue("Bearer \(deviceKey)", forHTTPHeaderField: "Authorization") }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(status: status, message: msg ?? "Serverfehler")
        }
        return data
    }
}
