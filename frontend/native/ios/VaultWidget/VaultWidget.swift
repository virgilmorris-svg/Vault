// VaultWidget — iOS Home-screen widget for VauLt
// Reads a redacted list of logins from the App Group shared UserDefaults
// (populated by the main app) and shows the top 3. Tapping a row opens the
// main app via `vault://quick-copy?entry_id=<id>` where the actual copy
// happens (after biometric).
//
// The widget itself never sees plaintext passwords — zero-knowledge preserved.

import WidgetKit
import SwiftUI

struct VaultEntryStub: Identifiable, Codable {
    let id: String
    let title: String
    let username: String?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), entries: sampleEntries)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        completion(SimpleEntry(date: Date(), entries: readShared() ?? sampleEntries))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = SimpleEntry(date: Date(), entries: readShared() ?? sampleEntries)
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 15))))
    }

    private func readShared() -> [VaultEntryStub]? {
        let defaults = UserDefaults(suiteName: "group.com.emergent.vault")
        guard let data = defaults?.data(forKey: "com.vault.quickcopy.entries") else { return nil }
        return try? JSONDecoder().decode([VaultEntryStub].self, from: data)
    }

    private var sampleEntries: [VaultEntryStub] {
        [VaultEntryStub(id: "1", title: "Unlock VauLt", username: "Tap to open Quick Copy")]
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let entries: [VaultEntryStub]
}

struct VaultWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "lock.shield.fill").foregroundColor(Color(red: 0.22, green: 0.74, blue: 0.97))
                Text("VauLt").font(.system(size: 12, weight: .bold)).foregroundColor(.white)
                Spacer()
                Text("Quick Copy").font(.system(size: 10)).foregroundColor(.gray)
            }
            ForEach(entry.entries.prefix(3)) { e in
                Link(destination: URL(string: "vault://quick-copy?entry_id=\(e.id)")!) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.title).font(.system(size: 13, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                        if let u = e.username { Text(u).font(.system(size: 10)).foregroundColor(.gray).lineLimit(1) }
                    }
                    .padding(.vertical, 4).padding(.horizontal, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(red: 0.09, green: 0.09, blue: 0.09))
                    .cornerRadius(6)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color.black)
    }
}

@main
struct VaultWidget: Widget {
    let kind: String = "VaultWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            VaultWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("VauLt Quick Copy")
        .description("Tap a login to open VauLt and copy its password after biometric verification.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
