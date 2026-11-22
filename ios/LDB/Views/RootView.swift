import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if store.isPaired {
                TabView {
                    DisplayView()
                        .tabItem { Label("Anzeige", systemImage: "heart.text.square") }
                    EditView()
                        .tabItem { Label("Bearbeiten", systemImage: "slider.horizontal.3") }
                }
            } else {
                PairingView()
            }
        }
        .tint(Retro.amber)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refresh() } }
        }
    }
}

/// Vorläufige Retro-Palette. Wird in der Design-Phase ersetzt.
enum Retro {
    static let background = Color(red: 0.07, green: 0.07, blue: 0.08)
    static let card = Color(red: 0.13, green: 0.13, blue: 0.15)
    static let amber = Color(red: 1.0, green: 0.71, blue: 0.24)
    static let free = Color(red: 0.36, green: 0.80, blue: 0.45)
    static let busy = Color(red: 0.95, green: 0.33, blue: 0.29)
    static let sleeping = Color(red: 0.45, green: 0.50, blue: 0.95)

    static func color(for state: TrafficState) -> Color {
        switch state {
        case .free: free
        case .busy: busy
        case .sleeping: sleeping
        }
    }
}

struct WidgetCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold).monospaced())
                .foregroundStyle(.secondary)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Retro.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
