import SwiftUI

/// Anzeige-Ansicht: was ich vom Partner sehe. Nur lesen, nichts bearbeiten.
struct DisplayView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let error = store.lastError {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                    clockCard
                    trafficCard
                    voiceCard
                    notesCard
                    photosCard
                }
                .padding()
            }
            .background(Retro.background)
            .navigationTitle(store.partner?.person?.displayName ?? "Partner")
            .refreshable { await store.refresh() }
            .task { await store.refresh() }
        }
    }

    private var partner: Snapshot? { store.partner }

    private var clockCard: some View {
        WidgetCard(title: "Uhrzeit") {
            if let id = partner?.person?.timezone, let tz = TimeZone(identifier: id) {
                LEDClock(timezone: tz)
            } else {
                Text("--:--").font(.system(size: 72, weight: .bold, design: .monospaced))
            }
            // Wetter kommt in einem eigenen Schritt (WeatherKit, braucht den Developer-Account).
        }
    }

    private var trafficCard: some View {
        WidgetCard(title: "Status") {
            if let manual = partner?.trafficLight?.manual {
                HStack(spacing: 12) {
                    Circle().fill(Retro.color(for: manual.state)).frame(width: 22, height: 22)
                    Text(manual.state.label).font(.title2.weight(.semibold))
                    if let emoji = partner?.trafficLight?.emoji { Text(emoji).font(.title2) }
                }
            } else {
                // Auswertung des Wochenplans folgt; bis dahin nur manuelle Zustände.
                Text("Wochenplan (noch nicht ausgewertet)").foregroundStyle(.secondary)
            }
        }
    }

    private var voiceCard: some View {
        WidgetCard(title: "Sprachnachricht") {
            if let voice = partner?.voice {
                HStack {
                    Image(systemName: voice.listenedAt == nil ? "recordingtape" : "checkmark.circle")
                    Text("\(voice.durationMs / 1000) s · \(voice.recordedAt.date.formatted(.relative(presentation: .named)))")
                    Spacer()
                    if voice.listenedAt == nil { Text("NEU").font(.caption.bold()).foregroundStyle(Retro.amber) }
                }
            } else {
                Text("Kein Band eingelegt").foregroundStyle(.secondary)
            }
        }
    }

    private var notesCard: some View {
        WidgetCard(title: "Post-its") {
            if let notes = partner?.notes, !notes.isEmpty {
                ForEach(notes) { note in
                    Text(note.body)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Retro.amber.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                        .task {
                            if note.seenAt == nil { await store.perform { try await $0.markNoteSeen(id: note.id) } }
                        }
                }
            } else {
                Text("Keine Post-its").foregroundStyle(.secondary)
            }
        }
    }

    private var photosCard: some View {
        WidgetCard(title: "Foto-Dump") {
            let count = partner?.photos.count ?? 0
            Text(count == 0 ? "Heute noch keine Fotos" : "\(count) Foto(s) in den letzten 24 h")
                .foregroundStyle(count == 0 ? .secondary : .primary)
        }
    }
}
