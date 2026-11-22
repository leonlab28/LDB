import Foundation

/// Spiegelt die Antwort von GET /v1/me und GET /v1/partner. Zeitstempel sind UTC-Millisekunden.
struct Snapshot: Decodable {
    let serverTime: Int64
    let viewer: String
    let person: Person?
    let trafficLight: TrafficLight?
    let voice: Voice?
    let photos: [Photo]
    let notes: [Note]
    let location: Location?

    struct Person: Decodable {
        let id: String
        let displayName: String
        let timezone: String?
    }

    struct TrafficLight: Decodable {
        let manual: Manual?
        let emoji: String?
        let note: String?
        struct Manual: Decodable {
            let state: TrafficState
            let setAt: Int64?
            let until: Int64?
        }
    }

    struct Voice: Decodable {
        let durationMs: Int
        let waveform: [Double]?
        let senderTimezone: String?
        let recordedAt: Int64
        let listenedAt: Int64?
    }

    struct Photo: Decodable, Identifiable {
        let id: String
        let caption: String?
        let createdAt: Int64
        let expiresAt: Int64
        let seenAt: Int64?
        let keptAt: Int64?
    }

    struct Note: Decodable, Identifiable {
        let id: String
        let kind: String
        let body: String
        let color: String?
        let done: Int
        let createdAt: Int64
        let expiresAt: Int64
        let seenAt: Int64?
    }

    struct Location: Decodable {
        let lat: Double?
        let lon: Double?
        let paused: Int
        let updatedAt: Int64
    }
}

enum TrafficState: String, Codable, CaseIterable, Identifiable {
    case free, busy, sleeping
    var id: String { rawValue }

    var label: String {
        switch self {
        case .free: "frei"
        case .busy: "busy"
        case .sleeping: "schläft"
        }
    }
}

extension Int64 {
    var date: Date { Date(timeIntervalSince1970: TimeInterval(self) / 1000) }
}
