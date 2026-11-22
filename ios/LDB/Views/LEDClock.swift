import SwiftUI

/// Große Uhrzeit des Partners im LED-Stil: weiße Ziffern, kein Leuchten (konzept/01).
/// Platzhalter mit Monospace-Ziffern; später eine echte Segment-Schrift (z. B. DSEG7, OFL-Lizenz) einbinden.
struct LEDClock: View {
    let timezone: TimeZone

    var body: some View {
        TimelineView(.everyMinute) { context in
            VStack(alignment: .leading, spacing: 4) {
                Text(time(context.date))
                    .font(.system(size: 72, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                Text(subtitle(context.date))
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = timezone
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    private func subtitle(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = timezone
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "EEEE"
        let city = timezone.identifier.split(separator: "/").last.map { $0.replacingOccurrences(of: "_", with: " ") } ?? ""
        let diffHours = Double(timezone.secondsFromGMT(for: date) - TimeZone.current.secondsFromGMT(for: date)) / 3600
        let diff = diffHours == 0 ? "gleiche Zeit" : String(format: "%+.0f h", diffHours)
        return "\(f.string(from: date)) · \(city) · \(diff)"
    }
}
