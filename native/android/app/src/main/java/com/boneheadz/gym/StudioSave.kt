package com.boneheadz.gym

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

// Storage Access Framework save picker. No broad storage permission or sharing.
@CapacitorPlugin(name = "StudioSave")
class StudioSave : Plugin() {
    private var pending: ByteArray? = null

    @PluginMethod
    fun saveImage(call: PluginCall) {
        if (pending != null) { call.reject("A Studio save is already open."); return }
        try {
            val encoded = call.getString("base64") ?: error("Missing PNG")
            require(encoded.length <= 24_000_000)
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            require(bytes.size <= 16 * 1024 * 1024)
            require(bytes.take(8) == listOf(137, 80, 78, 71, 13, 10, 26, 10).map { it.toByte() })
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            require(bounds.outWidth == 1080 && bounds.outHeight == 1920 && bounds.outMimeType == "image/png")
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("Invalid PNG")
            bitmap.recycle()
            pending = bytes
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/png"
                putExtra(Intent.EXTRA_TITLE, "boneheadz-studio.png")
                putExtra(Intent.EXTRA_LOCAL_ONLY, true)
            }
            startActivityForResult(call, intent, "imageDestination")
        } catch (e: Exception) {
            pending = null
            call.reject("The Studio image could not be prepared for saving.", e)
        }
    }

    @ActivityCallback
    private fun imageDestination(call: PluginCall?, result: ActivityResult) {
        val bytes = pending
        pending = null
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.resolve(JSObject().put("cancelled", true)); return
        }
        val uri = result.data?.data
        if (uri == null || bytes == null) { call.reject("Save interrupted. Retry from your Studio draft."); return }
        try {
            val stream = context.contentResolver.openOutputStream(uri, "w") ?: error("Cannot open destination")
            stream.use { it.write(bytes); it.flush() }
            call.resolve(JSObject().put("saved", true))
        } catch (e: Exception) {
            call.reject("The image could not be saved. Retry from your Studio draft.", e)
        }
    }
}
