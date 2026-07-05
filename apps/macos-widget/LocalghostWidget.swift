import AppKit
import Darwin
import Foundation

struct LocalghostActivityFile: Decodable {
    let runs: [LocalghostActivityRun]?
    let setups: [LocalghostActivitySetup]?
}

struct LocalghostRun: Decodable {
    let mode: String
    let pid: Int?
    let cwd: String
    let projectName: String
    let running: Bool?
    let startedAt: String?
    let updatedAt: String?
    let childCommand: [String]?
    let routes: [LocalghostRoute]
}

struct LocalghostActivityRun: Decodable {
    let id: String
    let mode: String
    let pid: Int
    let cwd: String
    let projectName: String
    let startedAt: String
    let updatedAt: String
    let configPath: String?
    let caddyfilePath: String?
    let childCommand: [String]?
    let https: Bool?
    let entries: [LocalghostEntry]
}

struct LocalghostActivitySetup: Decodable {
    let id: String
    let cwd: String
    let projectName: String
    let updatedAt: String
    let configPath: String?
    let caddyfilePath: String?
    let https: Bool?
    let entries: [LocalghostEntry]
}

struct LocalghostEntry: Decodable {
    let host: String
    let port: Int
    let target: String?
}

struct LocalghostRoute: Decodable {
    let host: String
    let port: Int
    let target: String
    let listening: Bool
}

extension LocalghostRun {
    var isRunning: Bool {
        running ?? (pid != nil)
    }
}

final class LocalghostWidgetApp: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private var timer: Timer?
    private var latestRuns: [LocalghostRun] = []
    private var latestError: String?
    private var desktopPanel: NSPanel?
    private var desktopView: LocalghostDesktopWidgetView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NSApp.applicationIconImage = LocalghostAssets.whiteLogo
        if let button = statusItem.button {
            button.image = LocalghostAssets.templateLogo
            button.imagePosition = .imageOnly
            button.imageScaling = .scaleProportionallyUpOrDown
            button.title = ""
            button.toolTip = "Localghost"
        }
        showDesktopWidget()
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
                self?.desktopView?.update(runs: self?.latestRuns ?? [], errorMessage: self?.latestError)
                self?.rebuildMenu()
            }
        }
    }

    private func updateStatusTitle() {
        if latestError != nil {
            statusItem.button?.toolTip = "Localghost status unavailable"
            return
        }

        let runningCount = latestRuns.filter { $0.isRunning }.count
        statusItem.button?.toolTip = "Localghost: \(runningCount) running, \(latestRuns.count) setup"
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
            let item = NSMenuItem(title: "No Localghost setups found", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else {
            let runningCount = latestRuns.filter { $0.isRunning }.count
            let title = "\(runningCount) running, \(latestRuns.count) setup"
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)

            menu.addItem(.separator())

            for run in latestRuns {
                addRun(run, to: menu)
                menu.addItem(.separator())
            }
        }

        let desktopTitle = desktopPanel?.isVisible == true ? "Hide Desktop Widget" : "Show Desktop Widget"
        let desktopItem = NSMenuItem(title: desktopTitle, action: #selector(toggleDesktopWidget), keyEquivalent: "w")
        desktopItem.target = self
        menu.addItem(desktopItem)

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
        let mode = command.map { "\(run.mode): \($0)" } ?? (run.mode == "setup" ? "" : run.mode)
        let state = run.isRunning ? "running" : "setup"
        let title = mode.isEmpty ? "\(run.projectName)  \(state)" : "\(run.projectName)  \(state)  \(mode)"
        let projectItem = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        projectItem.isEnabled = false
        menu.addItem(projectItem)

        let cwdItem = NSMenuItem(title: "  \(run.cwd)", action: nil, keyEquivalent: "")
        cwdItem.isEnabled = false
        menu.addItem(cwdItem)

        if let pid = run.pid {
            let pidItem = NSMenuItem(title: "  pid \(pid)", action: nil, keyEquivalent: "")
            pidItem.isEnabled = false
            menu.addItem(pidItem)
        }

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

    @objc private func toggleDesktopWidget() {
        if desktopPanel?.isVisible == true {
            desktopPanel?.orderOut(nil)
        } else {
            showDesktopWidget()
        }

        rebuildMenu()
    }

    private func showDesktopWidget() {
        if desktopPanel == nil {
            let view = LocalghostDesktopWidgetView(frame: NSRect(x: 0, y: 0, width: 360, height: 330))
            view.update(runs: latestRuns, errorMessage: latestError)
            view.openFirstRoute = { [weak self] in
                self?.openFirstRoute()
            }

            let panel = NSPanel(
                contentRect: view.bounds,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            panel.contentView = view
            panel.backgroundColor = .clear
            panel.isOpaque = false
            panel.hasShadow = true
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
            panel.isMovableByWindowBackground = true
            panel.hidesOnDeactivate = false

            desktopView = view
            desktopPanel = panel
            panel.center()
        }

        desktopPanel?.orderFrontRegardless()
    }

    private func openFirstRoute() {
        guard let route = latestRuns.flatMap(\.routes).first else { return }
        NSWorkspace.shared.open(URL(string: "http://\(route.host)")!)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private static func loadRuns() -> Result<[LocalghostRun], Error> {
        do {
            return .success(try loadActivityInstances())
        } catch {
            return .failure(error)
        }
    }

    private static func loadActivityInstances() throws -> [LocalghostRun] {
        let path = activityPath()
        if !FileManager.default.fileExists(atPath: path) {
            return []
        }

        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let activity = try JSONDecoder().decode(LocalghostActivityFile.self, from: data)
        let activeRuns = (activity.runs ?? []).filter { isProcessRunning($0.pid) }
        let runBySetup = Dictionary(uniqueKeysWithValues: activeRuns.map { (activityKey(projectName: $0.projectName, cwd: $0.cwd, configPath: $0.configPath), $0) })
        var instances: [LocalghostRun] = []
        var consumedRunKeys = Set<String>()

        for setup in activity.setups ?? [] {
            let key = activityKey(projectName: setup.projectName, cwd: setup.cwd, configPath: setup.configPath)
            if let run = runBySetup[key] {
                consumedRunKeys.insert(key)
                instances.append(instance(from: run, setup: setup))
            } else {
                instances.append(instance(from: setup))
            }
        }

        for run in activeRuns {
            let key = activityKey(projectName: run.projectName, cwd: run.cwd, configPath: run.configPath)
            if !consumedRunKeys.contains(key) {
                instances.append(instance(from: run, setup: nil))
            }
        }

        return instances.sorted {
            if $0.isRunning != $1.isRunning { return $0.isRunning && !$1.isRunning }
            return $0.projectName.localizedCaseInsensitiveCompare($1.projectName) == .orderedAscending
        }
    }

    private static func instance(from setup: LocalghostActivitySetup) -> LocalghostRun {
        LocalghostRun(
            mode: "setup",
            pid: nil,
            cwd: setup.cwd,
            projectName: setup.projectName,
            running: false,
            startedAt: nil,
            updatedAt: setup.updatedAt,
            childCommand: nil,
            routes: setup.entries.map { route(from: $0, forceListening: false) }
        )
    }

    private static func instance(from run: LocalghostActivityRun, setup: LocalghostActivitySetup?) -> LocalghostRun {
        LocalghostRun(
            mode: run.mode,
            pid: run.pid,
            cwd: run.cwd,
            projectName: run.projectName,
            running: true,
            startedAt: run.startedAt,
            updatedAt: setup?.updatedAt ?? run.updatedAt,
            childCommand: run.childCommand,
            routes: run.entries.map { route(from: $0, forceListening: true) }
        )
    }

    private static func route(from entry: LocalghostEntry, forceListening: Bool) -> LocalghostRoute {
        LocalghostRoute(
            host: entry.host,
            port: entry.port,
            target: entry.target ?? "127.0.0.1:\(entry.port)",
            listening: forceListening || isPortListening(entry.port)
        )
    }

    private static func activityKey(projectName: String, cwd: String, configPath: String?) -> String {
        "\(projectName):\(cwd):\(configPath ?? "")"
    }

    private static func activityPath() -> String {
        let environment = ProcessInfo.processInfo.environment
        if let path = environment["LOCALGHOST_ACTIVITY_PATH"], !path.isEmpty {
            return path
        }

        let stateRoot = environment["XDG_STATE_HOME"] ?? "\(NSHomeDirectory())/.local/state"
        return "\(stateRoot)/localghost/activity.json"
    }

    private static func isProcessRunning(_ pid: Int) -> Bool {
        if pid < 1 { return false }
        let result = Darwin.kill(pid_t(pid), 0)
        return result == 0 || errno == EPERM
    }

    private static func isPortListening(_ port: Int) -> Bool {
        if port < 1 || port > 65535 { return false }

        let descriptor = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        if descriptor < 0 { return false }
        defer { Darwin.close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = UInt16(port).bigEndian
        inet_pton(AF_INET, "127.0.0.1", &address.sin_addr)

        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                Darwin.connect(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        return result == 0
    }
}

final class LocalghostDesktopWidgetView: NSView {
    var openFirstRoute: (() -> Void)?
    private var runs: [LocalghostRun] = []
    private var errorMessage: String?

    override var isFlipped: Bool { true }

    func update(runs: [LocalghostRun], errorMessage: String?) {
        self.runs = runs
        self.errorMessage = errorMessage
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        drawBackground()
        drawHeader()
        drawRoutes()
        drawFooter()
    }

    override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if footerRect.contains(point) {
            openFirstRoute?()
        }
    }

    private var allRoutes: [LocalghostRoute] {
        runs.flatMap(\.routes)
    }

    private var onlineRoutes: [LocalghostRoute] {
        allRoutes.filter(\.listening)
    }

    private var firstHost: String? {
        allRoutes.first?.host
    }

    private var footerRect: NSRect {
        NSRect(x: 34, y: bounds.height - 58, width: bounds.width - 68, height: 32)
    }

    private func drawBackground() {
        let rect = bounds.insetBy(dx: 4, dy: 4)
        let path = NSBezierPath(roundedRect: rect, xRadius: 34, yRadius: 34)
        let gradient = NSGradient(colors: [
            NSColor(calibratedRed: 0.04, green: 0.05, blue: 0.18, alpha: 0.98),
            NSColor(calibratedRed: 0.07, green: 0.08, blue: 0.30, alpha: 0.97)
        ])
        gradient?.draw(in: path, angle: -35)

        NSColor(calibratedWhite: 1.0, alpha: 0.08).setStroke()
        path.lineWidth = 1
        path.stroke()
    }

    private func drawHeader() {
        drawText(">_", at: NSPoint(x: 34, y: 54), font: .monospacedSystemFont(ofSize: 28, weight: .bold), color: accent)
        drawText("Localghost", at: NSPoint(x: 90, y: 58), font: .systemFont(ofSize: 26, weight: .bold), color: .white)

        let status = statusText()
        drawDot(at: NSPoint(x: 42, y: 113), radius: 5, color: statusColor)
        drawText(status, at: NSPoint(x: 58, y: 104), font: .systemFont(ofSize: 15, weight: .medium), color: muted)

        drawDivider(y: 134)
    }

    private func drawRoutes() {
        if let errorMessage {
            drawText("Localghost unavailable", at: NSPoint(x: 38, y: 162), font: .systemFont(ofSize: 17, weight: .semibold), color: .white)
            drawText(errorMessage, in: NSRect(x: 38, y: 192, width: bounds.width - 76, height: 54), font: .systemFont(ofSize: 13, weight: .regular), color: muted)
            return
        }

        let routes = Array(allRoutes.prefix(4))
        if routes.isEmpty {
            drawText("No hosts online", at: NSPoint(x: 38, y: 168), font: .systemFont(ofSize: 18, weight: .semibold), color: .white)
            drawText("Start an app with localghost run.", at: NSPoint(x: 38, y: 198), font: .systemFont(ofSize: 14, weight: .regular), color: muted)
            return
        }

        for (index, route) in routes.enumerated() {
            let y = CGFloat(164 + index * 48)
            drawDot(at: NSPoint(x: 45, y: y + 10), radius: 7, color: route.listening ? online : offline)
            drawText(route.host, at: NSPoint(x: 68, y: y), font: .systemFont(ofSize: 17, weight: .bold), color: .white)
            drawText(String(route.port), at: NSPoint(x: bounds.width - 82, y: y), font: .monospacedDigitSystemFont(ofSize: 17, weight: .semibold), color: muted)
            if index < routes.count - 1 {
                drawDivider(y: y + 33)
            }
        }
    }

    private func drawFooter() {
        guard errorMessage == nil, let host = firstHost else { return }
        drawDivider(y: bounds.height - 72)
        drawText("↗", at: NSPoint(x: 38, y: bounds.height - 46), font: .systemFont(ofSize: 18, weight: .bold), color: accent)
        drawText("Open \(host)", at: NSPoint(x: 66, y: bounds.height - 44), font: .systemFont(ofSize: 15, weight: .semibold), color: accent)
    }

    private func statusText() -> String {
        if errorMessage != nil { return "status unavailable" }
        let count = onlineRoutes.count
        return count == 1 ? "1 host online" : "\(count) hosts online"
    }

    private var statusColor: NSColor {
        errorMessage == nil ? online : offline
    }

    private var accent: NSColor {
        NSColor(calibratedRed: 0.61, green: 0.43, blue: 1.0, alpha: 1)
    }

    private var online: NSColor {
        NSColor(calibratedRed: 0.34, green: 0.91, blue: 0.52, alpha: 1)
    }

    private var offline: NSColor {
        NSColor(calibratedRed: 1.0, green: 0.42, blue: 0.50, alpha: 1)
    }

    private var muted: NSColor {
        NSColor(calibratedRed: 0.64, green: 0.63, blue: 0.79, alpha: 1)
    }

    private func drawDivider(y: CGFloat) {
        NSColor(calibratedWhite: 1.0, alpha: 0.10).setStroke()
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 34, y: y))
        path.line(to: NSPoint(x: bounds.width - 34, y: y))
        path.lineWidth = 1
        path.stroke()
    }

    private func drawDot(at point: NSPoint, radius: CGFloat, color: NSColor) {
        color.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)).fill()
    }

    private func drawText(_ text: String, at point: NSPoint, font: NSFont, color: NSColor) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color
        ]
        text.draw(at: point, withAttributes: attributes)
    }

    private func drawText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph
        ]
        text.draw(in: rect, withAttributes: attributes)
    }
}

enum LocalghostAssets {
    static var templateLogo: NSImage? {
        let image = processedLogo(color: .black)
        image?.isTemplate = true
        image?.size = NSSize(width: 18, height: 18)
        return image
    }

    static var whiteLogo: NSImage? {
        processedLogo(color: .white)
    }

    private static func processedLogo(color: NSColor) -> NSImage? {
        guard
            let url = Bundle.main.url(forResource: "localghost-logo-source", withExtension: "png"),
            let source = NSImage(contentsOf: url),
            let cgImage = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return nil
        }

        let width = cgImage.width
        let height = cgImage.height
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)

        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return nil
        }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        let rgb = color.usingColorSpace(.deviceRGB) ?? color
        let red = UInt8(max(0, min(255, rgb.redComponent * 255)))
        let green = UInt8(max(0, min(255, rgb.greenComponent * 255)))
        let blue = UInt8(max(0, min(255, rgb.blueComponent * 255)))
        var minX = width
        var minY = height
        var maxX = 0
        var maxY = 0

        for offset in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
            let brightness = (Int(pixels[offset]) + Int(pixels[offset + 1]) + Int(pixels[offset + 2])) / 3
            if brightness < 70 {
                pixels[offset] = red
                pixels[offset + 1] = green
                pixels[offset + 2] = blue
                pixels[offset + 3] = 255
                let pixelIndex = offset / bytesPerPixel
                let x = pixelIndex % width
                let y = pixelIndex / width
                minX = min(minX, x)
                minY = min(minY, y)
                maxX = max(maxX, x)
                maxY = max(maxY, y)
            } else {
                pixels[offset + 3] = 0
            }
        }

        guard let output = context.makeImage() else { return nil }
        if minX > maxX || minY > maxY {
            return NSImage(cgImage: output, size: NSSize(width: width, height: height))
        }

        let padding = max(8, Int(Double(max(maxX - minX, maxY - minY)) * 0.08))
        let cropX = max(0, minX - padding)
        let cropY = max(0, minY - padding)
        let cropMaxX = min(width - 1, maxX + padding)
        let cropMaxY = min(height - 1, maxY + padding)
        let cropRect = CGRect(x: cropX, y: cropY, width: cropMaxX - cropX + 1, height: cropMaxY - cropY + 1)

        guard let cropped = output.cropping(to: cropRect) else {
            return NSImage(cgImage: output, size: NSSize(width: width, height: height))
        }

        return NSImage(cgImage: cropped, size: NSSize(width: cropRect.width, height: cropRect.height))
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
