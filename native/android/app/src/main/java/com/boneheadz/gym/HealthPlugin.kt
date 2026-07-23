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
            } catch (e: Exception) {
                res.put("steps", 0); res.put("activeKcal", 0); res.put("error", e.message ?: "read-failed")
            }
            call.resolve(res)
        }
    }

    private fun today(): String = LocalDate.now().toString() // yyyy-MM-dd
}
