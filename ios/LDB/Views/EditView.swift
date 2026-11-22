import SwiftUI

/// Bearbeiten-Ansicht: was ich von mir zeige.
struct EditView: View {
    @Environment(AppStore.self) private var store
    @State private var newNote = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Meine Zeitzone") {
                    LabeledContent("Gespeichert", value: store.me?.person?.timezone ?? "–")
                    Button("Auf \(TimeZone.current.identifier) setzen") {
                        Task { await store.perform { try await $0.setTimezone(TimeZone.current.identifier) } }
                    }
                }

                Section {
                    ForEach(TrafficState.allCases) { state in
                        Button {
                            // Platzhalter: endet nach 2 h. Später endet die Überschreibung beim nächsten Planwechsel.
                            Task { await store.perform { try await $0.setTrafficLight(state, until: .now.addingTimeInterval(2 * 3600)) } }
                        } label: {
                            HStack {
                                Circle().fill(Retro.color(for: state)).frame(width: 14, height: 14)
                                Text(state.label)
                                Spacer()
                                if store.me?.trafficLight?.manual?.state == state { Image(systemName: "checkmark") }
                            }
                        }
                    }
                    Button("Zurück zum Wochenplan", role: .destructive) {
                        Task { await store.perform { try await $0.setTrafficLight(nil, until: nil) } }
                    }
                } header: {
                    Text("Ampel (manuell)")
                }

                Section("Meine Post-its (24 h)") {
                    ForEach(store.me?.notes ?? []) { note in
                        HStack {
                            Text(note.body)
                            Spacer()
                            if note.seenAt != nil { Text("👀") }
                        }
                        .swipeActions {
                            Button("Löschen", role: .destructive) {
                                Task { await store.perform { try await $0.deleteNote(id: note.id) } }
                            }
                        }
                    }
                    HStack {
                        TextField("Neues Post-it", text: $newNote)
                        Button("Anheften") {
                            let text = newNote
                            newNote = ""
                            Task { await store.perform { try await $0.addNote(text) } }
                        }
                        .disabled(newNote.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section("Standort") {
                    Button("Standort pausieren") {
                        Task { await store.perform { try await $0.setLocationPaused() } }
                    }
                }

                Section {
                    Button("Gerät entkoppeln", role: .destructive) { store.unpair() }
                }
            }
            .navigationTitle("Bearbeiten")
            .task { await store.refresh() }
        }
    }
}
