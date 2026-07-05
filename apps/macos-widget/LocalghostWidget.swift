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
    private var desktopPanel: NSPanel?
    private var desktopView: LocalghostDesktopWidgetView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NSApp.applicationIconImage = LocalghostAssets.whiteLogo
        if let button = statusItem.button {
            button.image = LocalghostAssets.templateLogo
            button.title = " LG ..."
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
            statusItem.button?.title = " LG ?"
            return
        }

        statusItem.button?.title = " LG \(latestRuns.count)"
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

        if let logo = LocalghostAssets.whiteLogo {
            logo.draw(in: NSRect(x: 238, y: 31, width: 78, height: 78), from: .zero, operation: .sourceOver, fraction: 0.94)
        }

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

        for offset in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
            let brightness = (Int(pixels[offset]) + Int(pixels[offset + 1]) + Int(pixels[offset + 2])) / 3
            if brightness < 70 {
                pixels[offset] = red
                pixels[offset + 1] = green
                pixels[offset + 2] = blue
                pixels[offset + 3] = 255
            } else {
                pixels[offset + 3] = 0
            }
        }

        guard let output = context.makeImage() else { return nil }
        return NSImage(cgImage: output, size: NSSize(width: width, height: height))
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
