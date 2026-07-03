import Foundation
import Capacitor
import HealthKit

/// Boneheadz Gym native HealthKit bridge.
/// Three-tap connect (native permission sheet) + silent daily reads.
/// Methods:
///   requestAuth()  -> { granted: Bool }        shows the iOS Health permission sheet
///   queryToday()   -> { date, steps, activeKcal, weightKg? }
///   isAvailable()  -> { available: Bool, native: true }
///   debugWrite(steps, activeKcal)               DEBUG builds only, for simulator tests
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugWrite", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    private var stepsType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .stepCount)! }
    private var energyType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)! }
    private var massType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .bodyMass)! }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": HKHealthStore.isHealthDataAvailable(),
            "native": true,
        ])
    }

    @objc func requestAuth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "reason": "unavailable"])
            return
        }
        let read: Set<HKObjectType> = [stepsType, energyType, massType]
        #if DEBUG
        let write: Set<HKSampleType> = [stepsType, energyType]
        #else
        let write: Set<HKSampleType> = []
        #endif
        store.requestAuthorization(toShare: write, read: read) { granted, error in
            if let error = error {
                call.resolve(["granted": false, "reason": error.localizedDescription])
            } else {
                // note: for read-only types iOS does not reveal denial; granted here
                // means the sheet completed. Actual reads may return empty if denied.
                call.resolve(["granted": granted])
            }
        }
    }

    @objc func queryToday(_ call: CAPPluginCall) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)

        let group = DispatchGroup()
        var steps: Double = 0
        var active: Double = 0
        var weightKg: Double? = nil

        group.enter()
        store.execute(HKStatisticsQuery(quantityType: stepsType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
            steps = stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            group.leave()
        })

        group.enter()
        store.execute(HKStatisticsQuery(quantityType: energyType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
            active = stats?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            group.leave()
        })

        group.enter()
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: massType, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            if let q = (samples?.first as? HKQuantitySample)?.quantity {
                weightKg = q.doubleValue(for: .gramUnit(with: .kilo))
            }
            group.leave()
        })

        group.notify(queue: .main) {
            let fmt = DateFormatter()
            fmt.dateFormat = "yyyy-MM-dd"
            fmt.timeZone = TimeZone.current
            var out: [String: Any] = [
                "date": fmt.string(from: Date()),
                "steps": Int(steps.rounded()),
                "activeKcal": Int(active.rounded()),
            ]
            if let w = weightKg { out["weightKg"] = w }
            call.resolve(out)
        }
    }

    @objc func debugWrite(_ call: CAPPluginCall) {
        #if DEBUG
        let steps = call.getDouble("steps") ?? 0
        let active = call.getDouble("activeKcal") ?? 0
        let now = Date()
        let start = now.addingTimeInterval(-3600)
        var samples: [HKQuantitySample] = []
        if steps > 0 {
            samples.append(HKQuantitySample(type: stepsType, quantity: HKQuantity(unit: .count(), doubleValue: steps), start: start, end: now))
        }
        if active > 0 {
            samples.append(HKQuantitySample(type: energyType, quantity: HKQuantity(unit: .kilocalorie(), doubleValue: active), start: start, end: now))
        }
        guard !samples.isEmpty else { call.resolve(["written": false]); return }
        store.save(samples) { ok, _ in
            call.resolve(["written": ok])
        }
        #else
        call.reject("debugWrite is DEBUG-only")
        #endif
    }
}
