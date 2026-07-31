// Boneheadz Gym home screen widget.
//
// PHASE 0 STUB. This deliberately renders hardcoded content. Its only job is to
// prove the parts of this feature that can fail silently and expensively:
//   1. an app extension target archives and signs under automatic signing,
//   2. the App Group entitlement is created and accepted by App Store Connect,
//   3. the widget shows up in the gallery and can be PLACED on a home screen.
// Real data lands in phase 1, art in phase 2. Nothing else should be built on
// top of this file until a stub widget is sitting on Tom's actual phone.
//
// Why a stub first: every other feature here ships as a web change and reaches
// the phone in minutes. A widget cannot. If the signing story is broken we want
// to find out against 40 lines of Swift, not against a finished design.

import SwiftUI
import WidgetKit

struct BhEntry: TimelineEntry {
    let date: Date
    let level: Int
    let title: String
}

struct BhProvider: TimelineProvider {
    // The gallery preview. Never left blank: a widget that renders nothing in the
    // picker reads as broken before anyone has placed it.
    func placeholder(in context: Context) -> BhEntry {
        BhEntry(date: Date(), level: 28, title: "BONE GRANDMASTER")
    }

    func getSnapshot(in context: Context, completion: @escaping (BhEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BhEntry>) -> Void) {
        // Phase 0 has no data source, so one entry and no refresh policy work.
        // Phase 1 replaces this with a read from the App Group container plus an
        // entry at the next local midnight so the day rolls over on its own.
        completion(Timeline(entries: [placeholder(in: context)], policy: .never))
    }
}

struct BhWidgetView: View {
    var entry: BhEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer()
            Text("LV \(entry.level)")
                .font(.system(size: 46, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(red: 0.72, green: 0.93, blue: 0.30))
            Text(entry.title)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.85))
            Text("phase 0 stub")
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(.white.opacity(0.35))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        // A home screen widget cannot be transparent: iOS supplies a material
        // unless the widget provides its own ground. This is the pit backdrop
        // from the app, so the widget reads as part of the game rather than as a
        // system card.
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.05, blue: 0.07),
                         Color(red: 0.07, green: 0.11, blue: 0.08)],
                startPoint: .top, endPoint: .bottom)
        }
    }
}

struct BoneheadzWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BoneheadzWidget", provider: BhProvider()) { entry in
            BhWidgetView(entry: entry)
        }
        .configurationDisplayName("Your Bonehead")
        .description("Your fighter, your level, and what you have left to eat today.")
        .supportedFamilies([.systemLarge])
    }
}

@main
struct BoneheadzWidgetBundle: WidgetBundle {
    var body: some Widget {
        BoneheadzWidget()
    }
}
