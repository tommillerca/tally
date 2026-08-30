package com.boneheadz.gym

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.SleepSessionRecord
import com.getcapacitor.JSArray
import java.time.Duration
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Boneheadz Gym native Health Connect bridge (Android side of the iOS HealthKit
 * plugin). Same JS interface so js/native.js is unchanged:
 *   isAvailable() -> { available: Boolean, native: true }
 *   requestAuth() -> { granted: Boolean, reason? }   shows the Health Connect grant sheet
 *   queryToday()  -> { date, steps, activeKcal, weightKg? }
 */
@CapacitorPlugin(name = "Health")
class HealthPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val permContract = PermissionController.createRequestPermissionResultContract()

    // Full superset requested ONCE so future features never need a new grant sheet.
    private val readPerms = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(FloorsClimbedRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(Vo2MaxRecord::class),
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(HeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class)
    )

    // Health Connect exerciseType Int -> a slug matching js/game.js WORKOUT_DISCIPLINE.
    private fun exerciseSlug(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
        else -> "other"
    }

    // Merge overlapping/touching intervals, return total seconds. Sleep stages
    // from multiple sources can overlap, so union (not sum) is the true time.
    private fun unionSeconds(intervals: List<Pair<Instant, Instant>>): Long {
        if (intervals.isEmpty()) return 0
        val sorted = intervals.sortedBy { it.first }
        var total = 0L
        var curS = sorted[0].first
        var curE = sorted[0].second
        for (i in 1 until sorted.size) {
            val (s, e) = sorted[i]
            if (s > curE) { total += Duration.between(curS, curE).seconds; curS = s; curE = e }
            else if (e > curE) { curE = e }
        }
        total += Duration.between(curS, curE).seconds
        return total
    }

    private fun sdkAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val res = JSObject()
        res.put("available", sdkAvailable())
        res.put("native", true)
        call.resolve(res)
    }

    @PluginMethod
    fun requestAuth(call: PluginCall) {
        if (!sdkAvailable()) {
            val res = JSObject(); res.put("granted", false); res.put("reason", "unavailable")
            call.resolve(res); return
        }
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                if (granted.containsAll(readPerms)) {
                    val res = JSObject(); res.put("granted", true); call.resolve(res); return@launch
                }
                // Launch the Health Connect permission sheet via Capacitor's
                // activity-result plumbing, then parse it in authResult().
                val intent = permContract.createIntent(context, readPerms)
                startActivityForResult(call, intent, "authResult")
            } catch (e: Exception) {
                val res = JSObject(); res.put("granted", false); res.put("reason", e.message ?: "error")
                call.resolve(res)
            }
        }
    }

    @ActivityCallback
    fun authResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = try { permContract.parseResult(result.resultCode, result.data) } catch (e: Exception) { emptySet<String>() }
        val res = JSObject(); res.put("granted", granted.containsAll(readPerms)); call.resolve(res)
    }

    @PluginMethod
    fun queryToday(call: PluginCall) {
        if (!sdkAvailable()) {
            val res = JSObject(); res.put("date", today()); res.put("steps", 0); res.put("activeKcal", 0)
            call.resolve(res); return
        }
        scope.launch {
            val res = JSObject()
            res.put("date", today())
            try {
                val zone = ZoneId.systemDefault()
                val start = LocalDate.now().atStartOfDay(zone).toInstant()
                val now = Instant.now()
                val range = TimeRangeFilter.between(start, now)
                val hc = client()

                val agg = hc.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                        timeRangeFilter = range
                    )
                )
                res.put("steps", (agg[StepsRecord.COUNT_TOTAL] ?: 0L).toInt())
                val kcal = agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0
                res.put("activeKcal", Math.round(kcal).toInt())

                val weights = hc.readRecords(
                    ReadRecordsRequest(
                        recordType = WeightRecord::class,
                        timeRangeFilter = TimeRangeFilter.before(now),
                        ascendingOrder = false,
                        pageSize = 1
                    )
                ).records
                if (weights.isNotEmpty()) res.put("weightKg", weights[0].weight.inKilograms)

                // Workouts today: count, distinct type slugs, total minutes.
                val sessions = hc.readRecords(
                    ReadRecordsRequest(recordType = ExerciseSessionRecord::class, timeRangeFilter = range)
                ).records
                res.put("workouts", sessions.size)
                var exMin = 0L
                val types = LinkedHashSet<String>()
                for (s in sessions) {
                    exMin += Duration.between(s.startTime, s.endTime).toMinutes()
                    types.add(exerciseSlug(s.exerciseType))
                }
                res.put("exerciseMin", exMin.toInt())
                val arr = JSArray()
                for (t in types) arr.put(t)
                res.put("wtypes", arr)

                // Heart & recovery: resting HR (bpm) + HRV (RMSSD, ms). These are
                // written sparsely (not every day), so a "today only" range usually
                // finds nothing. Look back 10 days and take the most recent reading.
                val recent = TimeRangeFilter.between(now.minus(Duration.ofDays(10)), now)
                val rhr = hc.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, recent)).records
                if (rhr.isNotEmpty()) res.put("restingHr", rhr.maxByOrNull { it.time }!!.beatsPerMinute.toInt())
                val hrvRecs = hc.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, recent)).records
                if (hrvRecs.isNotEmpty()) res.put("hrv", Math.round(hrvRecs.maxByOrNull { it.time }!!.heartRateVariabilityMillis).toInt())

                // Last night's sleep (auto, with stages), anchored to THE NIGHT rather
                // than rolled back from "now". A rolling 18h window broke evening
                // check-ins: sleep is stored as many short stage records, so opening
                // the app at 9pm put the window start at 3am and every stage that
                // ended earlier was never returned, under-counting the night (and
                // returning nothing at all once the remainder fell under 30 min).
                // 6pm yesterday through noon today, capped at now.
                val noonToday = ZonedDateTime.now(zone).withHour(12).withMinute(0).withSecond(0).withNano(0)
                val nightStart = noonToday.minusHours(18).toInstant()   // 6pm yesterday
                val nightEnd = minOf(now, noonToday.toInstant())        // noon today at the latest
                val sleepWindow = TimeRangeFilter.between(nightStart, nightEnd)
                val sleeps = hc.readRecords(ReadRecordsRequest(SleepSessionRecord::class, sleepWindow)).records
                if (sleeps.isNotEmpty()) {
                    val core = ArrayList<Pair<Instant, Instant>>()
                    val deep = ArrayList<Pair<Instant, Instant>>()
                    val rem = ArrayList<Pair<Instant, Instant>>()
                    val unspecified = ArrayList<Pair<Instant, Instant>>()
                    val awake = ArrayList<Pair<Instant, Instant>>()
                    // clip to the night: Health Connect returns any record OVERLAPPING
                    // the window, so an unclipped one straddling 6pm would donate its
                    // whole duration to last night's total
                    fun clip(a: Instant, b: Instant): Pair<Instant, Instant>? {
                        val s2 = if (a.isAfter(nightStart)) a else nightStart
                        val e2 = if (b.isBefore(nightEnd)) b else nightEnd
                        return if (e2.isAfter(s2)) Pair(s2, e2) else null
                    }
                    for (s in sleeps) {
                        if (s.stages.isEmpty()) {
                            clip(s.startTime, s.endTime)?.let { unspecified.add(it) }
                        } else for (st in s.stages) {
                            val iv = clip(st.startTime, st.endTime) ?: continue
                            when (st.stage) {
                                SleepSessionRecord.STAGE_TYPE_DEEP -> deep.add(iv)
                                SleepSessionRecord.STAGE_TYPE_REM -> rem.add(iv)
                                SleepSessionRecord.STAGE_TYPE_LIGHT -> core.add(iv)
                                SleepSessionRecord.STAGE_TYPE_SLEEPING -> unspecified.add(iv)
                                SleepSessionRecord.STAGE_TYPE_AWAKE,
                                SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> awake.add(iv)
                                else -> {} // UNKNOWN / OUT_OF_BED ignored
                            }
                        }
                    }
                    val coreS = unionSeconds(core); val deepS = unionSeconds(deep); val remS = unionSeconds(rem)
                    val staged = coreS + deepS + remS
                    val unspecS = unionSeconds(unspecified)
                    val awakeS = unionSeconds(awake)
                    // Prefer staged data; fall back to unspecified "asleep" when the source
                    // didn't record stages (older watches / third-party trackers).
                    // As a last resort, use in-bed (awake) time discounted at 0.9 (people are
                    // not asleep the whole time they are in bed), marked as estimated.
                    val asleep: Long
                    val sleepEstimated: Boolean
                    if (staged > 0) {
                        asleep = staged
                        sleepEstimated = false
                    } else if (unspecS > 0) {
                        asleep = unspecS
                        sleepEstimated = false
                    } else {
                        asleep = (awakeS * 0.9).toLong()
                        sleepEstimated = awakeS > 0
                    }
                    // Report WHAT the query saw, even when it finds nothing usable, so a
                    // failed sleep read is inspectable in Settings instead of invisible.
                    // Same keys as the iOS sleepDiag so one renderer serves both;
                    // inBedMin is the nearest Health Connect equivalent (awake +
                    // awake-in-bed stages) of iOS's HKCategoryValueSleepAnalysis.inBed.
                    val diag = JSObject()
                    diag.put("window", nightStart.toString().substring(0, 16) + " to " + nightEnd.toString().substring(0, 16))
                    diag.put("samples", sleeps.size)
                    diag.put("inBedMin", Math.round(unionSeconds(awake) / 60.0).toInt())
                    diag.put("stagedMin", Math.round(staged / 60.0).toInt())
                    diag.put("rawAsleepMin", Math.round(asleep / 60.0).toInt())
                    diag.put("err", "")
                    res.put("sleepDiag", diag)
                    if (asleep >= 30 * 60) {
                        val mins = { s: Long -> Math.round(s / 60.0).toInt() }
                        res.put("sleepMin", mins(asleep))
                        res.put("sleepDeepMin", mins(deepS))
                        res.put("sleepRemMin", mins(remS))
                        res.put("sleepCoreMin", mins(coreS))
                        res.put("sleepAwakeMin", mins(unionSeconds(awake)))
                        res.put("sleepStaged", if (staged > 0) 1 else 0)
                        res.put("sleepEstimated", if (sleepEstimated) 1 else 0)
                    }
                }
            } catch (e: Exception) {
                res.put("steps", 0); res.put("activeKcal", 0); res.put("error", e.message ?: "read-failed")
            }
            call.resolve(res)
        }
    }

    private fun today(): String = LocalDate.now().toString() // yyyy-MM-dd

    @PluginMethod
    fun debugWrite(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debugWrite is DEBUG-only")
            return
        }
        if (!sdkAvailable()) {
            val res = JSObject(); res.put("written", false); call.resolve(res); return
        }
        // NOTE: debugWrite requires android.permission.health.WRITE_STEPS and
        // android.permission.health.WRITE_ACTIVE_CALORIES_BURNED, but these are NOT
        // declared in AndroidManifest.xml because they are not part of the store
        // submission and cannot be gated debug-only at manifest level. This method
        // will fail at runtime if called without those permissions granted, which is
        // safe: debug-only code paths are not exposed to release builds and cannot
        // trigger store-submission issues.
        scope.launch {
            try {
                val steps = call.getDouble("steps") ?: 0.0
                val activeKcal = call.getDouble("activeKcal") ?: 0.0
                val now = Instant.now()
                val start = now.minus(Duration.ofHours(1))
                val samples = mutableListOf<androidx.health.connect.client.records.Record>()
                if (steps > 0) {
                    samples.add(StepsRecord(count = steps.toLong(), startTime = start, endTime = now))
                }
                if (activeKcal > 0) {
                    samples.add(ActiveCaloriesBurnedRecord(
                        energy = androidx.health.connect.client.units.Energy.kilocalories(activeKcal),
                        startTime = start,
                        endTime = now
                    ))
                }
                if (samples.isEmpty()) {
                    val res = JSObject(); res.put("written", false); call.resolve(res); return@launch
                }
                try {
                    client().insertRecords(samples)
                    val res = JSObject(); res.put("written", true); call.resolve(res)
                } catch (e: Exception) {
                    val res = JSObject(); res.put("written", false); call.resolve(res)
                }
            } catch (e: Exception) {
                val res = JSObject(); res.put("written", false); call.resolve(res)
            }
        }
    }
}
