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
    private var exTimeType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .appleExerciseTime)! }
    private var restingHrType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .restingHeartRate)! }
    private var hrvType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)! }

    // HKWorkoutActivityType -> slug matching js/game.js WORKOUT_DISCIPLINE.
    private func workoutSlug(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .cycling: return "biking"
        case .running: return "running"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .swimming: return "swimming"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .highIntensityIntervalTraining: return "hiit"
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: return "strength"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        default: return "other"
        }
    }

    // Most recent sample value for a quantity type within the last `days` days.
    // Used for sparse metrics (resting HR, HRV) that aren't written every day.
    private func latestQuantity(_ type: HKQuantityType, unit: HKUnit, days: Int, _ done: @escaping (Double) -> Void) {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: end) ?? end
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: pred, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            let v = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit) ?? 0
            done(v)
        }
        store.execute(q)
    }

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
        // Full superset requested ONCE so future features never need a new prompt.
        // compactMap drops any identifier unavailable on the running iOS version.
        let qids: [HKQuantityTypeIdentifier] = [
            .stepCount, .activeEnergyBurned, .appleExerciseTime, .appleStandTime,
            .distanceWalkingRunning, .distanceCycling, .distanceSwimming, .flightsClimbed,
            .heartRate, .restingHeartRate, .heartRateVariabilitySDNN, .walkingHeartRateAverage, .vo2Max,
            .respiratoryRate, .oxygenSaturation,
            .bodyMass, .height, .bodyFatPercentage, .leanBodyMass,
        ]
        var read: Set<HKObjectType> = Set(qids.compactMap { HKObjectType.quantityType(forIdentifier: $0) })
        read.insert(HKObjectType.workoutType())
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { read.insert(sleep) }
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

        // Workouts today: count, distinct type slugs, and Apple exercise minutes.
        var workouts = 0
        var wtypes: [String] = []
        var exMin: Double = 0
        group.enter()
        store.execute(HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let ws = (samples as? [HKWorkout]) ?? []
            workouts = ws.count
            var seen = Set<String>()
            for w in ws { let s = self.workoutSlug(w.workoutActivityType); if seen.insert(s).inserted { wtypes.append(s) } }
            group.leave()
        })
        group.enter()
        store.execute(HKStatisticsQuery(quantityType: exTimeType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
            exMin = stats?.sumQuantity()?.doubleValue(for: .minute()) ?? 0
            group.leave()
        })

        // Heart & recovery: resting HR (bpm) + HRV (SDNN, ms). These are written
        // sparsely by the watch (resting HR ~once/day and often not until later;
        // HRV only during sleep/Breathe), so a "today only" query almost always
        // comes back empty. Take the most RECENT reading within the last 10 days.
        var restingHr: Double = 0
        var hrv: Double = 0
        let bpm = HKUnit.count().unitDivided(by: .minute())
        group.enter()
        latestQuantity(restingHrType, unit: bpm, days: 10) { v in restingHr = v; group.leave() }
        group.enter()
        latestQuantity(hrvType, unit: .secondUnit(with: .milli), days: 10) { v in hrv = v; group.leave() }

        group.notify(queue: .main) {
            let fmt = DateFormatter()
            fmt.dateFormat = "yyyy-MM-dd"
            fmt.timeZone = TimeZone.current
            var out: [String: Any] = [
                "date": fmt.string(from: Date()),
                "steps": Int(steps.rounded()),
                "activeKcal": Int(active.rounded()),
                "workouts": workouts,
                "exerciseMin": Int(exMin.rounded()),
                "wtypes": wtypes,
            ]
            if restingHr > 0 { out["restingHr"] = Int(restingHr.rounded()) }
            if hrv > 0 { out["hrv"] = Int(hrv.rounded()) }
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
