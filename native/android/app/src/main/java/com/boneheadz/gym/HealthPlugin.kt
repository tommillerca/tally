package com.boneheadz.gym

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
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

    private val readPerms = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class)
    )

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
            } catch (e: Exception) {
                res.put("steps", 0); res.put("activeKcal", 0); res.put("error", e.message ?: "read-failed")
            }
            call.resolve(res)
        }
    }

    private fun today(): String = LocalDate.now().toString() // yyyy-MM-dd
}
