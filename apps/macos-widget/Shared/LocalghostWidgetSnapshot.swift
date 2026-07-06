import Foundation

let localghostWidgetAppGroupIdentifier = "group.app.localghost"
let localghostWidgetSnapshotFileName = "LocalghostWidgetSnapshot.json"

struct LocalghostWidgetSnapshot: Codable {
    var generatedAt: String
    var instances: [LocalghostWidgetInstance]
}

struct LocalghostWidgetInstance: Codable, Identifiable {
    var id: String
    var projectName: String
    var cwd: String
    var running: Bool
    var mode: String
    var routes: [LocalghostWidgetRoute]
}

struct LocalghostWidgetRoute: Codable, Identifiable {
    var id: String { "\(host):\(port)" }
    var host: String
    var port: Int
    var listening: Bool
}

enum LocalghostWidgetSharedStore {
    static func snapshotURL() -> URL {
        if let appGroupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: localghostWidgetAppGroupIdentifier) {
            return appGroupURL.appendingPathComponent(localghostWidgetSnapshotFileName)
        }

        let fallback = FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Localghost", isDirectory: true)
        return fallback.appendingPathComponent(localghostWidgetSnapshotFileName)
    }

    static func readSnapshot() throws -> LocalghostWidgetSnapshot {
        let data = try Data(contentsOf: snapshotURL())
        return try JSONDecoder().decode(LocalghostWidgetSnapshot.self, from: data)
    }

    static func writeSnapshot(_ snapshot: LocalghostWidgetSnapshot) throws {
        let url = snapshotURL()
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: url, options: [.atomic])
    }
}
