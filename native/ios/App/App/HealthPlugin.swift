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

    private var sleepType: HKCategoryType { HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)! }

    // Merge overlapping/touching [start,end] intervals and return total seconds.
    // Sleep can be written by several sources (watch + phone + third-party), so
    // raw duration-summing double-counts; a union of the intervals is the true time.
    private func unionSeconds(_ intervals: [(Date, Date)]) -> Double {
        guard !intervals.isEmpty else { return 0 }
        let sorted = intervals.sorted { $0.0 < $1.0 }
        var total: Double = 0
        var curS = sorted[0].0, curE = sorted[0].1
        for (s, e) in sorted.dropFirst() {
            if s > curE { total += curE.timeIntervalSince(curS); curS = s; curE = e }
            else if e > curE { curE = e }
        }
        total += curE.timeIntervalSince(curS)
        return total
    }

    // Last night's sleep, as stage minutes. Returns nil if nothing was recorded.
    // We look back 18h (covers a morning/afternoon check-in) and union the
    // "asleep" samples per stage. Stage identifiers (asleepCore/Deep/REM) are
    // iOS 16+, so we branch on rawValue to stay correct on older systems where
    // only inBed(0)/asleep(1)/awake(2) exist.
    private func latestSleep(_ done: @escaping ([String: Int]?) -> Void) {
        let end = Date()
        let start = end.addingTimeInterval(-18 * 3600)
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let cats = (samples as? [HKCategorySample]) ?? []
            guard !cats.isEmpty else { done(nil); return }
            var core: [(Date, Date)] = [], deep: [(Date, Date)] = [], rem: [(Date, Date)] = []
            var unspecified: [(Date, Date)] = [], awake: [(Date, Date)] = []
            for c in cats {
                let iv = (c.startDate, c.endDate)
                switch c.value {
                case 3: core.append(iv)       // asleepCore
                case 4: deep.append(iv)       // asleepDeep
                case 5: rem.append(iv)        // asleepREM
                case 1: unspecified.append(iv) // asleep / asleepUnspecified
                case 2: awake.append(iv)      // awake
                default: break                // 0 = inBed (ignored; not "asleep")
                }
            }
            let coreS = self.unionSeconds(core), deepS = self.unionSeconds(deep), remS = self.unionSeconds(rem)
            let staged = coreS + deepS + remS
            // Prefer staged data; fall back to unspecified "asleep" when the source
            // didn't record stages (older watches / third-party trackers).
            let asleep = staged > 0 ? staged : self.unionSeconds(unspecified)
            guard asleep >= 30 * 60 else { done(nil); return } // ignore stray < 30 min blips
            let m = { (s: Double) in Int((s / 60).rounded()) }
            done([
                "sleepMin": m(asleep),
                "sleepDeepMin": m(deepS),
                "sleepRemMin": m(remS),
                "sleepCoreMin": m(coreS),
                "sleepAwakeMin": m(self.unionSeconds(awake)),
                "sleepStaged": staged > 0 ? 1 : 0,
            ])
        }
        store.execute(q)
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

        // Last night's sleep, auto-read from the watch (stages when available).
        var sleep: [String: Int]? = nil
        group.enter()
        latestSleep { s in sleep = s; group.leave() }

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
            if let s = sleep { for (k, v) in s { out[k] = v } }
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
