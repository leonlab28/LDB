import SwiftUI
import UIKit

/// Einmalige Kopplung: Server-Adresse + Kopplungscode eingeben, Person wählen.
/// Der Code wird nur an den eigenen Worker geschickt und nirgends gespeichert.
struct PairingView: View {
    @Environment(AppStore.self) private var store
    @State private var serverURL = "https://ldb-api.<dein-subdomain>.workers.dev"
    @State private var code = ""
    @State private var person = "a"
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("https://…workers.dev", text: $serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
                Section("Kopplungscode") {
                    SecureField("Code", text: $code)
                }
                Section("Wer bist du?") {
                    Picker("Person", selection: $person) {
                        Text("Leon").tag("a")
                        Text("Partner").tag("b")
                    }
                    .pickerStyle(.segmented)
                }
                if let error = store.lastError {
                    Text(error).foregroundStyle(.red)
                }
                Button(busy ? "Kopple …" : "Koppeln") {
                    busy = true
                    Task {
                        await store.pair(serverURL: serverURL, pairingCode: code, person: person, deviceName: UIDevice.current.name)
                        busy = false
                    }
                }
                .disabled(busy || code.count < 12)
            }
            .navigationTitle("LDB koppeln")
        }
    }
}
