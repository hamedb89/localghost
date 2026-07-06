import SwiftUI
import WidgetKit

struct LocalghostWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: LocalghostWidgetSnapshot
}

struct LocalghostWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> LocalghostWidgetEntry {
        LocalghostWidgetEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (LocalghostWidgetEntry) -> Void) {
        completion(LocalghostWidgetEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LocalghostWidgetEntry>) -> Void) {
        let entry = LocalghostWidgetEntry(date: Date(), snapshot: loadSnapshot())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date().addingTimeInterval(300)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func loadSnapshot() -> LocalghostWidgetSnapshot {
        (try? LocalghostWidgetSharedStore.readSnapshot()) ?? .placeholder
    }
}

struct LocalghostDesktopWidgetView: View {
    let entry: LocalghostWidgetEntry

    private var instances: [LocalghostWidgetInstance] {
        entry.snapshot.instances
    }

    private var routes: [LocalghostWidgetRoute] {
        instances.flatMap(\.routes)
    }

    private var onlineCount: Int {
        routes.filter(\.listening).count
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    LinearGradient(
                        colors: [
                            Color(red: 0.68, green: 0.56, blue: 1.0).opacity(0.18),
                            Color(red: 0.03, green: 0.04, blue: 0.16).opacity(0.48)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Text(">_")
                        .font(.system(size: 24, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color(red: 0.68, green: 0.48, blue: 1.0))

                    Text("Localghost")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                }

                HStack(spacing: 8) {
                    Circle()
                        .fill(Color(red: 0.36, green: 0.95, blue: 0.58))
                        .frame(width: 8, height: 8)

                    Text("\(onlineCount) \(onlineCount == 1 ? "host" : "hosts") online")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.72))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(.white.opacity(0.08), in: Capsule())

                Divider().overlay(.white.opacity(0.12))

                if routes.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 8) {
                        ForEach(routes.prefix(4)) { route in
                            routeRow(route)
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(22)
        }
        .containerBackground(.clear, for: .widget)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No hosts online")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)

            Text("Configured setups will stay here when idle.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.64))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
    }

    private func routeRow(_ route: LocalghostWidgetRoute) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(route.listening ? Color(red: 0.36, green: 0.95, blue: 0.58) : Color(red: 1.0, green: 0.42, blue: 0.50))
                .frame(width: 8, height: 8)

            Text(route.host)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)

            Spacer()

            Text(String(route.port))
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
    }
}

@main
struct LocalghostDesktopWidgetBundle: WidgetBundle {
    var body: some Widget {
        LocalghostDesktopWidget()
    }
}

struct LocalghostDesktopWidget: Widget {
    let kind = "LocalghostDesktopWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LocalghostWidgetProvider()) { entry in
            LocalghostDesktopWidgetView(entry: entry)
        }
        .configurationDisplayName("Localghost")
        .description("Shows Localghost setup and running local hosts.")
        .supportedFamilies([.systemMedium])
    }
}

extension LocalghostWidgetSnapshot {
    static var placeholder: LocalghostWidgetSnapshot {
        LocalghostWidgetSnapshot(generatedAt: ISO8601DateFormatter().string(from: Date()), instances: [])
    }
}
