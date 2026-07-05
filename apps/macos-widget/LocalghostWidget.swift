import AppKit
import Foundation

struct LocalghostPsResponse: Decodable {
    let activityPath: String?
    let runs: [LocalghostRun]
}

struct LocalghostRun: Decodable {
    let mode: String
    let pid: Int
    let cwd: String
    let projectName: String
    let startedAt: String
    let childCommand: [String]?
    let routes: [LocalghostRoute]
}

struct LocalghostRoute: Decodable {
    let host: String
    let port: Int
    let target: String
    let listening: Bool
}

final class LocalghostWidgetApp: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var timer: Timer?
    private var latestRuns: [LocalghostRun] = []
    private var latestError: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem.button?.title = "LG ..."
        rebuildMenu()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    private func refresh() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let result = Self.loadRuns()
            DispatchQueue.main.async {
                switch result {
                case .success(let runs):
                    self?.latestRuns = runs
                    self?.latestError = nil
                case .failure(let error):
                    self?.latestRuns = []
                    self?.latestError = error.localizedDescription
                }

                self?.updateStatusTitle()
                self?.rebuildMenu()
            }
        }
    }

    private func updateStatusTitle() {
        if latestError != nil {
            statusItem.button?.title = "LG ?"
            return
        }

        statusItem.button?.title = "LG \(latestRuns.count)"
    }

    private func rebuildMenu() {
        let menu = NSMenu()

        if let latestError {
            let item = NSMenuItem(title: "Localghost unavailable", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)

            let detail = NSMenuItem(title: latestError, action: nil, keyEquivalent: "")
            detail.isEnabled = false
            menu.addItem(detail)
        } else if latestRuns.isEmpty {
            let item = NSMenuItem(title: "No Localghost apps running", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else {
            let title = latestRuns.count == 1 ? "1 Localghost app running" : "\(latestRuns.count) Localghost apps running"
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)

            menu.addItem(.separator())

            for run in latestRuns {
                addRun(run, to: menu)
                menu.addItem(.separator())
            }
        }

        let refreshItem = NSMenuItem(title: "Refresh", action: #selector(refreshFromMenu), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)

        let quitItem = NSMenuItem(title: "Quit Localghost Widget", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    private func addRun(_ run: LocalghostRun, to menu: NSMenu) {
        let command = run.childCommand?.joined(separator: " ")
        let mode = command.map { "\(run.mode): \($0)" } ?? run.mode
        let title = "\(run.projectName)  \(mode)"
        let projectItem = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        projectItem.isEnabled = false
        menu.addItem(projectItem)

        let cwdItem = NSMenuItem(title: "  \(run.cwd)", action: nil, keyEquivalent: "")
        cwdItem.isEnabled = false
        menu.addItem(cwdItem)

        let pidItem = NSMenuItem(title: "  pid \(run.pid)", action: nil, keyEquivalent: "")
        pidItem.isEnabled = false
        menu.addItem(pidItem)

        for route in run.routes {
            let state = route.listening ? "listening" : "not listening"
            let routeItem = NSMenuItem(title: "  \(route.host) -> \(route.target) (\(state))", action: nil, keyEquivalent: "")
            routeItem.isEnabled = false
            menu.addItem(routeItem)
        }
    }

    @objc private func refreshFromMenu() {
        refresh()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private static func loadRuns() -> Result<[LocalghostRun], Error> {
        do {
            let output = try runLocalghostPs()
            let response = try JSONDecoder().decode(LocalghostPsResponse.self, from: output)
            return .success(response.runs)
        } catch {
            return .failure(error)
        }
    }

    private static func runLocalghostPs() throws -> Data {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = localghostArguments()
        task.environment = [
            "PATH": pathValue()
        ]

        let stdout = Pipe()
        let stderr = Pipe()
        task.standardOutput = stdout
        task.standardError = stderr

        try task.run()
        task.waitUntilExit()

        let output = stdout.fileHandleForReading.readDataToEndOfFile()
        if task.terminationStatus == 0 {
            return output
        }

        let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
        let message = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        throw LocalghostWidgetError.commandFailed(message?.isEmpty == false ? message! : "localghost ps failed")
    }

    private static func localghostCommand() -> String {
        ProcessInfo.processInfo.environment["LOCALGHOST_CLI"] ?? "localghost"
    }

    private static func localghostArguments() -> [String] {
        let command = localghostCommand()
        if command.hasSuffix(".js") {
            return ["node", command, "--no-update-check", "ps", "--json"]
        }

        return [command, "--no-update-check", "ps", "--json"]
    }

    private static func pathValue() -> String {
        let existing = ProcessInfo.processInfo.environment["PATH"] ?? ""
        let defaults = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        return existing.isEmpty ? defaults : "\(existing):\(defaults)"
    }
}

enum LocalghostWidgetError: LocalizedError {
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .commandFailed(let message):
            return message
        }
    }
}

@main
struct LocalghostWidgetMain {
    private static let delegate = LocalghostWidgetApp()

    static func main() {
        let app = NSApplication.shared
        app.delegate = delegate
        app.run()
    }
}
